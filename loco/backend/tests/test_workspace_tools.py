"""Test workspace tools"""

import sys
import os

# Ensure we can import from src
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

print(f"Python path: {backend_dir}")
print(f"Current working directory: {os.getcwd()}\n")

try:
    from src.agents.tools.workspace_tools import (
        FileReaderTool,
        FileSearchTool,
        ListDirectoryTool,
        ProposeEditTool
    )
    print("✓ Imports successful\n")
except ImportError as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)

def test_file_reader_tool():
    """Test reading a file"""
    print("📝 Testing FileReaderTool...")
    
    # Create test file in current directory
    test_file = "test_temp.txt"
    test_content = "Hello, World!"
    
    try:
        with open(test_file, 'w') as f:
            f.write(test_content)
        print(f"  Created test file: {test_file}")
        
        # Verify file was created
        with open(test_file, 'r') as f:
            verify_content = f.read()
        print(f"  Verified file contains: '{verify_content}'")
        
        tool = FileReaderTool()
        result = tool._run(test_file)
        
        print(f"  Tool result:\n{result}\n")
        print(f"  Result length: {len(result)} chars")
        print(f"  Looking for: '{test_content}'")
        print(f"  Found: {test_content in result}")
        
        # Check if content is in result (case-insensitive)
        if test_content in result:
            print("  ✓ File reader tool works - content found")
            return True
        else:
            print(f"  ❌ Content not found in result")
            # Show what we got character by character
            print(f"  Result repr: {repr(result)}")
            return False
    
    except Exception as e:
        print(f"  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Cleanup
        if os.path.exists(test_file):
            os.remove(test_file)
            print(f"  Cleaned up test file\n")

def test_file_search_tool():
    """Test searching for files"""
    print("🔍 Testing FileSearchTool...")
    
    try:
        tool = FileSearchTool()
        result = tool._run("*.py", max_results=5)
        
        print(f"  Tool result:\n{result}\n")
        
        if "Found" in result or "No files" in result:
            print("  ✓ File search tool works\n")
            return True
        else:
            print("  ❌ Unexpected result format\n")
            return False
    
    except Exception as e:
        print(f"  ❌ Error: {e}\n")
        return False

def test_list_directory_tool():
    """Test listing directory"""
    print("📁 Testing ListDirectoryTool...")
    
    try:
        tool = ListDirectoryTool()
        result = tool._run(".")
        
        print(f"  Tool result:\n{result}\n")
        
        if "Directory:" in result:
            print("  ✓ List directory tool works\n")
            return True
        else:
            print("  ❌ Unexpected result format\n")
            return False
    
    except Exception as e:
        print(f"  ❌ Error: {e}\n")
        return False

def test_propose_edit_tool():
    """Test proposing an edit"""
    print("✏️  Testing ProposeEditTool...")
    
    try:
        tool = ProposeEditTool()
        result = tool._run(
            file_path="test.py",
            description="Add error handling",
            new_code="try:\n    pass\nexcept Exception as e:\n    print(e)",
            old_code="pass"
        )
        
        print(f"  Tool result:\n{result}\n")
        
        if "APPROVAL_REQUIRED" in result:
            print("  ✓ Propose edit tool works\n")
            return True
        else:
            print("  ❌ Unexpected result format\n")
            return False
    
    except Exception as e:
        print(f"  ❌ Error: {e}\n")
        return False

def main():
    """Run all tests"""
    print("="*70)
    print("🧪 WORKSPACE TOOLS TEST SUITE")
    print("="*70 + "\n")
    
    results = []
    
    try:
        results.append(("FileReaderTool", test_file_reader_tool()))
        results.append(("FileSearchTool", test_file_search_tool()))
        results.append(("ListDirectoryTool", test_list_directory_tool()))
        results.append(("ProposeEditTool", test_propose_edit_tool()))
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Summary
    print("="*70)
    print("SUMMARY")
    print("="*70)
    
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status:10} {name}")
    
    print("="*70)
    
    all_passed = all(result[1] for result in results)
    
    if all_passed:
        print("\n✅ All tests passed!")
        return True
    else:
        print("\n❌ Some tests failed")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
