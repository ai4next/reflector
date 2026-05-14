/**
 * Network status monitoring service.
 *
 * Tracks connectivity state so the app can gracefully handle offline scenarios.
 * Transcription runs locally, so analysis submission is deferred when offline.
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type NetworkStatus = 'online' | 'offline' | 'poor';

type NetworkListener = (status: NetworkStatus) => void;

class NetworkMonitorClass {
  private listeners: Set<NetworkListener> = new Set();
  private currentStatus: NetworkStatus = 'online';
  private unsubscribe: (() => void) | null = null;

  get status(): NetworkStatus {
    return this.currentStatus;
  }

  /** Start monitoring network status */
  start(): void {
    if (this.unsubscribe) return;

    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const newStatus: NetworkStatus = state.isConnected
        ? state.isInternetReachable
          ? 'online'
          : 'poor'
        : 'offline';

      if (newStatus !== this.currentStatus) {
        this.currentStatus = newStatus;
        this.listeners.forEach((fn) => fn(newStatus));
      }
    });
  }

  /** Stop monitoring */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Subscribe to network changes */
  onChange(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current status
    listener(this.currentStatus);
    return () => this.listeners.delete(listener);
  }
}

export const NetworkMonitor = new NetworkMonitorClass();