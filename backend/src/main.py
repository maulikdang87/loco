from typing import Optional
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import logging
import time
from .config import settings, PROVIDER_MODELS
from .models.schemas import CompletionRequest, CompletionResponse, HealthResponse
from .llm.ollama_client import ollama_client
from .llm.llm_manager import llm_manager
from .agents.code_completion_agent import completion_agent
from .utils.error_handler import global_exception_handler
from pydantic import BaseModel
from src.agents.graph import agent_graph, AgentState
from langchain_core.messages import HumanMessage

class ChatRequest(BaseModel):
    message: str
    code: Optional[str] = None
    language: Optional[str] = None
    context: Optional[str] = None

class ChatResponse(BaseModel):
    message: str
    code: Optional[str] = None

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

@app.post("/api/v1/configure")
async def configure_settings(settings_update: dict = Body(...)):
    """
    Endpoint to update loco settings dynamically.
    Note: This endpoint is for future use. Currently settings are configured via environment variables.
    """
    logger.info(f"Settings update requested: {settings_update}")
    return {
        "message": "Settings update received. Note: Dynamic settings updates are not fully implemented yet.",
        "current_settings": {
            "default_provider": settings.DEFAULT_PROVIDER,
            "available_providers": llm_manager.list_available_providers()
        }
    }

@app.post("/api/v1/chat/{provider}")
async def chat(
    provider: str,
    request: dict
):
    """
    Chat endpoint with dynamic model and provider support.
    """
    logger.info(f"Chat request with provider: {provider}")
    logger.info(f"Request payload: {request}")

    available_providers = llm_manager.list_available_providers()
    if provider not in available_providers:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    try:
        # Get model from request or use provider's default model
        model = request.get("model")
        
        # Validate that the model belongs to the provider
        # If the model doesn't match the provider's patterns, use provider default
        if model:
            provider_models = PROVIDER_MODELS.get(provider, {})
            valid_models = list(provider_models.values())
            
            # Check if it's a valid model for this provider
            # For ollama, models contain ":" (e.g., "qwen2.5-coder:7b")
            # For groq, models contain "llama" or "mixtral"
            # For gemini, models start with "gemini"
            # For openai, models start with "gpt"
            is_valid = False
            if provider == "ollama" and ":" in model:
                is_valid = True
            elif provider == "groq" and ("llama" in model.lower() or "mixtral" in model.lower()):
                is_valid = True
            elif provider == "gemini" and model.startswith("gemini"):
                is_valid = True
            elif provider == "openai" and model.startswith("gpt"):
                is_valid = True
            
            if not is_valid:
                logger.warning(f"Model '{model}' doesn't match provider '{provider}'. Using default.")
                model = provider_models.get("balanced") or provider_models.get("fast")
        else:
            # Use provider-specific default model
            provider_models = PROVIDER_MODELS.get(provider, {})
            model = provider_models.get("balanced") or provider_models.get("fast")
        
        logger.info(f"Using model: {model}")
        temperature = request.get("temperature", 0.3)

        llm = llm_manager.get_llm(
            provider=provider,
            model=model,
            temperature=temperature,
            max_tokens=2048
        )

        # Extract messages and files
        messages = request.get("messages", []) or []
        files = request.get("files") or []  # Handle None case
        
        # Build context from files
        file_context = ""
        if files and len(files) > 0:
            file_context = "\n\nFile Context:\n"
            for file in files:
                file_name = file.get('name', 'file')
                file_language = file.get('language', '')
                file_content = file.get('content', '')
                if file_content:  # Only add file if it has content
                    file_context += f"\n### {file_name} ({file_language})\n"
                    file_context += f"```{file_language}\n{file_content}\n```\n"
        
        # Build prompt from conversation history
        conversation = ""
        for msg in messages:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            # Skip timestamp if present
            conversation += f"\n{role.upper()}: {content}\n"
        
        # Add file context
        if file_context:
            conversation = file_context + "\n" + conversation
        
        # Generate response
        start_time = time.time()
        llm_response = await llm.ainvoke(conversation + "\nASSISTANT:")
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Handle different response types
        # ChatModels (Groq, OpenAI, Gemini) return AIMessage objects
        # OllamaLLM returns strings directly
        if hasattr(llm_response, 'content'):
            response_text = llm_response.content
        elif isinstance(llm_response, str):
            response_text = llm_response
        else:
            # Fallback: try to convert to string
            response_text = str(llm_response)
        
        return {
            "message": response_text,
            "model_used": f"{provider}:{model or 'default'}",
            "latency_ms": latency_ms
        }
        
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/agent/process")
async def process_with_agent(request: dict):
    """
    Process request through multi-agent system
    
    Automatically routes to appropriate specialized agent
    """
    logger.info("Agent processing request")
    
    try:
        # Build initial state
        initial_state: AgentState = {
            "messages": [HumanMessage(content=request.get("query", ""))],
            "task_type": "",
            "user_query": request.get("query", ""),
            "current_file": request.get("file", ""),
            "selected_code": request.get("code", ""),
            "surrounding_context": request.get("context", ""),
            "cursor_position": request.get("cursor", {}),
            "file_references": request.get("files", []),
            "errors": request.get("errors", []),
            "warnings": request.get("warnings", []),
            "parsed_ast": {},
            "git_diff": "",
            "recent_commits": [],
            "next_agent": "",
            "routing_reason": "",
            "response": "",
            "confidence": 0.0
        }
        
        # Run agent graph
        final_state = await agent_graph.run(initial_state)
        
        return {
            "response": final_state.get("response", ""),
            "agent_used": final_state.get("next_agent", "unknown"),
            "confidence": final_state.get("confidence", 0.0),
            "routing_reason": final_state.get("routing_reason", "")
        }
        
    except Exception as e:
        logger.error(f"Agent processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/agent/debug")
