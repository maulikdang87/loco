import pytest
from src.llm.ollama_client import OllamaClient
from src.utils.error_handler import OllamaConnectionError

@pytest.mark.asyncio
async def test_ollama_connection():
    """Test Ollama server connection"""
    client = OllamaClient()
    
    # Should connect successfully
    is_connected = await client.verify_connection()
    assert is_connected == True
    
    # Should have models
    models = client.get_available_models()
    assert len(models) > 0

@pytest.mark.asyncio
async def test_generate_completion():
    """Test basic completion generation"""
    client = OllamaClient()
    await client.verify_connection()
    
    prompt = "Complete this Python function: def add(a, b):\n    "
    completion = await client.generate_completion(prompt)
    
    assert len(completion) > 0
    assert isinstance(completion, str)

@pytest.mark.asyncio
async def test_model_not_found():
    """Test error when model doesn't exist"""
    client = OllamaClient()
    await client.verify_connection()
    
    with pytest.raises(Exception):
        client.get_llm(model="nonexistent-model:latest")
