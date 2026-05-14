/**
 * FunasrModule — Expo native module for FunASR-Nano-2512 on-device STT.
 *
 * Uses ONNX Runtime to run the FunASR-Nano Paraformer model.
 * Audio pipeline: 16kHz mono WAV → Fbank (native) → ONNX inference → text
 * Supports Mandarin Chinese and English.
 */

import { FunasrNativeModule, TranscriptionResult } from './FunasrModule.types';
import { requireNativeModule } from 'expo-modules-core';

let NativeModule: FunasrNativeModule | null = null;

try {
  NativeModule = requireNativeModule('Funasr');
} catch {
  console.warn(
    '[FunasrModule] Native module not available. Using mock for development.',
  );
}

// ─── Mock for development / web ───

class MockFunasrModule implements FunasrNativeModule {
  private loaded = false;
  private modelPath: string | null = null;

  async init(modelDir: string): Promise<boolean> {
    this.loaded = true;
    this.modelPath = modelDir;
    console.log('[FunasrMock] Model loaded from:', modelDir);
    return true;
  }

  async transcribe(
    audioPath: string,
    _options?: { language?: string },
  ): Promise<TranscriptionResult> {
    console.log('[FunasrMock] Transcribing:', audioPath);
    return {
      segments: [
        {
          startTime: 0,
          endTime: 2.0,
          text: '这是来自FunASR-Nano的模拟语音识别结果。',
          confidence: 0.96,
        },
        {
          startTime: 2.0,
          endTime: 4.5,
          text: 'This is a mock FunASR transcription for development.',
          confidence: 0.94,
        },
      ],
      language: _options?.language || 'zh',
      durationMs: 4500,
    };
  }

  async release(): Promise<void> {
    this.loaded = false;
    this.modelPath = null;
    console.log('[FunasrMock] Model released');
  }

  isModelLoaded(): boolean {
    return this.loaded;
  }

  getModelInfo() {
    return {
      loaded: this.loaded,
      modelPath: this.modelPath,
      sampleRate: 16000,
    };
  }
}

const FunasrModule: FunasrNativeModule =
  NativeModule ?? new MockFunasrModule();

export default FunasrModule;