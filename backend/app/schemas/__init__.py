import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    title: Optional[str] = None


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    ended_at: Optional[datetime] = None
    total_duration_seconds: Optional[int] = None


class SegmentResponse(BaseModel):
    id: uuid.UUID
    chunk_id: uuid.UUID
    speaker_label: str
    text: str
    start_time: float
    end_time: float
    confidence: Optional[float] = None


class ChunkResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    chunk_index: int
    status: str
    file_hash: Optional[str] = None
    duration_seconds: Optional[float] = None
    error_message: Optional[str] = None
    processed_at: Optional[datetime] = None
    segments: list[SegmentResponse] = []


class ReflectionResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    chunk_id: Optional[uuid.UUID] = None
    provider_name: str
    model_name: Optional[str] = None
    summary: Optional[str] = None
    key_themes: list = []
    action_items: list = []
    improvement_suggestions: list = []
    sentiment_overview: dict = {}
    tokens_used: Optional[int] = None
    processing_time_ms: Optional[int] = None


class SessionResponse(BaseModel):
    id: uuid.UUID
    title: Optional[str] = None
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    total_duration_seconds: Optional[int] = None
    chunks: list[ChunkResponse] = []
    reflections: list[ReflectionResponse] = []


class SessionListItem(BaseModel):
    id: uuid.UUID
    title: Optional[str] = None
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    total_duration_seconds: Optional[int] = None
    chunk_count: int = 0


class PaginatedSessions(BaseModel):
    items: list[SessionListItem]
    total: int
    offset: int
    limit: int


class ChunkUploadResponse(BaseModel):
    chunk_id: uuid.UUID
    status: str = "uploaded"


class ChunkStatusResponse(BaseModel):
    id: uuid.UUID
    chunk_index: int
    status: str
    error_message: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    gpu_available: bool = False
    gpu_device: Optional[str] = None
    database_connected: bool = False