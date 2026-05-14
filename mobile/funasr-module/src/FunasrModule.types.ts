/**
 * FunASR-Nano native module type definitions.
 */

export interface FunasrSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

export interface TranscriptionResult {
  segments: FunasrSegment[];
  language: string;
  durationMs: number;
}

export interface FunasrModelInfo {
  loaded: boolean;
  modelPath: string | null;
  sampleRate: number;
}

export interface FunasrNativeModule {
  /** Load FunASR-Nano ONNX model from given directory */
  init(modelDir: string): Promise<boolean>;

  /** Transcribe a WAV audio file (16kHz mono PCM) */
  transcribe(
    audioPath: string,
    options?: { language?: string },
  ): Promise<TranscriptionResult>;

  /** Release the model from memory */
  release(): Promise<void>;

  /** Check if model is loaded */
  isModelLoaded(): boolean;

  /** Get model info */
  getModelInfo(): FunasrModelInfo;
}