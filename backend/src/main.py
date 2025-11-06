from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging
from .config import settings
from .models.schemas import CompletionRequest, CompletionResponse, HealthResponse
from .llm.ollama_client import ollama_client
from .utils.error_handler import global_exception_handler, LocoException
from fastapi.middleware.cors import CORSMiddleware
import time
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Loco - Local Code Assistant",
    description="Privacy-first AI coding assistant powered by Ollama",
    version="0.1.0",
    debug=settings.DEBUG
)

app.add_exception_handler(Exception, global_exception_handler)

# Add CORS middleware for VS Code extension communication
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Loco Backend API",
        "version": "0.1.0",
        "docs": "/docs"
    }

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint - verifies Ollama connection"""
    try:
        # Verify Ollama is running and get available models
        await ollama_client.verify_connection()
        models = ollama_client.get_available_models()
        
        return HealthResponse(
            status="ok",
            ollama_available=True,
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
    
    Receives code context and returns AI-generated completion
    """
    start_time = time.time()
    
    logger.info(f"Completion request for {request.language} at {request.filepath}:{request.cursor_line}")
    
    try:
        # Build prompt for code completion
        prompt = build_completion_prompt(
            prefix=request.prefix,
            suffix=request.suffix,
            language=request.language
        )
        
        # Generate completion using Ollama
        completion = await ollama_client.generate_completion(
            prompt=prompt,
            model=settings.OLLAMA_DEFAULT_MODEL,
            temperature=0.1,
            num_predict=512
        )
        
        # Clean up the completion
        cleaned_completion = clean_completion(completion)
        
        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)
        
        logger.info(f"Completion generated in {latency_ms}ms")
        
        return CompletionResponse(
            completion=cleaned_completion,
            # Currently, confidence is hardcoded as 0.85.
            # This placeholder value represents a reasonable default until a real confidence scoring mechanism is implemented.
            # To implement actual confidence scoring, analyze the LLM output or use model-specific metadata.
            confidence=0.85,
            model_used=settings.OLLAMA_DEFAULT_MODEL,
            latency_ms=latency_ms
        )
    
    except Exception as e:
        logger.error(f"Completion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Completion error: {str(e)}")

def build_completion_prompt(prefix: str, suffix: str, language: str) -> str:
    """
    Build a prompt for code completion
    
    Args:
        prefix: Code before cursor
        suffix: Code after cursor
        language: Programming language
        
    Returns:
        str: Formatted prompt
    """
    prompt = f"""You are an expert {language} code completion assistant.

Complete the following {language} code. Generate ONLY the missing code that should appear at the cursor position.

CODE BEFORE CURSOR:
{prefix}

CODE AFTER CURSOR:
{suffix}

INSTRUCTIONS:
1. Analyze the context and understand what code should come next
2. Generate ONLY the missing code, nothing else
3. Match the existing code style and indentation
4. Be concise - generate only what's needed
5. Do NOT include markdown code fences in your response

COMPLETION:"""
    
    return prompt

def clean_completion(text: str) -> str:
    """
    Clean up LLM completion output
    
    Args:
        text: Raw LLM output
        
    Returns:
        str: Cleaned completion
    """
    
    # Preserve whether the raw completion started with a newline
    had_leading_newline = text.startswith("\n")
    
    # Remove markdown code fences and inline backticks while keeping the inner content
    # - Remove triple-backtick markers (e.g. ``` or ```python)
    # - Remove single backticks used for inline code
    text = re.sub(r'```(?:\w+)?', '', text)
    text = re.sub(r'`', '', text)
    
    # Remove leading/trailing whitespace
    text = text.strip()
    
    # If completion started with a newline, restore a single leading newline
    if had_leading_newline and not text.startswith("\n"):
        text = "\n" + text
    
    return text

@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info("🚀 Loco backend starting...")
    logger.info(f"Ollama URL: {settings.OLLAMA_BASE_URL}")
    logger.info(f"Default model: {settings.OLLAMA_DEFAULT_MODEL}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    
    # Verify Ollama connection on startup
    try:
        await ollama_client.verify_connection()
        logger.info("✓ Ollama connection verified")
    except Exception as e:
        logger.warning(f"⚠ Ollama not available: {e}")
        logger.warning("Server will start but completions will fail until Ollama is running")

@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info("👋 Loco backend shutting down...")

from fastapi.responses import StreamingResponse

@app.post("/api/v1/complete/stream")
async def complete_code_stream(request: CompletionRequest):
    """
    Streaming code completion endpoint
    
    Returns tokens as they're generated for real-time UI updates
    """
    logger.info(f"Streaming completion request for {request.language}")
    
    async def generate():
        try:
            prompt = build_completion_prompt(
                prefix=request.prefix,
                suffix=request.suffix,
                language=request.language
            )
            
            async for chunk in ollama_client.stream_completion(
                prompt=prompt,
                model=settings.OLLAMA_DEFAULT_MODEL,
                temperature=0.1,
                num_predict=512
            ):
                # Send each chunk as SSE (Server-Sent Events)
                yield f"data: {chunk}\n\n"
                
            # Send completion signal
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            yield f"data: [ERROR] {str(e)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )