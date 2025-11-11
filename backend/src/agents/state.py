from typing import TypedDict, Annotated, Sequence, Literal
from langchain_core.messages import BaseMessage
from operator import add

class AgentState(TypedDict):
    """
    Shared state for multi-agent system
    Inspired by Cursor's context-aware agent architecture
    """
    # Conversation history
    messages: Annotated[Sequence[BaseMessage], add]
    
    # Current task classification
    task_type: Literal["completion", "debug", "documentation", "explain", "refactor", "general"]
    
    # Code context
    current_file: str
    cursor_position: dict  # {line, column}
    selected_code: str
    surrounding_context: str  # 20 lines before/after
    
    # File references
    open_files: list[dict]  # Files user has open
    recent_edits: list[dict]  # Edit history
    
    # AST and semantic info
    parsed_ast: dict | None
    symbols: list[dict]  # Functions, classes, variables
    imports: list[str]
    
    # Git context
    git_diff: str | None
    recent_commits: list[str]
    
    # Linter/errors
    errors: list[dict]
    warnings: list[dict]
    
    # Agent routing
    next_agent: str
    routing_reason: str
    
    # Final output
    response: str
    confidence: float
