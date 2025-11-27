import pytest
from src.agents.debug_agent import debug_agent
from src.agents.documentation_agent import documentation_agent
from src.agents.explain_agent import explain_agent
from src.agents.refactor_agent import refactor_agent
from src.agents.supervisor import supervisor

@pytest.mark.asyncio
async def test_debug_agent():
    """Test debug agent with sample error"""
    state = {
        "errors": [{"message": "NameError: name 'x' is not defined"}],
        "selected_code": "def test():\n    print(x)\n",
        "surrounding_context": "",
        "current_file": "test.py"
    }
    
    result = await debug_agent.debug(state)
    
    assert "response" in result
    assert len(result["response"]) > 50
    print("\n✓ Debug agent response:", result["response"][:200])

@pytest.mark.asyncio
async def test_documentation_agent():
    """Test documentation agent"""
    state = {
        "selected_code": "def calculate_sum(numbers):\n    return sum(numbers)\n",
        "current_file": "utils.py"
    }
    
    # Fixed method name
    result = await documentation_agent.generate_documentation(state)
    
    assert "response" in result
    response_lower = result["response"].lower()
    has_doc_keywords = any(keyword in response_lower for keyword in [
        "args:", "parameters:", "returns:", "description", "calculate_sum", "function"
    ])
    assert has_doc_keywords, f"Response doesn't look like documentation: {result['response'][:200]}"
    print("\n✓ Documentation response:", result["response"][:200])

@pytest.mark.asyncio
async def test_explain_agent():
    """Test explain agent"""
    state = {
        "selected_code": "list(map(lambda x: x**2, range(10)))",
        "current_file": "script.py",
        "surrounding_context": ""
    }
    
    result = await explain_agent.explain(state)
    
    assert "response" in result
    assert len(result["response"]) > 50
    print("\n✓ Explain agent response:", result["response"][:200])

@pytest.mark.asyncio
async def test_refactor_agent():
    """Test refactor agent"""
    state = {
        "selected_code": """def process_data(data):
    result = []
    for item in data:
        if item > 0:
            result.append(item * 2)
    return result""",
        "current_file": "processor.py"
    }
    
    result = await refactor_agent.refactor(state)
    
    assert "response" in result
    response_lower = result["response"].lower()
    has_refactor_keywords = any(keyword in response_lower for keyword in [
        "refactor", "improve", "comprehension", "code", "suggest", "process_data"
    ])
    assert has_refactor_keywords, f"Response doesn't look like refactoring: {result['response'][:200]}"
    print("\n✓ Refactor response:", result["response"][:200])

@pytest.mark.asyncio
async def test_supervisor_routing():
    """Test supervisor agent routing"""
    
    # Test 1: Debug routing
    state = {
        "messages": [type('obj', (object,), {'content': 'why is this failing? error in code'})()],
        "errors": [{"message": "TypeError"}],
        "selected_code": "x = 1 + '2'"
    }
    
    result = await supervisor.route(state)
    assert result["next_agent"] == "debug", f"Expected 'debug', got '{result['next_agent']}'"
    print("\n✓ Debug routing:", result["routing_reason"])
    
    # Test 2: Explain routing
    state = {
        "messages": [type('obj', (object,), {'content': 'explain what this code does'})()],
        "selected_code": "def foo(): pass"
    }
    
    result = await supervisor.route(state)
    assert result["next_agent"] == "explain", f"Expected 'explain', got '{result['next_agent']}'"
    print("\n✓ Explain routing:", result["routing_reason"])
    
    # Test 3: Documentation routing
    state = {
        "messages": [type('obj', (object,), {'content': 'add docstring to this function'})()],
        "selected_code": "def bar(): pass"
    }
    
    result = await supervisor.route(state)
    assert result["next_agent"] == "documentation", f"Expected 'documentation', got '{result['next_agent']}'"
    print("\n✓ Documentation routing:", result["routing_reason"])
    
    # Test 4: Refactor routing
    state = {
        "messages": [type('obj', (object,), {'content': 'improve this code'})()],
        "selected_code": "def baz(): pass"
    }
    
    result = await supervisor.route(state)
    assert result["next_agent"] == "refactor", f"Expected 'refactor', got '{result['next_agent']}'"
    print("\n✓ Refactor routing:", result["routing_reason"])

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
