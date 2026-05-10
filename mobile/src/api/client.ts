/**
 * Reflector API client.
 *
 * Wraps fetch with typed methods, error handling, and configurable base URL.
 */

import {
  Session,
  SessionListItem,
  PaginatedSessions,
  ChunkUploadResponse,
  ChunkStatusResponse,
  Reflection,
  HealthResponse,
} from '../types';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, body.detail || `Request failed (${res.status})`);
  }

  return body as T;
}

export const api = {
  // Health
  health(): Promise<HealthResponse> {
    return request('/health');
  },

  // Sessions
  createSession(title?: string): Promise<Session> {
    return request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: title || null }),
    });
  },

  listSessions(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedSessions> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return request(`/sessions${query ? `?${query}` : ''}`);
  },

  getSession(id: string): Promise<Session> {
    return request(`/sessions/${id}`);
  },

  updateSession(id: string, data: Partial<{ title: string; status: string; ended_at: string; total_duration_seconds: number }>): Promise<Session> {
    return request(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteSession(id: string): Promise<void> {
    return request(`/sessions/${id}`, { method: 'DELETE' });
  },

  // Chunks
  async uploadChunk(
    sessionId: string,
    chunkIndex: number,
    audioUri: string,
    checksum?: string,
  ): Promise<ChunkUploadResponse> {
    const formData = new FormData();
    formData.append('audio', {
      uri: audioUri,
      type: 'audio/wav',
      name: `chunk_${chunkIndex}.wav`,
    } as any);
    formData.append('chunk_index', String(chunkIndex));
    if (checksum) formData.append('checksum', checksum);

    const url = `${BASE_URL}/sessions/${sessionId}/chunks`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const body = await res.json();
    if (!res.ok) {
      throw new ApiError(res.status, body.detail || 'Upload failed');
    }
    return body;
  },

  getChunkStatus(sessionId: string, chunkId: string): Promise<ChunkStatusResponse> {
    return request(`/sessions/${sessionId}/chunks/${chunkId}/status`);
  },

  // Transcripts
  getTranscript(sessionId: string, format: 'json' | 'text' = 'json'): Promise<any> {
    return request(`/sessions/${sessionId}/transcript?format=${format}`);
  },

  // Reflections
  getReflections(sessionId: string): Promise<Reflection[]> {
    return request(`/sessions/${sessionId}/reflections`);
  },

  regenerateReflection(sessionId: string): Promise<{ status: string; session_id: string; chunks_queued: number }> {
    return request(`/sessions/${sessionId}/regenerate-reflection`, {
      method: 'POST',
    });
  },
};

export { ApiError }; // re-export for error handling in hooks