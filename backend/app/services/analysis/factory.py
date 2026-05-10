"""AnalysisProvider factory — routes provider names to LangChain-backed instances."""

from typing import Optional

from app.config import settings
from app.services.analysis.base import AnalysisProvider
from app.services.analysis.langchain_provider import LangChainAnalysisProvider


class _ClaudeProvider(LangChainAnalysisProvider):
    def __init__(self):
        super().__init__("claude")


class _OpenAIProvider(LangChainAnalysisProvider):
    def __init__(self):
        super().__init__("openai")


class _OllamaProvider(LangChainAnalysisProvider):
    def __init__(self):
        super().__init__("ollama")


class AnalysisProviderFactory:
    _providers: dict[str, type[AnalysisProvider]] = {}

    @classmethod
    def register(cls, name: str, provider_cls: type[AnalysisProvider]):
        cls._providers[name] = provider_cls

    @classmethod
    def get_provider(cls, name: Optional[str] = None) -> AnalysisProvider:
        provider_name = name or settings.default_analysis_provider
        if provider_name not in cls._providers:
            raise ValueError(
                f"Unknown analysis provider: {provider_name}. "
                f"Available: {list(cls._providers.keys())}"
            )
        return cls._providers[provider_name]()

    @classmethod
    def available_providers(cls) -> list[str]:
        return list(cls._providers.keys())


# Register built-in providers
AnalysisProviderFactory.register("claude", _ClaudeProvider)
AnalysisProviderFactory.register("openai", _OpenAIProvider)
AnalysisProviderFactory.register("ollama", _OllamaProvider)