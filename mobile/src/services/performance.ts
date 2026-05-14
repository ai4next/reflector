/**
 * Performance monitoring utilities.
 *
 * Tracks transcription latency, memory usage, and error rates
 * to help identify performance issues in production.
 */

// ─── Metrics ───

interface Metrics {
  transcriptionCount: number;
  totalTranscriptionTimeMs: number;
  avgTranscriptionTimeMs: number;
  errorCount: number;
  modelLoadTimeMs: number | null;
  peakSegmentCount: number;
}

class PerformanceMonitorClass {
  private metrics: Metrics = {
    transcriptionCount: 0,
    totalTranscriptionTimeMs: 0,
    avgTranscriptionTimeMs: 0,
    errorCount: 0,
    modelLoadTimeMs: null,
    peakSegmentCount: 0,
  };

  private marks: Map<string, number> = new Map();
  private listeners: Set<(m: Metrics) => void> = new Set();

  /** Mark a starting time */
  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  /** Measure elapsed time from a mark and record as transcription */
  measureTranscription(markName: string, segmentCount: number): number {
    const start = this.marks.get(markName);
    if (!start) return 0;

    const elapsed = Date.now() - start;
    this.marks.delete(markName);

    this.metrics.transcriptionCount++;
    this.metrics.totalTranscriptionTimeMs += elapsed;
    this.metrics.avgTranscriptionTimeMs =
      this.metrics.totalTranscriptionTimeMs /
      this.metrics.transcriptionCount;
    this.metrics.peakSegmentCount = Math.max(
      this.metrics.peakSegmentCount,
      segmentCount,
    );

    this.notify();
    return elapsed;
  }

  /** Record an error */
  recordError(): void {
    this.metrics.errorCount++;
    this.notify();
  }

  /** Record model load time */
  recordModelLoadTime(ms: number): void {
    this.metrics.modelLoadTimeMs = ms;
    this.notify();
  }

  /** Get a snapshot of current metrics */
  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  /** Subscribe to metric updates */
  onChange(listener: (m: Metrics) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reset all metrics */
  reset(): void {
    this.metrics = {
      transcriptionCount: 0,
      totalTranscriptionTimeMs: 0,
      avgTranscriptionTimeMs: 0,
      errorCount: 0,
      modelLoadTimeMs: null,
      peakSegmentCount: 0,
    };
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getMetrics();
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

export const PerformanceMonitor = new PerformanceMonitorClass();