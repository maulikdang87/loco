from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from ..llm.llm_manager import llm_manager
from ..tools.ast_parser_tool import ast_parser
from ..tools.file_context_tool import FileContextTool
import logging

logger = logging.getLogger(__name__)

class ExplainAgent:
    """
    Specialized agent for explaining code
    Breaks down complex logic into understandable explanations
    """
    
    def __init__(self, provider: str = "groq", model: str = "llama-3.3-70b-versatile"):
        self.provider = provider
        self.model = model
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", self._get_system_prompt()),
            ("user", "{user_input}")
        ])
    
    def _get_system_prompt(self) -> str:
        """Explain agent system prompt"""
        return """You are an expert code explainer who makes complex code easy to understand.

Your role:
- Explain code in clear, simple language
- Break down complex logic step-by-step
- Highlight important patterns and techniques
- Point out potential issues or improvements
- Use analogies when helpful

Explanation structure:
1. **Overview**: What does this code do? (1-2 sentences)
2. **Step-by-Step Breakdown**: Walk through the logic
3. **Key Concepts**: Important patterns, algorithms, or techniques used
4. **Potential Issues**: Edge cases, performance concerns, or bugs
5. **Suggestions**: How could this be improved? (if applicable)

Guidelines:
- Use plain language, avoid jargon when possible
- Explain WHY not just WHAT
- Include examples or analogies for complex concepts
- Highlight any clever or unusual techniques
- Point out common mistakes or anti-patterns

Target audience: Developers who understand programming basics but may not be familiar with this specific code.

Be thorough but concise. Focus on understanding, not just description."""

    async def explain(self, state: dict) -> dict:
        """
        Explain code in detail
        
        Args:
            state: AgentState with code to explain
            
        Returns:
            Updated state with explanation
        """
        code = state.get("selected_code", "").strip()
        language = state.get("current_file", "").split('.')[-1] or "python"
        surrounding = state.get("surrounding_context", "").strip()
        
        # FIX: Ensure we have code to explain
        if not code:
            state["response"] = "No code provided to explain. Please select code first."
            state["confidence"] = 0.0
            return state
        
        # Build context - CRITICAL: Include code in clear format
        context_parts = [
            f"Explain this {language} code in detail:",
            "",
            "```",
            code,
            "```"
        ]
        
        # Add surrounding context if available
        if surrounding:
            context_parts.extend([
                "",
                "Surrounding context:",
                "```",
                surrounding[:500],  # Limit to 500 chars
                "```"
            ])
        
        # Parse AST for structure
        if language in ['python', 'javascript', 'typescript']:
            try:
                ast_info = ast_parser.parse_code(code, language)
                
                analysis = []
                if ast_info.get("functions"):
                    funcs = ast_info["functions"]
                    analysis.append(f"- Contains {len(funcs)} function(s): {', '.join([f['name'] for f in funcs[:3]])}")
                if ast_info.get("classes"):
                    classes = ast_info["classes"]
                    analysis.append(f"- Contains {len(classes)} class(es): {', '.join([c['name'] for c in classes[:3]])}")
                if ast_info.get("imports"):
                    imports = ast_info["imports"][:3]
                    if imports:
                        analysis.append(f"- Imports: {', '.join(imports)}")
                
                if analysis:
                    context_parts.extend(["", "Code structure:"] + analysis)
                
            except Exception as e:
                logger.warning(f"AST parsing failed: {e}")
        
        user_input = "\n".join(context_parts)
        
        # Get LLM
        llm = llm_manager.get_llm(
            provider=self.provider,
            model=self.model,
            temperature=0.4
        )
        
        # Build chain
        chain = self.prompt | llm | StrOutputParser()
        
        # Generate explanation
        try:
            response = await chain.ainvoke({"user_input": user_input})
            
            state["response"] = response
            state["confidence"] = 0.9
            state["next_agent"] = "explain"  # Preserve agent name
            
        except Exception as e:
            logger.error(f"Explain agent failed: {e}")
            state["response"] = f"Code explanation failed: {e}"
            state["confidence"] = 0.0
        
        return state


# Global instance
explain_agent = ExplainAgent()
