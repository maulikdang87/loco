from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from ..llm.llm_manager import llm_manager
from ..tools.ast_parser_tool import ast_parser
import logging

logger = logging.getLogger(__name__)

class DocumentationAgent:
    """
    Specialized agent for generating documentation
    Creates docstrings, README sections, and code explanations
    """
    
    def __init__(self, provider: str = "groq", model: str = "llama-3.3-70b-versatile"):
        self.provider = provider
        self.model = model
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", self._get_system_prompt()),
            ("user", "{user_input}")
        ])
    
    def _get_system_prompt(self) -> str:
        """Documentation agent system prompt"""
        return """You are an expert technical documentation writer specialized in code documentation.

Your role:
- Generate clear, comprehensive docstrings
- Write documentation that explains WHAT, WHY, and HOW
- Follow language-specific documentation conventions
- Include type hints, parameter descriptions, and examples
- Consider edge cases and important notes

Documentation standards:
Python: Google/NumPy style docstrings
JavaScript/TypeScript: JSDoc format
Java/C++: Javadoc/Doxygen style

For functions, include:
1. Brief description (one line)
2. Detailed explanation (if needed)
3. Parameters with types and descriptions
4. Return value with type and description
5. Raises/Throws (if applicable)
6. Examples (for complex functions)
7. Notes about edge cases or performance

For classes, include:
1. Class purpose and responsibility
2. Attributes with types
3. Methods overview
4. Usage examples
5. Inheritance relationships

Response format:
[Complete, properly formatted docstring]

**Explanation:**
[Brief explanation of the documentation structure and any important notes]

Keep docstrings concise but complete. Focus on clarity and usefulness."""
    
    async def generate_documentation(self, state: dict) -> dict:
        """
        Generate documentation for code
        
        Args:
            state: AgentState with code to document
            
        Returns:
            Updated state with documentation
        """
        code = state.get("selected_code", "").strip()
        language = state.get("current_file", "").split('.')[-1] or "python"
        
        # FIX: Ensure we have code
        if not code:
            state["response"] = "No code provided to document. Please select code first."
            state["confidence"] = 0.0
            return state
        
        # Build context - CRITICAL: Include code clearly
        context_parts = [
            f"Generate comprehensive documentation for this {language} code:",
            "",
            "```",
            code,
            "```"
        ]
        
        # Parse code structure
        if language in ['python', 'javascript', 'typescript']:
            try:
                ast_info = ast_parser.parse_code(code, language)
                
                details = []
                if ast_info.get("functions"):
                    func_names = [f['name'] for f in ast_info['functions']]
                    details.append(f"Functions: {', '.join(func_names)}")
                if ast_info.get("classes"):
                    class_names = [c['name'] for c in ast_info['classes']]
                    details.append(f"Classes: {', '.join(class_names)}")
                
                if details:
                    context_parts.extend(["", "Detected:"] + [f"- {d}" for d in details])
                
            except Exception as e:
                logger.warning(f"AST parsing failed: {e}")
        
        user_input = "\n".join(context_parts)
        
        # Get LLM
        llm = llm_manager.get_llm(
            provider=self.provider,
            model=self.model,
            temperature=0.3
        )
        
        # Build chain
        chain = self.prompt | llm | StrOutputParser()
        
        # Generate documentation
        try:
            response = await chain.ainvoke({"user_input": user_input})
            
            state["response"] = response
            state["confidence"] = 0.85
            state["next_agent"] = "documentation"
            
        except Exception as e:
            logger.error(f"Documentation agent failed: {e}")
            state["response"] = f"Documentation generation failed: {e}"
            state["confidence"] = 0.0
        
        return state



# Global instance
documentation_agent = DocumentationAgent()
