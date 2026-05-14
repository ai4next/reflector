/**
 * Offline queue for deferred analysis submissions.
 *
 * When the device is offline, transcribed segments are queued locally
 * and submitted when connectivity is restored.
 */

import * as FileSystem from 'expo-file-system';
import { NetworkMonitor } from './networkMonitor';
import { api } from '../api/client';
import type { LocalSegment } from '../types';

const QUEUE_FILE = `${FileSystem.documentDirectory}offline_queue.json`;

interface QueuedSubmission {
  id: string;
  sessionId: string;
  chunkIndex: number;
  segments: LocalSegment[];
  language: string;
  createdAt: string;
  retryCount: number;
}

class OfflineQueueClass {
  private queue: QueuedSubmission[] = [];
  private processing = false;
  private loaded = false;

  /** Load persisted queue from disk */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const content = await FileSystem.readAsStringAsync(QUEUE_FILE);
      this.queue = JSON.parse(content);
    } catch {
      this.queue = [];
    }
    this.loaded = true;
  }

  /** Persist queue to disk */
  private async persist(): Promise<void> {
    await FileSystem.writeAsStringAsync(
      QUEUE_FILE,
      JSON.stringify(this.queue),
    );
  }

  /** Add a submission to the queue */
  async enqueue(data: {
    sessionId: string;
    chunkIndex: number;
    segments: LocalSegment[];
    language: string;
  }): Promise<void> {
    await this.ensureLoaded();

    const submission: QueuedSubmission = {
      id: `${data.sessionId}_${data.chunkIndex}_${Date.now()}`,
      ...data,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.queue.push(submission);
    await this.persist();
    console.log(`[OfflineQueue] Enqueued: ${submission.id}`);
  }

  /** Process all pending submissions */
  async process(): Promise<void> {
    if (this.processing || NetworkMonitor.status !== 'online') return;
    this.processing = true;

    try {
      await this.ensureLoaded();
      const remaining: QueuedSubmission[] = [];

      for (const item of this.queue) {
        try {
          await api.submitTranscription({
            sessionId: item.sessionId,
            chunkIndex: item.chunkIndex,
            segments: item.segments,
            language: item.language,
          });
          console.log(`[OfflineQueue] Submitted: ${item.id}`);
        } catch (error) {
          item.retryCount++;
          if (item.retryCount < 5) {
            remaining.push(item);
          } else {
            console.warn(
              `[OfflineQueue] Dropped after 5 retries: ${item.id}`,
            );
          }
        }
      }

      this.queue = remaining;
      await this.persist();
    } finally {
      this.processing = false;
    }
  }

  /** Get queue size */
  async size(): Promise<number> {
    await this.ensureLoaded();
    return this.queue.length;
  }

  /** Clear all queued items */
  async clear(): Promise<void> {
    this.queue = [];
    await this.persist();
  }
}

export const OfflineQueue = new OfflineQueueClass();

// Auto-process when coming back online
NetworkMonitor.onChange((status) => {
  if (status === 'online') {
    OfflineQueue.process();
  }
});