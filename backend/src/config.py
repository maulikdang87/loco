from typing import Optional, Dict, Any, Literal
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Loco Backend Configuration"""
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # Ollama (Local)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "qwen2.5-coder:7b"
    
    # Cloud API Keys
    GROQ_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None  # Gemini
    OPENAI_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    GITHUB_TOKEN: Optional[str] = None
    
    # Model Selection Strategy
    DEFAULT_PROVIDER: Literal["ollama", "groq", "gemini", "openai"] = "ollama"
    USE_LOCAL_FIRST: bool = True  # Try local before cloud
    ENABLE_CLOUD_FALLBACK: bool = False
    USE_LOCAL_ONLY: bool = True
    MAX_LOCAL_CONTEXT: int = 4096
    
    # Performance
    MAX_CONCURRENT_REQUESTS: int = 5
    TIMEOUT_SECONDS: int = 30
    MAX_TOKENS: int = 1024
    TEMPERATURE: float = 0.1
    
    # Caching
    ENABLE_CACHE: bool = True
    REDIS_URL: Optional[str] = None
    
    class Config:
        env_file = ".env"

# Provider-specific model configurations
PROVIDER_MODELS: Dict[str, Dict[str, Any]] = {
    "ollama": {
        "fast": "qwen2.5-coder:7b",
        "balanced": "deepseek-coder-v2:16b",
        "quality": "codestral:22b"
    },
    "groq": {
        "fast": "llama-3.1-8b-instant",
        "balanced": "llama-3.3-70b-versatile",
        "quality": "llama-3.3-70b-versatile"
    },
    "gemini": {
        "fast": "gemini-1.5-flash",
        "balanced": "gemini-1.5-pro",
        "quality": "gemini-1.5-pro"
    },
    "openai": {
        "fast": "gpt-4o-mini",
        "balanced": "gpt-4o",
        "quality": "gpt-4o"
    }
}

# Model-specific configurations (Ollama only)
OLLAMA_MODELS: Dict[str, dict] = {
    "fast": {
        "name": "qwen2.5-coder:7b",
        "temperature": 0.1,
        "max_tokens": 1024,
        "use_case": "inline_completion"
    },
    "balanced": {
        "name": "deepseek-coder-v2:16b",
        "temperature": 0.2,
        "max_tokens": 2048,
        "use_case": "debugging"
    },
    "quality": {
        "name": "codestral:22b",
        "temperature": 0.3,
        "max_tokens": 4096,
        "use_case": "documentation"
    }
}

settings = Settings()
