/**
 * STTService — manages on-device speech-to-text lifecycle using FunASR-Nano-2512.
 *
 * Responsibilities:
 * - Download and cache the FunASR-Nano ONNX model from ModelScope
 * - Manage model loading/unloading via ONNX Runtime
 * - Queue and execute transcription requests
 * - Handle Chinese/English (FunASR-Nano is optimized for both)
 * - Report progress and errors
 */

import * as FileSystem from 'expo-file-system';
import { FunasrModule } from '../../funasr-module';
import type { FunasrSegment, TranscriptionResult } from '../../funasr-module';

// ─── Constants ───

/** FunASR-Nano-2512 model files from ModelScope */
const MODEL_CONFIG = {
  dir: 'funasr-nano-2512',
  files: {
    model: 'model.onnx',
    config: 'config.yaml',
    tokens: 'tokens.txt',
  },
  sourceUrl: 'https://www.modelscope.cn/models/iic/funasr-nano-2512-onnx/resolve/master/',
  size: 15 * 1024 * 1024, // ~15MB (2.5M params, ONNX format)
} as const;

const MODEL_DIR = `${FileSystem.documentDirectory}funasr-models/`;
const MODEL_PATH = `${MODEL_DIR}${MODEL_CONFIG.dir}/`;

// ─── Types ───

export type ModelStatus =
  | { type: 'not_downloaded' }
  | { type: 'downloading'; progress: number }
  | { type: 'ready' }
  | { type: 'error'; message: string };

export type TranscriptionStatus =
  | { type: 'idle' }
  | { type: 'transcribing'; chunkIndex: number }
  | { type: 'completed'; result: LocalTranscriptionResult }
  | { type: 'error'; message: string };

export interface LocalTranscriptionResult {
  segments: FunasrSegment[];
  language: string;
  durationMs: number;
  chunkIndex: number;
}

// ─── Service ───

class STTServiceClass {
  private modelStatus: ModelStatus = { type: 'not_downloaded' };
  private modelListeners: Set<(status: ModelStatus) => void> = new Set();
  private isInitialized = false;

  // ─── Model Management ───

  getModelStatus(): ModelStatus {
    return this.modelStatus;
  }

  onModelStatusChange(listener: (status: ModelStatus) => void): () => void {
    this.modelListeners.add(listener);
    return () => this.modelListeners.delete(listener);
  }

  private setModelStatus(status: ModelStatus): void {
    this.modelStatus = status;
    this.modelListeners.forEach((fn) => fn(status));
  }

  /** Check if model is already downloaded */
  async checkModel(): Promise<ModelStatus> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(MODEL_PATH);
      if (dirInfo.exists) {
        // Verify at least model.onnx exists
        const modelFile = await FileSystem.getInfoAsync(
          `${MODEL_PATH}${MODEL_CONFIG.files.model}`,
        );
        if (modelFile.exists) {
          this.setModelStatus({ type: 'ready' });
          return this.modelStatus;
        }
      }
      this.setModelStatus({ type: 'not_downloaded' });
    } catch {
      this.setModelStatus({ type: 'not_downloaded' });
    }
    return this.modelStatus;
  }

  /** Download the FunASR-Nano model with progress tracking */
  async downloadModel(
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    this.setModelStatus({ type: 'downloading', progress: 0 });

    try {
      // Ensure directory exists
      await FileSystem.makeDirectoryAsync(MODEL_PATH, { intermediates: true });

      // Download model.onnx (main file)
      await this.downloadWithProgress(
        `${MODEL_CONFIG.sourceUrl}${MODEL_CONFIG.files.model}`,
        `${MODEL_PATH}${MODEL_CONFIG.files.model}`,
        (pct) => {
          // model.onnx is the largest file, use its progress as overall
          const overall = pct * 0.85; // model: 85% of weight
          this.setModelStatus({ type: 'downloading', progress: overall });
          onProgress?.(overall);
        },
      );

      // Download config.yaml and tokens.txt
      await this.downloadWithProgress(
        `${MODEL_CONFIG.sourceUrl}${MODEL_CONFIG.files.config}`,
        `${MODEL_PATH}${MODEL_CONFIG.files.config}`,
        (pct) => {
          const overall = 0.85 + pct * 0.10;
          this.setModelStatus({ type: 'downloading', progress: overall });
          onProgress?.(overall);
        },
      );

      await this.downloadWithProgress(
        `${MODEL_CONFIG.sourceUrl}${MODEL_CONFIG.files.tokens}`,
        `${MODEL_PATH}${MODEL_CONFIG.files.tokens}`,
        (pct) => {
          const overall = 0.95 + pct * 0.05;
          this.setModelStatus({ type: 'downloading', progress: overall });
          onProgress?.(overall);
        },
      );

      // Verify
      const modelFile = await FileSystem.getInfoAsync(
        `${MODEL_PATH}${MODEL_CONFIG.files.model}`,
      );
      if (!modelFile.exists) {
        throw new Error('Model file not found after download');
      }

      this.setModelStatus({ type: 'ready' });
      onProgress?.(1.0);
    } catch (error: any) {
      const msg = `FunASR model download failed: ${error.message}`;
      this.setModelStatus({ type: 'error', message: msg });
      throw new Error(msg);
    }
  }

  private async downloadWithProgress(
    url: string,
    dest: string,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    const download = FileSystem.createDownloadResumable(
      url,
      dest,
      {},
      (progress) => {
        const pct =
          progress.totalBytesExpectedToWrite > 0
            ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
            : 0;
        onProgress(Math.min(pct, 1));
      },
    );
    await download.downloadAsync();
  }

  /** Initialize the FunASR-Nano model (load into ONNX Runtime) */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const status = await this.checkModel();
    if (status.type !== 'ready') {
      throw new Error(
        'FunASR model not downloaded. Call downloadModel() first.',
      );
    }

    try {
      const success = await FunasrModule.init(MODEL_PATH);
      if (!success) {
        throw new Error('Failed to initialize FunASR-Nano model');
      }
      this.isInitialized = true;
    } catch (error: any) {
      this.setModelStatus({
        type: 'error',
        message: `FunASR init failed: ${error.message}`,
      });
      throw error;
    }
  }

  /** Unload the model and free memory */
  async release(): Promise<void> {
    try {
      await FunasrModule.release();
    } finally {
      this.isInitialized = false;
    }
  }

  /** Delete the downloaded model files */
  async deleteModel(): Promise<void> {
    await this.release();
    try {
      await FileSystem.deleteAsync(MODEL_PATH, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }
    this.setModelStatus({ type: 'not_downloaded' });
  }

  /** Get required free disk space for model download */
  getRequiredDiskSpace(): number {
    return 30; // ~30MB (model + buffer)
  }

  // ─── Transcription ───

  /** Transcribe a WAV audio file using FunASR-Nano */
  async transcribe(
    audioPath: string,
    options?: {
      language?: string; // 'zh' | 'en' | undefined (auto)
      chunkIndex?: number;
    },
  ): Promise<LocalTranscriptionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      const result = await FunasrModule.transcribe(audioPath, {
        language: options?.language,
      });

      return {
        segments: result.segments,
        language: result.language,
        durationMs: Date.now() - startTime,
        chunkIndex: options?.chunkIndex ?? 0,
      };
    } catch (error: any) {
      throw new Error(`FunASR transcription failed: ${error.message}`);
    }
  }

  /** Check if the model is loaded */
  isLoaded(): boolean {
    return this.isInitialized;
  }
}

// Singleton
export const STTService = new STTServiceClass();