/**
 * Polling service for chunk processing status.
 *
 * Polls the chunk status endpoint every 3 seconds until completed or failed.
 */

import { api } from '../api/client';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes max

export interface PollResult {
  chunkId: string;
  status: string;
  success: boolean;
  error?: string;
}

type PollCallback = (result: PollResult) => void;

/**
 * Poll a single chunk's status until completion.
 */
export async function pollChunkStatus(
  sessionId: string,
  chunkId: string,
  onUpdate?: PollCallback,
): Promise<PollResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    try {
      const status = await api.getChunkStatus(sessionId, chunkId);

      if (status.status === 'completed') {
        const result: PollResult = { chunkId, status: 'completed', success: true };
        onUpdate?.(result);
        return result;
      }

      if (status.status === 'failed') {
        const result: PollResult = {
          chunkId,
          status: 'failed',
          success: false,
          error: status.error_message || 'Processing failed',
        };
        onUpdate?.(result);
        return result;
      }

      // Still processing — report progress
      onUpdate?.({
        chunkId,
        status: status.status,
        success: false,
      });
    } catch (error: any) {
      // Transient error — keep polling
      console.warn('Poll error (transient):', error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Timed out
  const result: PollResult = {
    chunkId,
    status: 'timeout',
    success: false,
    error: 'Processing timed out',
  };
  onUpdate?.(result);
  return result;
}

/**
 * Poll multiple chunks in parallel.
 */
export async function pollChunks(
  sessionId: string,
  chunkIds: string[],
  onUpdate?: PollCallback,
): Promise<PollResult[]> {
  return Promise.all(
    chunkIds.map((id) => pollChunkStatus(sessionId, id, onUpdate)),
  );
}