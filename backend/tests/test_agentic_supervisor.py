#!/usr/bin/env python3
"""Test agentic supervisor"""

import sys
import os
import asyncio

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from src.agents.agentic_supervisor import agentic_supervisor

async def test_simple_exploration():
    """Test agent exploring the codebase"""
    print("="*70)
    print("TEST 1: Simple Codebase Exploration")
    print("="*70 + "\n")
    
    result = await agentic_supervisor.execute_task(
        task="List all Python files in the src directory and tell me what the main.py file does",
        workspace_path=".",
        provider="gemini",
        model="gemini-2.5-flash"
    )
    
    print(f"Success: {result['success']}")
    print(f"\nOutput:\n{result['output']}\n")
    print(f"Steps taken: {len(result['steps'])}")
    
    for i, step in enumerate(result['steps'], 1):
        print(f"\nStep {i}:")
        print(f"  Action: {step['action']}")
        print(f"  Input: {step['input'][:100]}")
        print(f"  Output: {step['output'][:200]}...")
    
    print(f"\nProposed changes: {len(result['proposed_changes'])}")
    
    assert result['success'], "Task should succeed"
    assert len(result['steps']) > 0, "Should have taken some steps"
    
    print("\n✅ Test passed!\n")

async def test_read_and_summarize():
    """Test agent reading and understanding files"""
    print("="*70)
    print("TEST 2: Read and Summarize File")
    print("="*70 + "\n")
    
    result = await agentic_supervisor.execute_task(
        task="Read the requirements.txt file and summarize the key dependencies",
        workspace_path=".",
        provider="gemini",
        model="gemini-2.5-flash"
    )
    
    print(f"Success: {result['success']}")
    print(f"\nOutput:\n{result['output']}\n")
    print(f"Steps: {len(result['steps'])}")
    
    assert result['success']
    print("\n✅ Test passed!\n")

async def test_propose_change():
    """Test agent proposing a code change"""
    print("="*70)
    print("TEST 3: Propose Code Change")
    print("="*70 + "\n")
    
    # Create a test file for the agent to modify
    test_file = "test_code.py"
    with open(test_file, 'w') as f:
        f.write("""def greet(name):
    return "Hello " + name
""")
    
    try:
        result = await agentic_supervisor.execute_task(
            task=f"Add a docstring to the greet function in {test_file}",
            workspace_path=".",
            provider="gemini",
            model="gemini-2.5-flash"
        )
        
        print(f"Success: {result['success']}")
        print(f"\nOutput:\n{result['output']}\n")
        print(f"Proposed changes: {len(result['proposed_changes'])}")
        
        for change in result['proposed_changes']:
            print(f"\nProposed change to: {change['file']}")
            print(f"Description: {change['description']}")
            print(f"New code:\n{change['new_code'][:200]}...")
        
        assert result['success']
        print("\n✅ Test passed!\n")
    
    finally:
        # Cleanup
        if os.path.exists(test_file):
            os.remove(test_file)

async def main():
    """Run all tests"""
    print("\n🧪 AGENTIC SUPERVISOR TEST SUITE\n")
    
    try:
        await test_simple_exploration()
        await test_read_and_summarize()
        await test_propose_change()
        
        print("="*70)
        print("✅ ALL TESTS PASSED!")
        print("="*70)
    
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
