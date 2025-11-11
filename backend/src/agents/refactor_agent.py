from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from ..llm.llm_manager import llm_manager
from ..tools.ast_parser_tool import ast_parser
import logging

logger = logging.getLogger(__name__)

class RefactorAgent:
    """
    Specialized agent for code refactoring
    Suggests improvements, optimizations, and best practices
    """
    
    def __init__(self, provider: str = "groq", model: str = "llama-3.3-70b-versatile"):
        self.provider = provider
        self.model = model
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", self._get_system_prompt()),
            ("user", "{user_input}")
        ])
    
    def _get_system_prompt(self) -> str:
        """Refactor agent system prompt"""
        return """You are an expert software engineer specialized in code refactoring and optimization.

Your role:
- Identify code smells and anti-patterns
- Suggest refactorings for better readability, maintainability, and performance
- Follow language-specific best practices and idioms
- Preserve functionality while improving code quality
- Consider real-world constraints (don't over-engineer)

Refactoring priorities (in order):
1. **Correctness**: Fix actual bugs
2. **Readability**: Make code easier to understand
3. **Maintainability**: Reduce complexity, improve structure
4. **Performance**: Optimize if there's a clear benefit
5. **Best Practices**: Follow language conventions

Common refactorings:
- Extract method/function
- Rename for clarity
- Simplify complex conditionals
- Remove duplication (DRY principle)
- Improve error handling
- Add type hints/annotations
- Replace magic numbers with constants

Response format:
## Issues Found
[List of problems with current code]

## Suggested Refactoring

[Refactored code]


## Changes Made
[Bullet points explaining each change]

## Benefits
[Why this refactoring improves the code]

## Trade-offs
[Any downsides or considerations]

Guidelines:
- Preserve existing functionality exactly
- Make incremental, safe changes
- Explain the reasoning behind each change
- Consider the context (is this production code? a quick script?)
- Don't over-engineer simple code

Be practical and pragmatic."""

    async def refactor(self, state: dict) -> dict:
        """
        Suggest refactorings for code
        
        Args:
            state: AgentState with code to refactor
            
        Returns:
            Updated state with refactoring suggestions
        """
        code = state.get("selected_code", "")
        language = state.get("current_file", "").split('.')[-1] or "python"
        
        # FIX: Build proper context
        context_parts = [
            f"Language: {language}",
            f"\nCode to analyze:\n``````"
        ]
        
        # Add complexity analysis from AST
        if language in ['python', 'javascript', 'typescript']:
            try:
                ast_info = ast_parser.parse_code(code, language)
                
                analysis = []
                if ast_info.get("functions"):
                    funcs = ast_info["functions"]
                    if len(funcs) > 5:
                        analysis.append("- Many functions - consider organizing into modules/classes")
                    
                    # Check for long functions
                    for func in funcs:
                        lines = func.get("end_line", 0) - func.get("start_line", 0)
                        if lines > 50:
                            analysis.append(f"- Function '{func['name']}' is long ({lines} lines)")
                
                if ast_info.get("has_errors"):
                    analysis.append("- ⚠️ Syntax errors detected")
                
                if analysis:
                    context_parts.append("\nCode analysis:\n" + "\n".join(analysis))
                
            except Exception as e:
                logger.warning(f"AST parsing failed: {e}")
        
        # ADD THIS: Explicit instruction
        context_parts.append(f"\nAnalyze the {language} code above and suggest refactorings to improve it.")
        
        user_input = "\n".join(context_parts)
        
        # Get LLM
        llm = llm_manager.get_llm(
            provider=self.provider,
            model=self.model,
            temperature=0.3
        )
        
        # Build chain
        chain = self.prompt | llm | StrOutputParser()
        
        # Generate refactoring
        try:
            response = await chain.ainvoke({"user_input": user_input})
            
            state["response"] = response
            state["confidence"] = 0.8
            state["next_agent"] = "FINISH"
            
        except Exception as e:
            logger.error(f"Refactor agent failed: {e}")
            state["response"] = f"Refactoring analysis failed: {e}"
            state["confidence"] = 0.0
        
        return state

# Global instance
refactor_agent = RefactorAgent()

