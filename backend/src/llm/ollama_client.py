from langchain_ollama import OllamaLLM
from typing import Optional, AsyncGenerator
import httpx
import logging
from ..config import settings
from ..utils.error_handler import OllamaConnectionError, ModelNotFoundError

logger = logging.getLogger(__name__)

class OllamaClient:
    """
    Manages Ollama connections and LLM instances
    Handles model verification, streaming, and error recovery
    """
    
    def __init__(
        self, 
        base_url: str = settings.OLLAMA_BASE_URL,
        default_model: str = settings.OLLAMA_DEFAULT_MODEL
    ):
        self.base_url = base_url
        self.default_model = default_model
        self._available_models = []
        
    async def verify_connection(self) -> bool:
        """
        Check if Ollama server is running and accessible
        
        Returns:
            bool: True if Ollama is running
            
        Raises:
            OllamaConnectionError: If connection fails
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/tags",
                    timeout=5.0
                )
                response.raise_for_status()
                
                models_data = response.json()
                self._available_models = [
                    model["name"] for model in models_data.get("models", [])
                ]
                
                logger.info(f"✓ Ollama connected. Models: {self._available_models}")
                return True
                
        except httpx.ConnectError:
            logger.error("Ollama server not running")
            raise OllamaConnectionError(
                "Ollama server not running. Start with: ollama serve"
            )
        except Exception as e:
            logger.error(f"Ollama connection error: {e}")
            raise OllamaConnectionError(f"Failed to connect to Ollama: {str(e)}")
    
    def get_available_models(self) -> list[str]:
        """Returns list of available Ollama models"""
        return self._available_models
    
    def is_model_available(self, model_name: str) -> bool:
        """Check if a specific model is pulled and available"""
        return model_name in self._available_models
    
    def get_llm(
        self, 
        model: Optional[str] = None,
        temperature: float = 0.1,
        num_ctx: int = 4096,
        num_predict: int = 1024
    ) -> OllamaLLM:
        """
        Returns configured LangChain Ollama LLM instance
        
        Args:
            model: Model name (defaults to settings.OLLAMA_DEFAULT_MODEL)
            temperature: Sampling temperature (0.0-1.0)
            num_ctx: Context window size
            num_predict: Max tokens to generate
            
        Returns:
            OllamaLLM: Configured LangChain LLM
            
        Raises:
            ModelNotFoundError: If requested model not available
        """
        model_name = model or self.default_model
        
        if self._available_models and not self.is_model_available(model_name):
            raise ModelNotFoundError(
                f"Model '{model_name}' not found. "
                f"Available: {self._available_models}. "
                f"Pull with: ollama pull {model_name}"
            )
        
        logger.info(f"Creating LLM with model: {model_name}")
        
        return OllamaLLM(
            base_url=self.base_url,
            model=model_name,
            temperature=temperature,
            num_ctx=num_ctx,
            num_predict=num_predict,
        )
    
    async def generate_completion(
        self, 
        prompt: str,
        model: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Generate a single completion (non-streaming)
        
        Args:
            prompt: Input prompt
            model: Model to use
            **kwargs: Additional parameters for get_llm
            
        Returns:
            str: Generated completion
        """
        llm = self.get_llm(model=model, **kwargs)
        
        try:
            response = await llm.ainvoke(prompt)
            logger.info(f"Completion generated: {len(response)} chars")
            return response
            
        except Exception as e:
            logger.error(f"Completion generation failed: {e}")
            raise
    
    async def stream_completion(
        self, 
        prompt: str,
        model: Optional[str] = None,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """
        Stream completion tokens in real-time
        
        Args:
            prompt: Input prompt
            model: Model to use
            **kwargs: Additional parameters for get_llm
            
        Yields:
            str: Token chunks as they're generated
        """
        llm = self.get_llm(model=model, **kwargs)
        
        try:
            async for chunk in llm.astream(prompt):
                yield chunk
                
        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            raise


# Global singleton instance
ollama_client = OllamaClient()
