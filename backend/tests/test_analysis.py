"""Tests for the analysis provider system — factory + LangChain provider."""

import pytest

from app.services.analysis.base import AnalysisContext, AnalysisResult, AnalysisProvider
from app.services.analysis.factory import AnalysisProviderFactory
from app.services.analysis.langchain_provider import LangChainAnalysisProvider, PROVIDER_REGISTRY, PROVIDER_MODEL_MAP


class MockCustomProvider(AnalysisProvider):
    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock-model"

    async def analyze(self, context: AnalysisContext) -> AnalysisResult:
        return AnalysisResult(
            provider_name=self.provider_name,
            model_name=self.model_name,
            summary="Mock summary",
            key_themes=["theme1"],
            action_items=["action1"],
            improvement_suggestions=["suggestion1"],
            sentiment_overview={"SPEAKER_00": "neutral"},
        )

    async def health_check(self) -> bool:
        return True


@pytest.mark.asyncio
async def test_factory_register_and_get():
    AnalysisProviderFactory.register("mock", MockCustomProvider)
    provider = AnalysisProviderFactory.get_provider("mock")
    assert isinstance(provider, MockCustomProvider)
    assert provider.provider_name == "mock"


@pytest.mark.asyncio
async def test_factory_unknown_provider():
    with pytest.raises(ValueError, match="Unknown analysis provider"):
        AnalysisProviderFactory.get_provider("nonexistent")


@pytest.mark.asyncio
async def test_factory_available_providers():
    providers = AnalysisProviderFactory.available_providers()
    assert "claude" in providers
    assert "openai" in providers
    assert "ollama" in providers


@pytest.mark.asyncio
async def test_langchain_provider_registry():
    assert "claude" in PROVIDER_REGISTRY
    assert "openai" in PROVIDER_REGISTRY
    assert "ollama" in PROVIDER_REGISTRY


@pytest.mark.asyncio
async def test_langchain_provider_init_claude():
    provider = LangChainAnalysisProvider("claude")
    assert provider.provider_name == "claude"
    assert provider.model_name == PROVIDER_MODEL_MAP["claude"]


@pytest.mark.asyncio
async def test_langchain_provider_init_openai():
    provider = LangChainAnalysisProvider("openai")
    assert provider.provider_name == "openai"
    assert provider.model_name == PROVIDER_MODEL_MAP["openai"]


@pytest.mark.asyncio
async def test_langchain_provider_init_ollama():
    provider = LangChainAnalysisProvider("ollama")
    assert provider.provider_name == "ollama"
    assert provider.model_name == PROVIDER_MODEL_MAP["ollama"]


@pytest.mark.asyncio
async def test_langchain_provider_unknown():
    with pytest.raises(ValueError, match="Unknown provider"):
        LangChainAnalysisProvider("unknown")


@pytest.mark.asyncio
async def test_langchain_provider_health_no_key():
    provider = LangChainAnalysisProvider("claude")
    # Without API key, health check should return False
    healthy = await provider.health_check()
    assert healthy is False


@pytest.mark.asyncio
async def test_langchain_provider_analyze_no_key():
    provider = LangChainAnalysisProvider("claude")
    context = AnalysisContext(
        session_id="s1",
        chunk_id="c1",
        transcript_text="Hello world",
        segments=[{"speaker_label": "SPEAKER_00", "text": "Hello world"}],
        speaker_labels=["SPEAKER_00"],
        chunk_index=0,
    )
    result = await provider.analyze(context)
    assert "unavailable" in result.summary.lower()


@pytest.mark.asyncio
async def test_mock_provider_analyze():
    AnalysisProviderFactory.register("mock", MockCustomProvider)
    provider = AnalysisProviderFactory.get_provider("mock")

    context = AnalysisContext(
        session_id="s1",
        chunk_id="c1",
        transcript_text="Hello world",
        segments=[{"speaker_label": "SPEAKER_00", "text": "Hello world"}],
        speaker_labels=["SPEAKER_00"],
        chunk_index=0,
    )
    result = await provider.analyze(context)
    assert result.summary == "Mock summary"
    assert result.key_themes == ["theme1"]
    assert result.action_items == ["action1"]
    assert result.improvement_suggestions == ["suggestion1"]
    assert result.sentiment_overview == {"SPEAKER_00": "neutral"}


@pytest.mark.asyncio
async def test_analysis_dataclass_defaults():
    result = AnalysisResult(
        provider_name="test",
        model_name="test-model",
        summary="Test",
    )
    assert result.key_themes == []
    assert result.action_items == []
    assert result.improvement_suggestions == []
    assert result.sentiment_overview == {}
    assert result.tokens_used is None
    assert result.processing_time_ms is None
    assert result.raw_response is None