from pydantic import BaseModel
from typing import Optional, List

class CompletionRequest(BaseModel):
    """Request model for code completion"""
    prefix: str  # Code before cursor
    suffix: str  # Code after cursor
    language: str  # python, typescript, etc.
    filepath: str  # Current file path
    cursor_line: int
    cursor_column: int
    additional_context: Optional[List[str]] = None

class CompletionResponse(BaseModel):
    """Response model for code completion"""
    completion: str
    confidence: float  # 0.0 - 1.0
    model_used: str  # Which LLM generated it
    latency_ms: int

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    ollama_available: bool
    models_loaded: List[str]
