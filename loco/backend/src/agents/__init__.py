from .debug_agent import debug_agent
from .documentation_agent import documentation_agent
from .explain_agent import explain_agent
from .refactor_agent import refactor_agent
from .supervisor import supervisor
from .code_completion_agent import completion_agent  # Your existing agent

# Agent registry for easy access
AGENT_REGISTRY = {
    "debug": debug_agent,
    "documentation": documentation_agent,
    "explain": explain_agent,
    "refactor": refactor_agent,
    "completion": completion_agent,
    "supervisor": supervisor
}

def get_agent(agent_name: str):
    """Get agent by name"""
    return AGENT_REGISTRY.get(agent_name)

__all__ = [
    "debug_agent",
    "documentation_agent", 
    "explain_agent",
    "refactor_agent",
    "completion_agent",
    "supervisor",
    "AGENT_REGISTRY",
    "get_agent"
]
