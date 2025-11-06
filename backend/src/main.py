from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging
from .config import settings
from .models.schemas import CompletionRequest, CompletionResponse, HealthResponse
from .llm.ollama_client import ollama_client
from .llm.llm_manager import llm_manager
from .agents.code_completion_agent import completion_agent
from .utils.error_handler import global_exception_handler

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Loco - Local Code Assistant",
    description="Privacy-first AI coding assistant with flexible model support",
    version="0.2.0",
    debug=settings.DEBUG
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global error handler
app.add_exception_handler(Exception, global_exception_handler)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Loco Backend API",
        "version": "0.2.0",
        "docs": "/docs",
        "providers": llm_manager.list_available_providers()
    }

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    try:
        # Check Ollama if it's the default provider
        if settings.DEFAULT_PROVIDER == "ollama":
            await ollama_client.verify_connection()
            models = ollama_client.get_available_models()
        else:
            models = []
        
        return HealthResponse(
            status="ok",
            ollama_available=bool(models),
            models_loaded=models
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="degraded",
            ollama_available=False,
            models_loaded=[]
        )

@app.post("/api/v1/complete", response_model=CompletionResponse)
async def complete_code(request: CompletionRequest):
    """
    Main code completion endpoint
    Uses LangChain agent with configurable providers
    """
    logger.info(
        f"Completion request: {request.language} at "
        f"{request.filepath}:{request.cursor_line}"
    )
    
    try:
        # Use completion agent (respects config provider)
        result = await completion_agent.complete(request)
        return result
        
    except Exception as e:
        logger.error(f"Completion failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Completion error: {str(e)}"
        )

@app.post("/api/v1/complete/{provider}")
async def complete_with_provider(
    provider: str,
    request: CompletionRequest
):
    """
    Complete code using specific provider
    
    Path params:
        provider: ollama, groq, gemini, or openai
    """
    logger.info(f"Completion with explicit provider: {provider}")
    
    if provider not in ["ollama", "groq", "gemini", "openai"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider}"
        )
    
    try:
        result = await completion_agent.complete(request, provider=provider)
        return result
        
    except Exception as e:
        logger.error(f"Completion failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Completion error: {str(e)}"
        )

@app.get("/api/v1/providers")
async def list_providers():
    """List available LLM providers and their status"""
    return {
        "default_provider": settings.DEFAULT_PROVIDER,
        "available_providers": llm_manager.list_available_providers(),
        "models": {
            "ollama": list(PROVIDER_MODELS.get("ollama", {}).values()),
            "groq": list(PROVIDER_MODELS.get("groq", {}).values()),
            "gemini": list(PROVIDER_MODELS.get("gemini", {}).values()),
            "openai": list(PROVIDER_MODELS.get("openai", {}).values())
        }
    }

@app.on_event("startup")
async def startup_event():
    """Run on startup"""
    logger.info("🚀 Loco backend starting...")
    logger.info(f"Default provider: {settings.DEFAULT_PROVIDER}")
    logger.info(f"Available providers: {llm_manager.list_available_providers()}")
    
    # Verify Ollama if it's being used
    if settings.DEFAULT_PROVIDER == "ollama":
        try:
            await ollama_client.verify_connection()
            logger.info("✓ Ollama connection verified")
        except Exception as e:
            logger.warning(f"⚠ Ollama not available: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Run on shutdown"""
    logger.info("👋 Loco backend shutting down...")

# Import PROVIDER_MODELS for the endpoint
from .config import PROVIDER_MODELS

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
