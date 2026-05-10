/**
 * useRecording — manages the full recording lifecycle.
 *
 * Orchestrates: init → start recording → chunk callback → upload → poll
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { ChunkedRecorder, initAudio } from '../services/recorder';
import { UploadManager } from '../services/uploader';
import { pollChunkStatus } from '../services/poller';
import { useSessionStore } from '../store/useSessionStore';

interface UseRecordingReturn {
  isRecording: boolean;
  sessionId: string | null;
  error: string | null;
  startRecording: (title?: string) => Promise<void>;
  stopRecording: () => Promise<void>;
}

export function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<ChunkedRecorder | null>(null);
  const uploaderRef = useRef<UploadManager | null>(null);
  const currentSessionRef = useRef<string | null>(null);

  const setRecordingStatus = useSessionStore((s) => s.setRecordingStatus);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
    };
  }, []);

  const startRecording = useCallback(async (title?: string) => {
    try {
      setError(null);
      setRecordingStatus({ type: 'recording', sessionId: '', chunkIndex: 0 });

      // Initialize audio system
      await initAudio();

      // Create session on backend
      const session = await api.createSession(title || undefined);
      currentSessionRef.current = session.id;
      setSessionId(session.id);

      // Setup upload manager
      uploaderRef.current = new UploadManager(async (result) => {
        if (result.success) {
          setRecordingStatus({
            type: 'processing',
            sessionId: session.id,
            message: `Chunk ${result.chunkIndex} uploaded, processing...`,
          });

          // Start polling for completion
          await pollChunkStatus(session.id, result.chunkId, (pollResult) => {
            if (pollResult.status === 'completed') {
              setRecordingStatus({
                type: 'recording',
                sessionId: session.id,
                chunkIndex: result.chunkIndex,
              });
            }
          });
        } else {
          console.error('Upload failed:', result.error);
        }
      });

      // Setup recorder
      recorderRef.current = new ChunkedRecorder((chunk) => {
        // Called when a 5-minute chunk is ready
        uploaderRef.current?.enqueue({
          sessionId: session.id,
          chunkIndex: chunk.index,
          uri: chunk.uri,
        });
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
  }, [setRecordingStatus]);

  const stopRecording = useCallback(async () => {
    try {
      recorderRef.current?.stop();
      recorderRef.current = null;
      uploaderRef.current?.clear();
      uploaderRef.current = null;

      setIsRecording(false);

      // Update session status to completed
      if (currentSessionRef.current) {
        await api.updateSession(currentSessionRef.current, {
          status: 'completed',
          ended_at: new Date().toISOString(),
        });

        // Cleanup audio files
        await ChunkedRecorder.cleanupSession(currentSessionRef.current);
      }

      setRecordingStatus({ type: 'idle' });
    } catch (err: any) {
      const msg = err.message || 'Failed to stop recording';
      setError(msg);
    }
  }, [setRecordingStatus]);

  return { isRecording, sessionId, error, startRecording, stopRecording };
}