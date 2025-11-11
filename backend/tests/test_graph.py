import pytest
from src.agents.graph import agent_graph, AgentState
from langchain_core.messages import HumanMessage

@pytest.mark.asyncio
async def test_graph_debug_routing():
    """Test graph routes to debug agent"""
    initial_state: AgentState = {
        "messages": [HumanMessage(content="fix this error")],
        "task_type": "",
        "user_query": "fix this error",
        "current_file": "test.py",
        "selected_code": "x = 1 + '2'",
        "surrounding_context": "",
        "cursor_position": {},
        "file_references": [],
        "errors": [{"message": "TypeError"}],
        "warnings": [],
        "parsed_ast": {},
        "git_diff": "",
        "recent_commits": [],
        "next_agent": "",
        "routing_reason": "",
        "response": "",
        "confidence": 0.0
    }
    
    result = await agent_graph.run(initial_state)
    
    assert result["next_agent"] == "debug"
    assert len(result["response"]) > 0
    print(f"\n✓ Debug routing: {result['routing_reason']}")
    print(f"✓ Response preview: {result['response'][:200]}")

@pytest.mark.asyncio
async def test_graph_explain_routing():
    """Test graph routes to explain agent"""
    initial_state: AgentState = {
        "messages": [HumanMessage(content="explain this code")],
        "task_type": "",
        "user_query": "explain this code",
        "current_file": "script.py",
        "selected_code": "list(map(lambda x: x**2, range(10)))",
        "surrounding_context": "",
        "cursor_position": {},
        "file_references": [],
        "errors": [],
        "warnings": [],
        "parsed_ast": {},
        "git_diff": "",
        "recent_commits": [],
        "next_agent": "",
        "routing_reason": "",
        "response": "",
        "confidence": 0.0
    }
    
    result = await agent_graph.run(initial_state)
    
    assert result["next_agent"] == "explain"
    assert len(result["response"]) > 0
    print(f"\n✓ Explain routing: {result['routing_reason']}")

@pytest.mark.asyncio
async def test_graph_streaming():
    """Test streaming workflow"""
    initial_state: AgentState = {
        "messages": [HumanMessage(content="add docstring")],
        "task_type": "",
        "user_query": "add docstring",
        "current_file": "utils.py",
        "selected_code": "def add(a, b):\n    return a + b",
        "surrounding_context": "",
        "cursor_position": {},
        "file_references": [],
        "errors": [],
        "warnings": [],
        "parsed_ast": {},
        "git_diff": "",
        "recent_commits": [],
        "next_agent": "",
        "routing_reason": "",
        "response": "",
        "confidence": 0.0
    }
    
    states = []
    async for state in agent_graph.stream(initial_state):
        states.append(state)
        print(f"Stream update: {list(state.keys())}")
    
    assert len(states) > 0
    print(f"\n✓ Streamed {len(states)} state updates")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
