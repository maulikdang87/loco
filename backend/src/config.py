from typing import Optional, Dict, Any, Literal
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Loco Backend Configuration"""
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # Ollama (Local) - Note: Uses simulated tool calling, not native support
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3.1:8b"  # Best instruction following for tool simulation
    
    # Cloud API Keys
    GROQ_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None  # Gemini
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
        "fast": "llama3.1:8b",               # 8B - Best instruction following
        "balanced": "qwen2.5-coder:7b",      # 7B - Good coding + structure
        "quality": "llama3.2:3b"             # 3B - Lightweight but capable
    },
    "groq": {
        "fast": "llama-3.1-8b-instant",
        "balanced": "llama-3.3-70b-versatile",
        "quality": "llama-3.3-70b-versatile"
    },
    "gemini": {
        "fast": "gemini-2.5-flash",
        "balanced": "gemini-2.5-flash",
        "quality": "gemini-2.5-flash"
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
        "max_tokens": 2048,
        "use_case": "tool_calling_agent",
        "description": "Best coding model with strong tool calling support"
    },
    "balanced": {
        "name": "llama3.2:3b", 
        "temperature": 0.15,
        "max_tokens": 1536,
        "use_case": "fast_coding",
        "description": "Lightweight model with decent tool support"
    },
    "quality": {
        "name": "codegemma:7b",
        "temperature": 0.2,
        "max_tokens": 2048,
        "use_case": "code_analysis",
        "description": "Google's specialized coding model"
    },
    "alternative": {
        "name": "granite-code:8b",
        "temperature": 0.1,
        "max_tokens": 2048,
        "use_case": "enterprise_coding", 
        "description": "IBM's enterprise coding model with tool support"
    }
}

# Models optimized for structured instruction following (simulated tool calling)
INSTRUCTION_FOLLOWING_MODELS = {
    "llama3.1:8b": {
        "size": "8B",
        "specialization": "instruction following + reasoning", 
        "strengths": "Best at following structured prompts, good reasoning",
        "tool_simulation": "Excellent",
        "install_cmd": "ollama pull llama3.1:8b"
    },
    "qwen2.5-coder:7b": {
        "size": "7B",
        "specialization": "coding analysis",
        "strengths": "Strong code understanding, decent structure",
        "tool_simulation": "Good", 
        "install_cmd": "ollama pull qwen2.5-coder:7b"
    },
    "llama3.2:3b": {
        "size": "3B",
        "specialization": "lightweight general",
        "strengths": "Fast responses, surprisingly good at following formats",
        "tool_simulation": "Fair",
        "install_cmd": "ollama pull llama3.2:3b"
    },
    "gemma2:9b": {
        "size": "9B", 
        "specialization": "Google's general model",
        "strengths": "Strong reasoning, good instruction adherence",
        "tool_simulation": "Good",
        "install_cmd": "ollama pull gemma2:9b"
    }
}

settings = Settings()
