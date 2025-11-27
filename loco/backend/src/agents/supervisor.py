from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from ..llm.llm_manager import llm_manager
from typing import Literal
import logging
import re

logger = logging.getLogger(__name__)

TaskType = Literal["completion", "debug", "documentation", "explain", "refactor", "general"]

class SupervisorAgent:
    """
    Supervisor agent that routes requests to specialized agents
    Implements multi-agent coordination pattern from LangGraph
    """
    
    def __init__(self, provider: str = "groq", model: str = "llama-3.3-70b-versatile"):
        self.provider = provider
        self.model = model
        
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", self._get_system_prompt()),
            ("user", "{user_input}")
        ])
    
    def _get_system_prompt(self) -> str:
        """Supervisor routing system prompt"""
        return """You are a routing supervisor for a multi-agent coding assistant.

Your job: Analyze the user's request and route it to the appropriate specialized agent.

Available agents:
1. **completion** - Code completion and generation
   - Trigger: User wants to complete code, generate new code
   - Examples: "complete this function", "write a function that...", cursor at end of incomplete code

2. **debug** - Error analysis and debugging
   - Trigger: Error messages, bugs, unexpected behavior
   - Examples: "why is this failing?", "fix this error", error message present

3. **documentation** - Generate docs and docstrings
   - Trigger: Requests for documentation, docstrings, comments
   - Examples: "add docstring", "document this", "generate documentation"

4. **explain** - Explain existing code
   - Trigger: Requests to understand or explain code
   - Examples: "explain this code", "what does this do?", "how does this work?"

5. **refactor** - Code improvement and refactoring
   - Trigger: Requests to improve, optimize, or refactor code
   - Examples: "improve this code", "refactor", "make this better", "optimize"

6. **general** - General questions and chat
   - Trigger: General programming questions, discussions
   - Examples: "what is a binary tree?", "explain recursion", "best practices for..."

Routing rules:
- If there's an error message or stack trace → **debug**
- If code is selected and user asks "what" or "how" → **explain**
- If user wants to "add", "generate", or cursor is at end of line → **completion**
- If user wants "docstring", "comment", "document" → **documentation**
- If user wants "improve", "refactor", "optimize" → **refactor**
- Otherwise → **general**

Respond with ONLY the agent name: completion, debug, documentation, explain, refactor, or general

No explanation needed, just the agent name."""

    async def route(self, state: dict) -> dict:
        """
        Route request to appropriate agent
        
        Args:
            state: AgentState dict
            
        Returns:
            Updated state with next_agent set
        """
        # Build context for routing decision
        user_message = state.get("messages", [])[-1].content if state.get("messages") else ""
        has_selection = bool(state.get("selected_code", ""))
        has_errors = bool(state.get("errors", []))
        cursor_at_end = state.get("cursor_position", {}).get("at_end_of_line", False)
        
        # IMPROVED: Simple rule-based routing with keyword detection
        user_lower = user_message.lower()
        
        # Rule-based routing (faster and more reliable)
        if has_errors or any(word in user_lower for word in ["error", "bug", "fix", "failing", "broken", "debug"]):
            state["task_type"] = "debug"
            state["next_agent"] = "debug"
            state["routing_reason"] = "Detected error or debug keywords"
            logger.info("Routed to debug agent (rule-based)")
            return state
        
        if any(word in user_lower for word in ["explain", "what does", "how does", "understand", "clarify"]):
            state["task_type"] = "explain"
            state["next_agent"] = "explain"
            state["routing_reason"] = "Detected explanation request"
            logger.info("Routed to explain agent (rule-based)")
            return state
        
        if any(word in user_lower for word in ["document", "docstring", "comment", "add docs"]):
            state["task_type"] = "documentation"
            state["next_agent"] = "documentation"
            state["routing_reason"] = "Detected documentation request"
            logger.info("Routed to documentation agent (rule-based)")
            return state
        
        if any(word in user_lower for word in ["refactor", "improve", "optimize", "better", "clean up"]):
            state["task_type"] = "refactor"
            state["next_agent"] = "refactor"
            state["routing_reason"] = "Detected refactoring request"
            logger.info("Routed to refactor agent (rule-based)")
            return state
        
        if cursor_at_end or any(word in user_lower for word in ["complete", "finish", "generate", "write"]):
            state["task_type"] = "completion"
            state["next_agent"] = "completion"
            state["routing_reason"] = "Detected completion request"
            logger.info("Routed to completion agent (rule-based)")
            return state
        
        # Fallback to LLM-based routing for complex cases
        context_parts = [f"User message: {user_message}"]
        
        if has_selection:
            context_parts.append("Code is selected")
        
        user_input = "\n".join(context_parts)
        
        # Get fast LLM for routing
        try:
            llm = llm_manager.get_llm(
                provider=self.provider,
                model=self.model,
                temperature=0.0,
                max_tokens=10
            )
            
            # Build chain
            chain = self.prompt | llm | StrOutputParser()
            
            # Get routing decision
            response = await chain.ainvoke({"user_input": user_input})
            
            # Extract agent name
            agent_name = response.strip().lower()
            
            # Validate
            valid_agents = ["completion", "debug", "documentation", "explain", "refactor", "general"]
            if agent_name not in valid_agents:
                # Parse from response
                for agent in valid_agents:
                    if agent in agent_name:
                        agent_name = agent
                        break
                else:
                    agent_name = "general"
            
            state["task_type"] = agent_name
            state["next_agent"] = agent_name
            state["routing_reason"] = f"LLM routed to {agent_name}"
            
            logger.info(f"Routed to agent: {agent_name} (LLM-based)")
            
        except Exception as e:
            logger.error(f"LLM routing failed: {e}, falling back to general")
            state["task_type"] = "general"
            state["next_agent"] = "general"
            state["routing_reason"] = "Routing failed, defaulted to general"
        
        return state


# Global instance
supervisor = SupervisorAgent()
