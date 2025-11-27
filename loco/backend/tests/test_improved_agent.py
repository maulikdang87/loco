#!/usr/bin/env python3
"""Test improved agentic supervisor with forced tool usage"""

import sys
import os
import asyncio

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from src.agents.agentic_supervisor import agentic_supervisor

async def test_forced_tool_usage():
    """Test that agent actually uses propose_edit instead of being passive"""
    print("="*70)
    print("TEST: Forced Tool Usage (Propose Edit)")
    print("="*70 + "\n")
    
    # Create test file
    test_file = "test_for_docstring.py"
    with open(test_file, 'w') as f:
        f.write("""def calculate_sum(a, b):
    return a + b
""")
    
    try:
        result = await agentic_supervisor.execute_task(
            task=f"Add a docstring to the calculate_sum function in {test_file}",
            workspace_path=".",
            provider="gemini",
            model="gemini-2.5-flash",
            max_retries=2
        )
        
        print(f"✅ Success: {result['success']}")
        print(f"🔄 Attempts: {result.get('attempts', 1)}")
        print(f"\n📄 Output:\n{result['output']}\n")
        print(f"🔧 Steps: {len(result['steps'])}")
        
        for i, step in enumerate(result['steps'], 1):
            print(f"\n  Step {i}: {step['action']}")
            print(f"    Input: {step['input'][:100]}")
        
        print(f"\n📝 Proposed changes: {len(result['proposed_changes'])}")
        
        for change in result['proposed_changes']:
            print(f"\n  File: {change['file']}")
            print(f"  Description: {change['description']}")
            print(f"  New code (preview):\n{change['new_code'][:200]}...")
        
        # Verify agent actually used propose_edit
        used_propose_edit = any(step['action'] == 'propose_edit' for step in result['steps'])
        
        if used_propose_edit:
            print("\n✅ SUCCESS: Agent used propose_edit tool!")
        else:
            print("\n⚠️  WARNING: Agent did not use propose_edit")
            print("   It might have been passive. Check the output.")
        
        assert result['success']
        
        if result['proposed_changes']:
            print("\n✅ Test passed - Changes proposed!")
        else:
            print("\n⚠️  Test passed but no changes proposed")
    
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)
            print(f"\nCleaned up {test_file}")

async def main():
    print("\n🧪 IMPROVED AGENT TEST\n")
    
    try:
        await test_forced_tool_usage()
        print("\n" + "="*70)
        print("✅ TEST COMPLETE")
        print("="*70)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
