from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from ..llm.llm_manager import llm_manager
from ..tools.ast_parser_tool import ast_parser
from ..tools.file_context_tool import FileContextTool
import logging

logger = logging.getLogger(__name__)

class DebugAgent:
    """
    Specialized agent for debugging code
    Inspired by Cursor's error analysis capabilities
    """
    
    def __init__(self, provider: str = "groq", model: str = "llama-3.3-70b-versatile"):
        self.provider = provider
        self.model = model
        self.tools = {
            "file_context": FileContextTool(),
            "ast_parser": ast_parser
        }
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", self._get_system_prompt()),
            ("user", "{user_input}")
        ])
    
    def _get_system_prompt(self) -> str:
        """Concise debug agent system prompt"""
        return """You are a debugging assistant. Provide concise fixes.

You have access to:
- Code where error occurred
- Error message and type
- Surrounding code context

Format:
**Problem:** [1 sentence diagnosis]
**Fix:** 
[corrected code]

**Why:** [1 sentence explanation]

Keep it brief and actionable. Focus on the root cause and exact fix."""

    async def debug(self, state: dict) -> dict:
        """
        Debug code based on error and context
        
        Args:
            state: AgentState dict with error info
            
        Returns:
            Updated state with debug response
        """
        # Extract context
        error_message = (
            state.get("errors", [{}])[0].get("message", "Unknown error")
            if state.get("errors")
            else "Unknown error"
        )
        code = state.get("selected_code", "").strip()
        file_content = state.get("surrounding_context", "").strip()
        language = state.get("current_file", "").split('.')[-1] or "python"
        
        # FIX: Ensure we have code to debug
        if not code:
            state["response"] = "No code provided to debug. Please select code first."
            state["confidence"] = 0.0
            return state
        
        # Build context - CRITICAL: Include code clearly
        context_parts = [
            f"Debug this {language} code:",
            "",
            f"Error message: {error_message}",
            "",
            "Code with error:",
            "```",
            code,
            "```"
        ]
        
        # Add surrounding context if available
        if file_content:
            context_parts.extend([
                "",
                "Surrounding context:",
                "```",
                file_content[:500],  # Limit to 500 chars
                "```"
            ])
        
        # Parse AST for deeper understanding
        if code and language in ['python', 'javascript', 'typescript']:
            try:
                ast_info = ast_parser.parse_code(code, language)
                if ast_info.get("has_errors"):
                    context_parts.append("\n⚠️ Syntax errors detected in code")
            except Exception as e:
                logger.warning(f"AST parsing failed: {e}")
        
        user_input = "\n".join(context_parts)
        
        # Get LLM
        llm = llm_manager.get_llm(
            provider=self.provider,
            model=self.model,
            temperature=0.2
        )
        
        # Build chain
        chain = self.prompt | llm | StrOutputParser()
        
        # Generate response
        try:
            response = await chain.ainvoke({"user_input": user_input})
            
            state["response"] = response
            state["confidence"] = 0.9
            state["next_agent"] = "debug"  # Preserve agent name
            
        except Exception as e:
            logger.error(f"Debug agent failed: {e}")
            state["response"] = f"Debug analysis failed: {e}"
            state["confidence"] = 0.0
        
        return state


# Global instance
debug_agent = DebugAgent()
