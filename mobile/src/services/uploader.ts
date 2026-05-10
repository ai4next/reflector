/**
 * Upload manager with retry, queue, and SHA-256 checksum for idempotency.
 */

import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import { api } from '../api/client';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface UploadTask {
  sessionId: string;
  chunkIndex: number;
  uri: string;
}

export interface UploadResult {
  chunkIndex: number;
  chunkId: string;
  success: boolean;
  error?: string;
}

type UploadProgressCallback = (result: UploadResult) => void;

/**
 * Compute SHA-256 checksum of a file for idempotent uploads.
 */
async function computeChecksum(uri: string): Promise<string> {
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    content,
  );
}

/**
 * Upload a single chunk with retry logic.
 */
async function uploadWithRetry(
  task: UploadTask,
  retryCount = 0,
): Promise<UploadResult> {
  try {
    const checksum = await computeChecksum(task.uri);
    const response = await api.uploadChunk(
      task.sessionId,
      task.chunkIndex,
      task.uri,
      checksum,
    );
    return {
      chunkIndex: task.chunkIndex,
      chunkId: response.chunk_id,
      success: true,
    };
  } catch (error: any) {
    if (retryCount < MAX_RETRIES - 1) {
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return uploadWithRetry(task, retryCount + 1);
    }
    return {
      chunkIndex: task.chunkIndex,
      chunkId: '',
      success: false,
      error: error.message || 'Upload failed',
    };
  }
}

/**
 * Upload manager with a queue for sequential chunk uploads.
 */
export class UploadManager {
  private queue: UploadTask[] = [];
  private isProcessing = false;
  private onProgress: UploadProgressCallback;

  constructor(onProgress: UploadProgressCallback) {
    this.onProgress = onProgress;
  }

  /**
   * Enqueue a chunk for upload.
   */
  enqueue(task: UploadTask): void {
    this.queue.push(task);
    this.processQueue();
  }

  /**
   * Enqueue multiple chunks.
   */
  enqueueAll(tasks: UploadTask[]): void {
    this.queue.push(...tasks);
    this.processQueue();
  }

  /**
   * Get remaining queue size.
   */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Clear all pending uploads.
   */
  clear(): void {
    this.queue = [];
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      const result = await uploadWithRetry(task);
      this.onProgress(result);
    }

    this.isProcessing = false;
  }
}