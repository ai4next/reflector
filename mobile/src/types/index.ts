/** Core domain types for Reflector. */

export interface Session {
  id: string;
  title: string | null;
  status: 'recording' | 'processing' | 'completed';
  started_at: string;
  ended_at: string | null;
  total_duration_seconds: number | null;
  chunks: Chunk[];
  reflections: Reflection[];
}

export interface SessionListItem {
  id: string;
  title: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_duration_seconds: number | null;
  chunk_count: number;
}

export interface PaginatedSessions {
  items: SessionListItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface Chunk {
  id: string;
  session_id: string;
  chunk_index: number;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  file_hash: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  processed_at: string | null;
  segments: Segment[];
}

export interface Segment {
  id: string;
  chunk_id: string;
  speaker_label: string;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number | null;
}

export interface Reflection {
  id: string;
  session_id: string;
  chunk_id: string | null;
  provider_name: string;
  model_name: string | null;
  summary: string | null;
  key_themes: string[];
  action_items: string[];
  improvement_suggestions: string[];
  sentiment_overview: Record<string, string>;
  tokens_used: number | null;
  processing_time_ms: number | null;
}

export interface ChunkUploadResponse {
  chunk_id: string;
  status: string;
}

export interface ChunkStatusResponse {
  id: string;
  chunk_index: number;
  status: string;
  error_message: string | null;
}

export interface HealthResponse {
  status: string;
  gpu_available: boolean;
  gpu_device: string | null;
  database_connected: boolean;
}

export interface RecordingState {
  isRecording: boolean;
  currentChunkIndex: number;
  chunkStartTime: number | null;
  sessionId: string | null;
  error: string | null;
}

export type RecordingStatus =
  | { type: 'idle' }
  | { type: 'recording'; sessionId: string; chunkIndex: number }
  | { type: 'uploading'; sessionId: string; chunkIndex: number }
  | { type: 'processing'; sessionId: string; message: string }
  | { type: 'error'; message: string };