import pytest
from src.agents.code_completion_agent import CodeCompletionAgent
from src.models.schemas import CompletionRequest

@pytest.mark.asyncio
async def test_completion_with_ollama():
    """Test completion using Ollama"""
    agent = CodeCompletionAgent(provider="ollama")
    
    request = CompletionRequest(
        prefix="def add(a, b):\n    ",
        suffix="",
        language="python",
        filepath="test.py",
        cursor_line=1,
        cursor_column=4
    )
    
    result = await agent.complete(request)
    
    assert result.completion is not None
    assert len(result.completion) > 0
    assert result.model_used.startswith("ollama:")
    assert result.latency_ms > 0

@pytest.mark.asyncio
async def test_completion_with_groq():
    """Test completion using Groq (requires API key)"""
    agent = CodeCompletionAgent(provider="groq")
    
    request = CompletionRequest(
        prefix="function multiply(a, b) {\n    ",
        suffix="\n}",
        language="javascript",
        filepath="test.js",
        cursor_line=1,
        cursor_column=4
    )
    
    result = await agent.complete(request)
    
    assert result.completion is not None
    assert "return" in result.completion.lower()
    assert result.model_used.startswith("groq:")

@pytest.mark.asyncio
async def test_multi_provider_consistency():
    """Test that different providers give reasonable completions"""
    request = CompletionRequest(
        prefix="class Circle:\n    def __init__(self, radius):\n        self.radius = radius\n    def area(self):\n        ",
        suffix="",
        language="python",
        filepath="shapes.py",
        cursor_line=4,
        cursor_column=8
    )
    
    # Test with available providers
    providers = ["ollama"]  # Add "groq", "gemini" if you have API keys
    
    for provider in providers:
        agent = CodeCompletionAgent(provider=provider)
        result = await agent.complete(request)
        
        assert "pi" in result.completion.lower() or "3.14" in result.completion
        assert result.confidence > 0.5
