from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AnalysisContext:
    session_id: str
    chunk_id: str
    transcript_text: str
    segments: list[dict]
    speaker_labels: list[str]
    chunk_index: int
    language: str = "zh"


@dataclass
class AnalysisResult:
    provider_name: str
    model_name: str
    summary: str
    key_themes: list[str] = field(default_factory=list)
    action_items: list[str] = field(default_factory=list)
    improvement_suggestions: list[str] = field(default_factory=list)
    sentiment_overview: dict = field(default_factory=dict)
    tokens_used: Optional[int] = None
    processing_time_ms: Optional[int] = None
    raw_response: Optional[str] = None


class AnalysisProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        ...

    @abstractmethod
    async def analyze(self, context: AnalysisContext) -> AnalysisResult:
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...