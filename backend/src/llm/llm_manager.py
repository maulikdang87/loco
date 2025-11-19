from typing import Optional, Literal, Union
from langchain_ollama import OllamaLLM
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_core.language_models import BaseLanguageModel
import logging

from ..config import settings, PROVIDER_MODELS
from ..utils.error_handler import ModelNotFoundError

logger = logging.getLogger(__name__)

ProviderType = Literal["ollama", "groq", "gemini", "openai"]

class LLMManager:
    """
    Unified manager for multiple LLM providers
    Supports Ollama (local), Groq, Gemini, and OpenAI
    """
    
    def __init__(self):
        self.default_provider = settings.DEFAULT_PROVIDER
        self._validate_api_keys()
    
    def _validate_api_keys(self):
        """Warn if API keys are missing for enabled providers"""
        if self.default_provider == "groq" and not settings.GROQ_API_KEY:
            logger.warning("GROQ_API_KEY not set. Groq will not be available.")
        if self.default_provider == "gemini" and not settings.GEMINI_API_KEY:
            logger.warning("GOOGLE_API_KEY not set. Gemini will not be available.")
        if self.default_provider == "openai" and not settings.OPENAI_API_KEY:
            logger.warning("OPENAI_API_KEY not set. OpenAI will not be available.")
    
    def get_llm(
        self,
        provider: Optional[ProviderType] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        api_keys: Optional[dict] = None,
        **kwargs
    ) -> BaseLanguageModel:
        """
        Get configured LLM from any provider
        
        Args:
            provider: Which provider to use (ollama/groq/gemini/openai)
            model: Specific model name (optional, uses defaults)
            temperature: Sampling temperature (0.0-1.0)
            max_tokens: Maximum tokens to generate
            api_keys: Optional dict of API keys from VS Code settings
            **kwargs: Provider-specific parameters
            
        Returns:
            Configured LangChain LLM instance
            
        Raises:
            ModelNotFoundError: If provider/model not available
        """
        provider = provider or self.default_provider
        temperature = temperature if temperature is not None else settings.TEMPERATURE
        max_tokens = max_tokens if max_tokens is not None else settings.MAX_TOKENS
        api_keys = api_keys or {}
        
        logger.info(f"Creating LLM: provider={provider}, model={model}")
        
        if provider == "ollama":
            return self._get_ollama_llm(model, temperature, max_tokens, **kwargs)
        elif provider == "groq":
            return self._get_groq_llm(model, temperature, max_tokens, api_keys, **kwargs)
        elif provider == "gemini":
            return self._get_gemini_llm(model, temperature, max_tokens, api_keys, **kwargs)
        elif provider == "openai":
            return self._get_openai_llm(model, temperature, max_tokens, api_keys, **kwargs)
        else:
            raise ModelNotFoundError(f"Unknown provider: {provider}")
    
    def _get_ollama_llm(
        self, 
        model: Optional[str], 
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> OllamaLLM:
        """Create Ollama LLM instance"""
        model_name = model or PROVIDER_MODELS["ollama"]["fast"]
        
        return OllamaLLM(
            base_url=settings.OLLAMA_BASE_URL,
            model=model_name,
            temperature=temperature,
            num_predict=max_tokens,
            num_ctx=kwargs.get("num_ctx", 4096),
            **kwargs
        )
    
    def _get_groq_llm(
        self,
        model: Optional[str],
        temperature: float,
        max_tokens: int,
        api_keys: dict,
        **kwargs
    ) -> ChatGroq:
        """Create Groq LLM instance"""
        # Use API key from request if provided, otherwise fall back to env variable
        api_key = api_keys.get("groq") or settings.GROQ_API_KEY
        
        if not api_key:
            raise ModelNotFoundError(
                "GROQ_API_KEY not configured. Add to .env file or VS Code settings."
            )
        
        model_name = model or PROVIDER_MODELS["groq"]["fast"]
        
        return ChatGroq(
            groq_api_key=api_key,
            model_name=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
    
    def _get_gemini_llm(
        self,
        model: Optional[str],
        temperature: float,
        max_tokens: int,
        api_keys: dict,
        **kwargs
    ) -> ChatGoogleGenerativeAI:
        """Create Gemini LLM instance"""
        # Use API key from request if provided, otherwise fall back to env variable
        api_key = api_keys.get("gemini") or settings.GEMINI_API_KEY
        
        if not api_key:
            raise ModelNotFoundError(
                "GEMINI_API_KEY not configured. Add to .env file or VS Code settings."
            )
        # Use 'gemini-pro' as default for tool calling
        model_name = model or "gemini-pro"
        # Remove version prefix if present
        if model_name.startswith("models/"):
            model_name = model_name.replace("models/", "")
        return ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=temperature,
            max_output_tokens=max_tokens,
            convert_system_message_to_human=True,
            **kwargs
        )
    
    def _get_openai_llm(
        self,
        model: Optional[str],
        temperature: float,
        max_tokens: int,
        api_keys: dict,
        **kwargs
    ) -> ChatOpenAI:
        """Create OpenAI LLM instance"""
        # Use API key from request if provided, otherwise fall back to env variable
        api_key = api_keys.get("openai") or settings.OPENAI_API_KEY
        
        if not api_key:
            raise ModelNotFoundError(
                "OPENAI_API_KEY not configured. Add to .env file or VS Code settings."
            )
        
        model_name = model or PROVIDER_MODELS["openai"]["fast"]
        
        return ChatOpenAI(
            openai_api_key=api_key,
            model_name=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )
    
    def list_available_providers(self) -> dict:
        """Returns which providers are currently available"""
        print(bool(settings.GROQ_API_KEY))   
        return {
            "ollama": True,  # Assume always available if running
            "groq": bool(settings.GROQ_API_KEY),
            "gemini": bool(settings.GEMINI_API_KEY),
            "openai": bool(settings.OPENAI_API_KEY)
        }
    
    def get_model_for_tier(
        self,
        tier: Literal["fast", "balanced", "quality"],
        provider: Optional[ProviderType] = None
    ) -> str:
        """
        Get recommended model for a performance tier
        
        Args:
            tier: fast/balanced/quality
            provider: Which provider to use
            
        Returns:
            Model name for that tier
        """
        provider = provider or self.default_provider
        return PROVIDER_MODELS[provider][tier]


# Global singleton
llm_manager = LLMManager()
