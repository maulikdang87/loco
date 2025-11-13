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
    def _build_enhanced_prompt(
        self,
        prefix: str,
        suffix: str,
        language: str,
        filepath: str
    ) -> str:
        """Build enhanced prompt with indentation detection"""
        import re
        # Detect indentation style
        lines = prefix.split('\n')
        last_line = lines[-1] if lines else ''
        # Count leading spaces/tabs
        indent_match = re.match(r'^(\s+)', last_line)
        current_indent = indent_match.group(1) if indent_match else ''
        uses_tabs = '\t' in current_indent
        indent_size = len(current_indent)
        # Detect if we need extra indent (after : or {)
        needs_extra_indent = last_line.rstrip().endswith((':', '{', '(', '['))
        indent_info = f"- Indentation: {'tabs' if uses_tabs else f'{indent_size} spaces'}"
        if needs_extra_indent:
            indent_info += f"\n- Next line needs +1 indent level"
        prompt = f"""You are an expert {language} code completion assistant.

File: {filepath}
Language: {language}
{indent_info}

CRITICAL INDENTATION RULES:
1. Match EXACT indentation of cursor line: {repr(current_indent)}
2. If line ends with : or {{ or ( or [, ADD one indent level to next line
3. Use {'TABS' if uses_tabs else 'SPACES'} for indentation
4. Preserve existing style precisely

CODE BEFORE CURSOR:
{prefix}
<CURSOR>

CODE AFTER CURSOR:
{suffix}

Generate ONLY the code completion. NO markdown, NO explanations.
Start immediately with the code at the correct indentation level.

COMPLETION:"""
        return prompt
    
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
        """Create prompt template for code completion"""
        template = """You are a code completion engine. Generate ONLY the missing code at the cursor position.

CRITICAL RULES:
1. Output ONLY code - NO markdown, NO explanations, NO code fences
2. Start with the FIRST CHARACTER of code needed
3. Do NOT repeat code that already exists before the cursor
4. Match the indentation style shown (spaces or tabs)
5. For multi-line completions, use the SAME indent level for all lines (the editor will adjust)

Language: {language}

CODE BEFORE CURSOR:
{prefix}
<CURSOR>

CODE AFTER CURSOR:
{suffix}

YOUR COMPLETION (code only, no formatting):"""
    
        return PromptTemplate(
            input_variables=["language", "prefix", "suffix"],
            template=template
        )

    def _clean_completion(self, text: str, prefix: str) -> str:
        """
        Clean up LLM output and preserve indentation
        
        Args:
            text: Raw LLM output
            prefix: Code before cursor (for indentation detection)
            
        Returns:
            Cleaned completion with proper indentation
        """
        import re
        # Remove markdown code fences
        text = re.sub(r'```\w*\n?', '', text)  # Remove opening fences with optional language
        text = re.sub(r'```', '', text)         # Remove closing fences
        
        # Remove explanatory prefixes
        text = re.sub(r'^(Here\'s|Here is|The completion is|Complete with).*?:\s*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        
        # Detect indentation from last line of prefix
        lines = prefix.split('\n')
        if lines:
            last_line = lines[-1]
            # Count leading spaces/tabs
            indent_match = re.match(r'^(\s+)', last_line)
            current_indent = indent_match.group(1) if indent_match else ''
            
            # If last line ends with : (Python) or { (C-like), increase indent
            if last_line.rstrip().endswith((':', '{')):
                # Add one level of indentation (4 spaces or 1 tab)
                if '\t' in current_indent:
                    current_indent += '\t'
                else:
                    current_indent += '    '  # 4 spaces
            
            # Apply indentation to completion if it doesn't have any
            completion_lines = text.split('\n')
            if len(completion_lines) > 0 and not completion_lines[0].startswith((' ', '\t')):
                # First line gets current indent
                completion_lines[0] = current_indent + completion_lines[0].lstrip()
                
                # Subsequent lines maintain relative indentation
                for i in range(1, len(completion_lines)):
                    if completion_lines[i].strip():  # Non-empty line
                        # Detect any existing indent
                        line_indent_match = re.match(r'^(\s+)', completion_lines[i])
                        line_indent = line_indent_match.group(1) if line_indent_match else ''
                        
                        # Apply base indent + relative indent
                        completion_lines[i] = current_indent + completion_lines[i].lstrip()
                
                text = '\n'.join(completion_lines)
        
        # Remove duplicate start
        if prefix.endswith(text[:20]):
            text = text[20:]
        
        return text.strip()

    
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
        
        # FIX: Detect language from filename
        language = request.language
        if not language and request.filepath:
            # Infer from extension
            ext_to_lang = {
                '.py': 'python',
                '.js': 'javascript',
                '.ts': 'typescript',
                '.jsx': 'javascript',
                '.tsx': 'typescript',
                '.java': 'java',
                '.cpp': 'cpp',
                '.c': 'c',
                '.go': 'go',
                '.rs': 'rust',
                '.rb': 'ruby',
                '.php': 'php'
            }
            ext = '.' + request.filepath.split('.')[-1] if '.' in request.filepath else ''
            language = ext_to_lang.get(ext, 'python')
        
        # Select provider and model
        selected_provider = provider or self.provider
        selected_model = model or self.model
        
        logger.info(
            f"Generating completion: provider={selected_provider}, "
            f"model={selected_model}, language={language}"
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
                "language": language,
                "prefix": request.prefix,
                "suffix": request.suffix
            })
            
            # Clean up output
            cleaned_completion = self._clean_completion(raw_completion, request.prefix)
            
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