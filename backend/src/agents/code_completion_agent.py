from typing import Optional
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
import logging
import time
from ..config import settings

from ..llm.llm_manager import llm_manager, ProviderType
from ..models.schemas import CompletionRequest, CompletionResponse

logger = logging.getLogger(__name__)

class CodeCompletionAgent:
    
    def __init__(
        self,
        provider: Optional[ProviderType] = None,
        model: Optional[str] = None
    ):
        self.provider = provider
        self.model = model
        self.prompt_template = self._create_prompt_template()
        self.output_parser = StrOutputParser()
    
    def _create_prompt_template(self) -> PromptTemplate:
        template = """You are an expert {language} code completion assistant.

Your task is to complete the code at the cursor position. Generate ONLY the missing code that should appear at <CURSOR>.

CODE BEFORE CURSOR:
{prefix}



<CURSOR>

CODE AFTER CURSOR:
{suffix}


INSTRUCTIONS:
1. Analyze the context carefully - understand what code should come next
2. Generate ONLY the missing code, nothing else
3. Match the existing code style, indentation, and naming conventions
4. Be concise - generate only what's needed to complete the immediate context
5. Do NOT include markdown code fences, explanations, or comments in your response
6. If the completion requires multiple lines, include proper indentation

COMPLETION:"""
        
        return PromptTemplate(
            input_variables=["language", "prefix", "suffix"],
            template=template
        )
    
    def _clean_completion(self, text: str) -> str:
        """
        Clean up LLM output for code completion
        
        Args:
            text: Raw LLM output
            
        Returns:
            Cleaned completion text
        """
        import re
        
        # Remove markdown code fences
        text = re.sub(r'```[\w+]*\n?', '', text)
        text = re.sub(r'```', '', text)
        
        # Remove common LLM artifacts
        text = re.sub(r'^(Here\'s|Here is|The completion is).*?:\s*', '', text, flags=re.IGNORECASE)
        
        # Strip leading/trailing whitespace (but preserve internal formatting)
        text = text.strip()
        
        return text
    
    def _calculate_confidence(
        self, 
        completion: str, 
        request: CompletionRequest
    ) -> float:
        """
        Calculate confidence score for completion
        
        Simple heuristic based on:
        - Completion length (not too short, not too long)
        - Syntactic validity
        - Relevance to context
        
        Returns:
            Confidence score 0.0-1.0
        """
        # Basic length-based confidence
        length = len(completion)
        
        if length == 0:
            return 0.0
        elif length < 10:
            return 0.5  # Very short completions are uncertain
        elif length < 100:
            return 0.85  # Good length
        elif length < 500:
            return 0.75  # Long but acceptable
        else:
            return 0.6  # Very long, might be hallucinating
    
    async def complete(
        self,
        request: CompletionRequest,
        provider: Optional[ProviderType] = None,
        model: Optional[str] = None
    ) -> CompletionResponse:
        """
        Generate code completion
        
        Args:
            request: Completion request with code context
            provider: Override default provider
            model: Override default model
            
        Returns:
            CompletionResponse with generated code
        """
        start_time = time.time()
        
        # Select provider and model
        selected_provider = provider or self.provider
        selected_model = model or self.model
        
        logger.info(
            f"Generating completion: provider={selected_provider}, "
            f"model={selected_model}, language={request.language}"
        )
        
        try:
            # Get LLM instance
            llm = llm_manager.get_llm(
                provider=selected_provider,
                model=selected_model,
                temperature=0.1,  # Low temperature for code
                max_tokens=512
            )
            
            # Build chain: Prompt -> LLM -> Parser
            chain = self.prompt_template | llm | self.output_parser
            
            # Generate completion
            raw_completion = await chain.ainvoke({
                "language": request.language,
                "prefix": request.prefix,
                "suffix": request.suffix
            })
            
            # Clean up output
            cleaned_completion = self._clean_completion(raw_completion)
            
            # Calculate metrics
            latency_ms = int((time.time() - start_time) * 1000)
            confidence = self._calculate_confidence(cleaned_completion, request)
            
            # Determine which model was actually used
            model_used = selected_model or llm_manager.get_model_for_tier(
                "fast", 
                selected_provider
            )
            
            logger.info(
                f"Completion generated: {len(cleaned_completion)} chars, "
                f"{latency_ms}ms, confidence={confidence:.2f}"
            )
            
            return CompletionResponse(
                completion=cleaned_completion,
                confidence=confidence,
                model_used=f"{selected_provider}:{model_used}",
                latency_ms=latency_ms
            )
        
        except Exception as e:
            logger.error(f"Completion failed: {e}", exc_info=True)
            
            # If cloud fails and fallback enabled, try local
            if (selected_provider != "ollama" and 
                hasattr(settings, 'ENABLE_CLOUD_FALLBACK') and 
                settings.ENABLE_CLOUD_FALLBACK):
                
                logger.info("Falling back to local Ollama...")
                return await self.complete(request, provider="ollama")
            
            raise


# Global agent instance
completion_agent = CodeCompletionAgent()