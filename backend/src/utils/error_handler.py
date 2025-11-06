from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

class LocoException(Exception):
    """Base exception for Loco errors"""
    pass

class OllamaConnectionError(LocoException):
    """Ollama server not responding"""
    pass

class ModelNotFoundError(LocoException):
    """Requested model not available"""
    pass

async def global_exception_handler(request: Request, exc: Exception):
    """Global error handler for all exceptions"""
    
    if isinstance(exc, OllamaConnectionError):
        logger.error(f"Ollama connection failed: {exc}")
        return JSONResponse(
            status_code=503,
            content={
                "error": "Ollama server not available",
                "message": "Please start Ollama with 'ollama serve'",
            }
        )
    
    if isinstance(exc, ModelNotFoundError):
        logger.error(f"Model not found: {exc}")
        return JSONResponse(
            status_code=404,
            content={
                "error": "Model not available",
                "message": str(exc),
            }
        )
    
    # Generic error
    logger.exception("Unexpected error")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )
