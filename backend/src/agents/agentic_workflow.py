from langgraph.graph import StateGraph, END
from typing import TypedDict, List
from langchain_core.messages import HumanMessage, AIMessage
from tools.workspace_tools import FileReaderTool, FileSearchTool, CodeEditorTool
from .supervisor import supervisor
from ..llm.llm_manager import llm_manager

class AgentState(TypedDict):
    messages: List
    task: str
    plan: List[str]
    current_step: int
    files_read: List[str]
    proposed_changes: List[dict]
    approved: bool
    agent_logs: List[dict]

class AgenticWorkflow:
    def __init__(self):
        self.tools = [
            FileReaderTool(),
            FileSearchTool(),
            CodeEditorTool()
        ]
        self.graph = self._build_graph()
    
    def _build_graph(self):
        workflow = StateGraph(AgentState)
        
        # Nodes
        workflow.add_node("planner", self.plan_task)
        workflow.add_node("executor", self.execute_step)
        workflow.add_node("reviewer", self.review_changes)
        
        # Edges
        workflow.set_entry_point("planner")
        workflow.add_edge("planner", "executor")
        workflow.add_conditional_edges(
            "executor",
            self.should_continue,
            {
                "continue": "executor",
                "review": "reviewer",
                "end": END
            }
        )
        workflow.add_edge("reviewer", END)
        
        return workflow.compile()
    
    async def plan_task(self, state: AgentState) -> AgentState:
        """Break down task into steps"""
        llm = llm_manager.get_llm(provider="groq", temperature=0.3)
        
        prompt = f"""You are a task planning agent. Break down this task into clear, actionable steps:

Task: {state['task']}

Available tools:
- read_file: Read file contents
- search_files: Find files matching patterns
- edit_code: Propose code changes

Create a step-by-step plan. Each step should use one tool.

Plan:"""
        
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
        # Parse plan (simplified)
        steps = response.content.split('\n')
        steps = [s.strip() for s in steps if s.strip() and s.strip()[0].isdigit()]
        
        state["plan"] = steps
        state["current_step"] = 0
        state["agent_logs"] = [{"type": "plan", "content": steps}]
        
        return state
    
    async def execute_step(self, state: AgentState) -> AgentState:
        """Execute current step"""
        if state["current_step"] >= len(state["plan"]):
            return state
        
        current_step = state["plan"][state["current_step"]]
        
        # Log step
        state["agent_logs"].append({
            "type": "step",
            "title": f"Step {state['current_step'] + 1}",
            "description": current_step
        })
        
        # Execute with tools (simplified - in real implementation, use agent with tools)
        # For now, just increment
        state["current_step"] += 1
        
        return state
    
    def should_continue(self, state: AgentState) -> str:
        """Determine next step"""
        if state["current_step"] < len(state["plan"]):
            return "continue"
        elif state.get("proposed_changes"):
            return "review"
        else:
            return "end"
    
    async def review_changes(self, state: AgentState) -> AgentState:
        """Review and summarize changes"""
        state["agent_logs"].append({
            "type": "summary",
            "title": "Task Complete",
            "description": f"Completed {len(state['plan'])} steps"
        })
        return state
    
    async def run(self, task: str) -> AgentState:
        """Run agentic workflow"""
        initial_state: AgentState = {
            "messages": [],
            "task": task,
            "plan": [],
            "current_step": 0,
            "files_read": [],
            "proposed_changes": [],
            "approved": False,
            "agent_logs": []
        }
        
        return await self.graph.ainvoke(initial_state)

# Global instance
agentic_workflow = AgenticWorkflow()