async def debug_code_endpoint(request: dict):
    """
    Debug code endpoint - directly calls debug agent
    """
    logger.info("Debug agent endpoint")
    
    try:
        initial_state: AgentState = {
            "messages": [HumanMessage(content="Debug this code")],
            "task_type": "debug",
            "user_query": "Debug this code",
            "current_file": request.get("file", ""),
            "selected_code": request.get("code", ""),
            "surrounding_context": request.get("context", ""),
            "cursor_position": {},
            "file_references": [],
            "errors": request.get("errors", []),
            "warnings": [],
            "parsed_ast": {},
            "git_diff": "",
            "recent_commits": [],
            "next_agent": "debug",
            "routing_reason": "Direct debug request",
            "response": "",
            "confidence": 0.0
        }
        
        from src.agents.debug_agent import debug_agent
        final_state = await debug_agent.debug(initial_state)
        
        return {
            "response": final_state.get("response", ""),
            "confidence": final_state.get("confidence", 0.0)
        }
        
    except Exception as e:
        logger.error(f"Debug failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/agent/explain")
async def explain_code_endpoint(request: dict):
    """
    Explain code endpoint - directly calls explain agent
    """
    logger.info("Explain agent endpoint")
    
    try:
        initial_state: AgentState = {
            "messages": [HumanMessage(content="Explain this code")],
            "task_type": "explain",
            "user_query": "Explain this code",
            "current_file": request.get("file", ""),
            "selected_code": request.get("code", ""),
            "surrounding_context": request.get("context", ""),
            "cursor_position": {},
            "file_references": [],
            "errors": [],
            "warnings": [],
            "parsed_ast": {},
            "git_diff": "",
            "recent_commits": [],
            "next_agent": "explain",
            "routing_reason": "Direct explain request",
            "response": "",
            "confidence": 0.0
        }
        
        from src.agents.explain_agent import explain_agent
        final_state = await explain_agent.explain(initial_state)
        
        return {
            "response": final_state.get("response", ""),
            "confidence": final_state.get("confidence", 0.0)
        }
        
    except Exception as e:
        logger.error(f"Explain failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/agent/refactor")
async def refactor_code_endpoint(request: dict):
    """
    Refactor code endpoint - directly calls refactor agent
    """
    logger.info("Refactor agent endpoint")
    
    try:
        initial_state: AgentState = {
            "messages": [HumanMessage(content="Refactor this code")],
            "task_type": "refactor",
            "user_query": "Refactor this code",
            "current_file": request.get("file", ""),
            "selected_code": request.get("code", ""),
            "surrounding_context": "",
            "cursor_position": {},
            "file_references": [],
            "errors": [],
            "warnings": [],
            "parsed_ast": {},
            "git_diff": "",
            "recent_commits": [],
            "next_agent": "refactor",
            "routing_reason": "Direct refactor request",
            "response": "",
            "confidence": 0.0
        }
        
        from src.agents.refactor_agent import refactor_agent
        final_state = await refactor_agent.refactor(initial_state)
        
        return {
            "response": final_state.get("response", ""),
            "confidence": final_state.get("confidence", 0.0)
        }
        
    except Exception as e:
        logger.error(f"Refactor failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/agent/document")
async def document_code_endpoint(request: dict):
    """
    Document code endpoint - directly calls documentation agent
    """
    logger.info("Documentation agent endpoint")
    
    try:
        initial_state: AgentState = {
            "messages": [HumanMessage(content="Document this code")],
            "task_type": "documentation",
            "user_query": "Document this code",
            "current_file": request.get("file", ""),
            "selected_code": request.get("code", ""),
            "surrounding_context": "",
            "cursor_position": {},
            "file_references": [],
            "errors": [],
            "warnings": [],
            "parsed_ast": {},
            "git_diff": "",
            "recent_commits": [],
            "next_agent": "documentation",
            "routing_reason": "Direct documentation request",
            "response": "",
            "confidence": 0.0
        }
        
        from src.agents.documentation_agent import documentation_agent
        final_state = await documentation_agent.generate_docs(initial_state)
        
        return {
            "response": final_state.get("response", ""),
            "confidence": final_state.get("confidence", 0.0)
        }
        
    except Exception as e:
        logger.error(f"Documentation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.on_event("shutdown")
async def shutdown_event():
    """Run on shutdown"""
    logger.info("👋 Loco backend shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
