from langgraph.graph import StateGraph, END
from typing import TypedDict, Annotated, Literal
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from operator import add
import logging

from .supervisor import supervisor
from .debug_agent import debug_agent
from .documentation_agent import documentation_agent
from .explain_agent import explain_agent
from .refactor_agent import refactor_agent
from .code_completion_agent import completion_agent

logger = logging.getLogger(__name__)

# Agent state definition
class AgentState(TypedDict):
    """Shared state across all agents"""
    # Messages
    messages: Annotated[list[BaseMessage], add]
    
    # Task info
    task_type: str
    user_query: str
    
    # Code context
    current_file: str
    selected_code: str
    surrounding_context: str
    cursor_position: dict
    
    # File references
    file_references: list[dict]
    
    # Errors/Warnings
    errors: list[dict]
    warnings: list[dict]
    
    # AST info
    parsed_ast: dict
    
    # Git context
    git_diff: str
    recent_commits: list[str]
    
    # Routing
    next_agent: str
    routing_reason: str
    executed_agent: str  # Track which agent actually processed the request
    
    # Output
    response: str
    confidence: float


class LocoAgentGraph:
    """
    Multi-agent orchestration using LangGraph
    Routes requests through supervisor to specialized agents
    """
    
    def __init__(self):
        self.graph = self._build_graph()
    
    def _build_graph(self) -> StateGraph:
        """
        Build LangGraph workflow
        
        Flow:
        START → Supervisor → [Agent] → END
        """
        # Create graph
        workflow = StateGraph(AgentState)
        
        # Add nodes (agents)
        workflow.add_node("supervisor", self._supervisor_node)
        workflow.add_node("debug", self._debug_node)
        workflow.add_node("documentation", self._documentation_node)
        workflow.add_node("explain", self._explain_node)
        workflow.add_node("refactor", self._refactor_node)
        workflow.add_node("completion", self._completion_node)
        workflow.add_node("general", self._general_node)
        
        # Set entry point
        workflow.set_entry_point("supervisor")
        
        # Add conditional edges from supervisor to specialized agents
        workflow.add_conditional_edges(
            "supervisor",
            self._route_to_agent,
            {
                "debug": "debug",
                "documentation": "documentation",
                "explain": "explain",
                "refactor": "refactor",
                "completion": "completion",
                "general": "general",
                "FINISH": END
            }
        )
        
        # All agents end after execution
        workflow.add_edge("debug", END)
        workflow.add_edge("documentation", END)
        workflow.add_edge("explain", END)
        workflow.add_edge("refactor", END)
        workflow.add_edge("completion", END)
        workflow.add_edge("general", END)
        
        return workflow.compile()
    
    # Node functions
    
    async def _supervisor_node(self, state: AgentState) -> AgentState:
        """Supervisor node - routes to appropriate agent"""
        logger.info("🎯 Supervisor routing request...")
        result = await supervisor.route(state)
        # Preserve the routing decision for later reference
        result["executed_agent"] = result.get("next_agent", "general")
        return result
    
    async def _debug_node(self, state: AgentState) -> AgentState:
        """Debug agent node"""
        logger.info("🐛 Debug agent processing...")
        state["executed_agent"] = "debug"
        result = await debug_agent.debug(state)
        # Preserve which agent was executed
        result["next_agent"] = "debug"
        return result
    
    async def _documentation_node(self, state: AgentState) -> AgentState:
        """Documentation agent node"""
        logger.info("📝 Documentation agent processing...")
        state["executed_agent"] = "documentation"
        result = await documentation_agent.generate_documentation(state)
        result["next_agent"] = "documentation"
        return result
    
    async def _explain_node(self, state: AgentState) -> AgentState:
        """Explain agent node"""
        logger.info("💡 Explain agent processing...")
        state["executed_agent"] = "explain"
        result = await explain_agent.explain(state)
        result["next_agent"] = "explain"
        return result
    
    async def _refactor_node(self, state: AgentState) -> AgentState:
        """Refactor agent node"""
        logger.info("♻️ Refactor agent processing...")
        state["executed_agent"] = "refactor"
        result = await refactor_agent.refactor(state)
        result["next_agent"] = "refactor"
        return result
    
    async def _completion_node(self, state: AgentState) -> AgentState:
        """Completion agent node"""
        logger.info("⚡ Completion agent processing...")
        state["executed_agent"] = "completion"
        # Use existing completion agent
        from ..models.schemas import CompletionRequest
        
        request = CompletionRequest(
            prefix=state.get("surrounding_context", ""),
            suffix="",
            language=state.get("current_file", "").split('.')[-1] or "python",
            filepath=state.get("current_file", ""),
            cursor_line=state.get("cursor_position", {}).get("line", 0),
            cursor_column=state.get("cursor_position", {}).get("column", 0)
        )
        
        result = await completion_agent.complete(request)
        
        if result:
            state["response"] = result.completion
            state["confidence"] = result.confidence
        else:
            state["response"] = "Completion generation failed"
            state["confidence"] = 0.0
        
        state["next_agent"] = "completion"
        return state
    
    async def _general_node(self, state: AgentState) -> AgentState:
        """General chat node - handles non-code questions"""
        logger.info("💬 General agent processing...")
        state["executed_agent"] = "general"
        
        from ..llm.llm_manager import llm_manager
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_core.output_parsers import StrOutputParser
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful programming assistant. Answer the user's question clearly and concisely."),
            ("user", "{query}")
        ])
        
        llm = llm_manager.get_llm(provider="groq", temperature=0.5)
        chain = prompt | llm | StrOutputParser()
        
        try:
            response = await chain.ainvoke({"query": state.get("user_query", "")})
            state["response"] = response
            state["confidence"] = 0.7
        except Exception as e:
            logger.error(f"General agent failed: {e}")
            state["response"] = f"I encountered an error: {e}"
            state["confidence"] = 0.0
        
        state["next_agent"] = "general"
        return state
    
    def _route_to_agent(self, state: AgentState) -> str:
        """Route to next agent based on supervisor's decision"""
        next_agent = state.get("next_agent", "general")
        logger.info(f"📍 Routing to: {next_agent}")
        return next_agent
    
    async def run(self, initial_state: AgentState) -> AgentState:
        """
        Run the multi-agent workflow
        
        Args:
            initial_state: Initial state with user query
            
        Returns:
            Final state with response
        """
        logger.info("🚀 Starting multi-agent workflow...")
        
        try:
            # Run graph
            final_state = await self.graph.ainvoke(initial_state)
            
            logger.info(f"✅ Workflow complete. Agent: {final_state.get('next_agent')}")
            return final_state
            
        except Exception as e:
            logger.error(f"❌ Workflow failed: {e}", exc_info=True)
            return {
                **initial_state,
                "response": f"Workflow error: {e}",
                "confidence": 0.0
            }
    
    async def stream(self, initial_state: AgentState):
        """
        Stream workflow execution step-by-step
        
        Yields:
            State updates as agents process
        """
        logger.info("🌊 Starting streaming workflow...")
        
        try:
            async for state in self.graph.astream(initial_state):
                yield state
        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            yield {
                **initial_state,
                "response": f"Streaming error: {e}",
                "confidence": 0.0
            }


# Global graph instance
agent_graph = LocoAgentGraph()
