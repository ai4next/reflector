/**
 * Zustand store for recording session state.
 *
 * Manages the current recording session lifecycle across screens.
 */

import { create } from 'zustand';
import { RecordingStatus } from '../types';

interface SessionStore {
  // Recording state
  recordingStatus: RecordingStatus;
  setRecordingStatus: (status: RecordingStatus) => void;

  // Session list (cached)
  sessionFilter: string | undefined;
  setSessionFilter: (filter: string | undefined) => void;

  // Error handling
  lastError: string | null;
  clearError: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  recordingStatus: { type: 'idle' },
  setRecordingStatus: (status) => set({ recordingStatus: status }),

  sessionFilter: undefined,
  setSessionFilter: (filter) => set({ sessionFilter: filter }),

  lastError: null,
  clearError: () => set({ lastError: null }),
}));