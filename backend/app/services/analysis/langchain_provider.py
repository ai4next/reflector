"""Unified analysis provider using LangChain ChatModel abstraction.

LangChain provides a unified interface (BaseChatModel) across model providers,
eliminating the need for separate Claude/OpenAI/Ollama implementations.

Supported providers:
  - claude    → ChatAnthropic (langchain-anthropic)
  - openai    → ChatOpenAI (langchain-openai)
  - ollama    → ChatOllama (langchain-ollama)
"""

import json
import logging
import time
from typing import Optional

from app.config import settings
from app.services.analysis.base import AnalysisProvider, AnalysisContext, AnalysisResult
from app.services.analysis.prompts import REFLECTION_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Provider → (package, class) mapping for lazy loading
PROVIDER_REGISTRY: dict[str, tuple[str, str]] = {
    "claude": ("langchain_anthropic", "ChatAnthropic"),
    "openai": ("langchain_openai", "ChatOpenAI"),
    "ollama": ("langchain_ollama", "ChatOllama"),
}

PROVIDER_MODEL_MAP: dict[str, str] = {
    "claude": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "ollama": "llama3",
}


def _get_model_params(provider_name: str) -> dict:
    """Return provider-specific ChatModel init parameters."""
    params: dict = {"temperature": 0.3, "max_tokens": 1024, "timeout": 120}

    if provider_name == "claude":
        params["anthropic_api_key"] = settings.anthropic_api_key
    elif provider_name == "openai":
        params["openai_api_key"] = settings.openai_api_key
    elif provider_name == "ollama":
        params["base_url"] = settings.ollama_base_url
        params["num_predict"] = 1024

    return params


def _instantiate_model(provider_name: str, model_name: Optional[str] = None):
    """Lazy-load and instantiate the LangChain ChatModel for the given provider."""
    if provider_name not in PROVIDER_REGISTRY:
        raise ValueError(
            f"Unknown provider '{provider_name}'. "
            f"Available: {list(PROVIDER_REGISTRY.keys())}"
        )

    pkg, cls_name = PROVIDER_REGISTRY[provider_name]
    mod = __import__(pkg, fromlist=[cls_name])
    ChatModel = getattr(mod, cls_name)

    params = _get_model_params(provider_name)
    actual_model = model_name or PROVIDER_MODEL_MAP.get(provider_name, "claude-sonnet-4-6")
    params["model"] = actual_model

    return ChatModel(**params), actual_model


class LangChainAnalysisProvider(AnalysisProvider):
    """Single provider that delegates to any LangChain-supported model."""

    def __init__(self, provider_name: Optional[str] = None, model_name: Optional[str] = None):
        self._provider = provider_name or settings.default_analysis_provider
        self._model_name = model_name
        self._model, self._resolved_model_name = _instantiate_model(self._provider, self._model_name)

    @property
    def provider_name(self) -> str:
        return self._provider

    @property
    def model_name(self) -> str:
        return self._resolved_model_name

    def _build_messages(self, context: AnalysisContext) -> list:
        from langchain_core.messages import SystemMessage, HumanMessage

        speaker_summary = "\n".join(
            f"[{seg['speaker_label']}]: {seg['text']}"
            for seg in context.segments
        )

        user_content = (
            f"Here is a conversation transcript (chunk {context.chunk_index}):\n\n"
            f"{speaker_summary}\n\n"
            f"Unique speakers: {', '.join(context.speaker_labels)}\n"
            f"Language: {context.language}"
        )

        return [
            SystemMessage(content=REFLECTION_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]

    async def analyze(self, context: AnalysisContext) -> AnalysisResult:
        # Check API key availability
        if not await self.health_check():
            return AnalysisResult(
                provider_name=self.provider_name,
                model_name=self.model_name,
                summary=f"Analysis unavailable: {self._provider} API key not configured",
            )

        from langchain_core.messages import HumanMessage, SystemMessage

        messages = self._build_messages(context)

        start = time.monotonic()
        try:
            response = await self._model.ainvoke(messages)
        except Exception as exc:
            logger.error("LangChain analysis failed (%s): %s", self._provider, exc)
            return AnalysisResult(
                provider_name=self.provider_name,
                model_name=self.model_name,
                summary=f"Analysis unavailable: {exc}",
            )

        elapsed = int((time.monotonic() - start) * 1000)
        raw = response.content if hasattr(response, "content") else str(response)

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {}

        # Token usage (provider-dependent)
        tokens_used = None
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            tokens_used = (
                response.usage_metadata.get("input_tokens", 0)
                + response.usage_metadata.get("output_tokens", 0)
            )
        elif hasattr(response, "response_metadata") and response.response_metadata:
            usage = response.response_metadata.get("usage", {}) or {}
            tokens_used = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

        return AnalysisResult(
            provider_name=self.provider_name,
            model_name=self.model_name,
            summary=parsed.get("summary", ""),
            key_themes=parsed.get("key_themes", []),
            action_items=parsed.get("action_items", []),
            improvement_suggestions=parsed.get("improvement_suggestions", []),
            sentiment_overview=parsed.get("sentiment_overview", {}),
            tokens_used=tokens_used,
            processing_time_ms=elapsed,
            raw_response=raw,
        )

    async def health_check(self) -> bool:
        if self._provider == "claude":
            return bool(settings.anthropic_api_key)
        elif self._provider == "openai":
            return bool(settings.openai_api_key)
        elif self._provider == "ollama":
            return bool(settings.ollama_base_url)
        return False