/**
 * useRecording — manages the full recording lifecycle with on-device STT.
 *
 * Orchestrates: init → start recording → chunk callback → local transcribe → send for analysis
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { ChunkedRecorder, initAudio } from '../services/recorder';
import { STTService } from '../services/sttService';
import { NetworkMonitor } from '../services/networkMonitor';
import { useSessionStore } from '../store/useSessionStore';
import type { ModelStatus, LocalSegment } from '../types';

interface UseRecordingReturn {
  isRecording: boolean;
  sessionId: string | null;
  error: string | null;
  modelStatus: ModelStatus;
  /** Segments from the latest transcribed chunk (for real-time display) */
  latestSegments: LocalSegment[];
  /** Accumulated segments from all chunks */
  allSegments: LocalSegment[];
  latestLanguage: string | null;
  startRecording: (title?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
}

export function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ type: 'not_downloaded' });
  const [latestSegments, setLatestSegments] = useState<LocalSegment[]>([]);
  const [allSegments, setAllSegments] = useState<LocalSegment[]>([]);
  const [latestLanguage, setLatestLanguage] = useState<string | null>(null);

  const recorderRef = useRef<ChunkedRecorder | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const transcribingRef = useRef(false);
  const segmentsAccumulator = useRef<LocalSegment[]>([]);

  const setRecordingStatus = useSessionStore((s) => s.setRecordingStatus);

  // Subscribe to model status
  useEffect(() => {
    const unsub = STTService.onModelStatusChange(setModelStatus);
    STTService.checkModel().then(setModelStatus);
    return unsub;
  }, []);

  // Start network monitoring
  useEffect(() => {
    NetworkMonitor.start();
    return () => NetworkMonitor.stop();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
    };
  }, []);

  /** Transcribe a chunk locally and send text for analysis */
  const processChunk = useCallback(
    async (uri: string, chunkIndex: number, sessionId: string) => {
      if (transcribingRef.current) return;
      transcribingRef.current = true;

      try {
        setRecordingStatus({
          type: 'transcribing',
          sessionId,
          chunkIndex,
        });

        // Run on-device transcription
        const result = await STTService.transcribe(uri, {
          chunkIndex,
          // language: undefined — auto-detect between zh/en
        });

        // Update UI with results
        setLatestSegments(result.segments);
        setLatestLanguage(result.language);

        // Accumulate segments
        segmentsAccumulator.current.push(...result.segments);
        setAllSegments([...segmentsAccumulator.current]);

        // Send transcribed text to backend for AI analysis (if online)
        if (NetworkMonitor.status === 'online') {
          try {
            await api.submitTranscription({
              sessionId,
              chunkIndex,
              segments: result.segments.map((s) => ({
                text: s.text,
                startTime: s.startTime,
                endTime: s.endTime,
                confidence: s.confidence,
              })),
              language: result.language,
            });
          } catch (apiError) {
            console.warn(
              'Failed to submit transcription for analysis, will retry later:',
              apiError,
            );
            // Non-fatal — transcription is already local
          }
        } else {
          console.log('Offline: transcription saved locally, will sync later');
          // In production, queue for later submission
        }

        setRecordingStatus({
          type: 'recording',
          sessionId,
          chunkIndex,
        });
      } catch (err: any) {
        console.error('Transcription failed:', err);
        setRecordingStatus({
          type: 'error',
          message: `Chunk ${chunkIndex} transcription failed: ${err.message}`,
        });
      } finally {
        transcribingRef.current = false;

        // Clean up audio file after processing
        try {
          const { FileSystem } = require('expo-file-system');
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    },
    [setRecordingStatus],
  );

  const startRecording = useCallback(
    async (title?: string) => {
      try {
        setError(null);

        // Ensure model is ready
        const status = await STTService.checkModel();
        setModelStatus(status);
        if (status.type === 'not_downloaded') {
          setError('Please download the speech model first');
          return;
        }
        if (status.type === 'error') {
          setError(`Model error: ${status.message}`);
          return;
        }

        // Initialize FunASR-Nano model
        await STTService.initialize();

        // Reset state
        setLatestSegments([]);
        setAllSegments([]);
        segmentsAccumulator.current = [];
        setLatestLanguage(null);

        setRecordingStatus({
          type: 'recording',
          sessionId: '',
          chunkIndex: 0,
        });

        // Initialize audio system
        await initAudio();

        // Create session on backend (for analysis storage)
        const session = await api.createSession(title || undefined);
        currentSessionRef.current = session.id;
        setSessionId(session.id);

        // Setup recorder
        recorderRef.current = new ChunkedRecorder((chunk) => {
          // When a 5-minute chunk is ready, transcribe it locally
          processChunk(chunk.uri, chunk.index, session.id);
        });

        await recorderRef.current.start();
        setIsRecording(true);
        setRecordingStatus({
          type: 'recording',
          sessionId: session.id,
          chunkIndex: 0,
        });
      } catch (err: any) {
        const msg = err.message || 'Failed to start recording';
        setError(msg);
        setRecordingStatus({ type: 'error', message: msg });
      }
    },
    [setRecordingStatus, processChunk],
  );

  const stopRecording = useCallback(async () => {
    try {
      recorderRef.current?.stop();
      recorderRef.current = null;

      setIsRecording(false);

      // Update session on backend
      if (currentSessionRef.current) {
        await api.updateSession(currentSessionRef.current, {
          status: 'completed',
          ended_at: new Date().toISOString(),
          total_duration_seconds: Math.round(
            segmentsAccumulator.current.reduce(
              (acc, s) => Math.max(acc, s.endTime),
              0,
            ),
          ),
        });

        // Trigger global AI analysis on the full transcript
        if (NetworkMonitor.status === 'online') {
          try {
            await api.triggerGlobalAnalysis(currentSessionRef.current);
          } catch {
            // Non-fatal
          }
        }

        // Cleanup audio files
        await ChunkedRecorder.cleanupSession(currentSessionRef.current);
      }

      // Release FunASR model to free memory
      await STTService.release();

      setRecordingStatus({ type: 'idle' });
    } catch (err: any) {
      const msg = err.message || 'Failed to stop recording';
      setError(msg);
    }
  }, [setRecordingStatus]);

  return {
    isRecording,
    sessionId,
    error,
    modelStatus,
    latestSegments,
    allSegments,
    latestLanguage,
    startRecording,
    stopRecording,
  };
}