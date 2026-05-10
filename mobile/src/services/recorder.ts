/**
 * Audio recording service.
 *
 * Records 5-minute WAV chunks using expo-av.
 * Each chunk is saved to the filesystem with a predictable naming scheme.
 */

import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const CHUNK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SAMPLE_RATE = 44100;

export interface ChunkInfo {
  uri: string;
  index: number;
  durationMs: number;
}

export type ChunkCallback = (chunk: ChunkInfo) => void;

/**
 * Initialize the audio recording system.
 * Must be called once before any recording.
 */
export async function initAudio(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

/**
 * High-level recorder that manages 5-minute chunk lifecycle.
 */
export class ChunkedRecorder {
  private recording: Audio.Recording | null = null;
  private chunkIndex = 0;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private startTimestamp: number = 0;
  private isActive = false;
  private onChunk: ChunkCallback;

  constructor(onChunk: ChunkCallback) {
    this.onChunk = onChunk;
  }

  get isRecording(): boolean {
    return this.isActive;
  }

  get currentChunkIndex(): number {
    return this.chunkIndex;
  }

  /**
   * Start recording. Creates the first chunk immediately.
   */
  async start(): Promise<void> {
    if (this.isActive) return;

    this.isActive = true;
    this.chunkIndex = 0;
    await this.startNewChunk();
  }

  /**
   * Stop recording. Finalizes the current chunk.
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }

    if (this.recording) {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch {
        // May already be unloaded
      }
      this.recording = null;
    }
  }

  private async startNewChunk(): Promise<void> {
    if (!this.isActive) return;

    try {
      this.recording = new Audio.Recording();
      await this.recording.prepareToRecordAsync({
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 16 * SAMPLE_RATE,
        },
        ios: {
          extension: '.wav',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 16 * SAMPLE_RATE,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      });

      await this.recording.startAsync();
      this.startTimestamp = Date.now();

      // Schedule chunk rotation
      this.chunkTimer = setTimeout(async () => {
        await this.finalizeChunk();
        if (this.isActive) {
          this.chunkIndex++;
          await this.startNewChunk();
        }
      }, CHUNK_DURATION_MS);
    } catch (error) {
      console.error('Failed to start recording chunk:', error);
      this.isActive = false;
    }
  }

  private async finalizeChunk(): Promise<void> {
    if (!this.recording) return;

    try {
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      if (uri) {
        const elapsed = Date.now() - this.startTimestamp;
        this.onChunk({
          uri,
          index: this.chunkIndex,
          durationMs: elapsed,
        });
      }
    } catch (error) {
      console.error('Failed to finalize chunk:', error);
    }
  }

  /**
   * Get temporary directory for this session's chunks.
   */
  static getSessionDir(sessionId: string): string {
    return `${FileSystem.cacheDirectory}reflector/${sessionId}`;
  }

  /**
   * Clean up all recorded files for a session.
   */
  static async cleanupSession(sessionId: string): Promise<void> {
    const dir = ChunkedRecorder.getSessionDir(sessionId);
    try {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}