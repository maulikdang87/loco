from langchain.tools import BaseTool
from typing import Optional, Type, List
from pydantic import BaseModel, Field
import os
import glob
import logging

logger = logging.getLogger(__name__)

class FileReaderInput(BaseModel):
    """Input schema for file reader tool"""
    file_path: str = Field(description="Path to file to read relative to workspace root")

class FileReaderTool(BaseTool):
    name: str = "read_file"
    description: str = "Read the contents of a file in the workspace. Use this to examine code, configs, or documentation."
    args_schema: Type[BaseModel] = FileReaderInput
    
    def _run(self, file_path: str) -> str:
        """Read file contents"""
        try:
            # Security: prevent path traversal
            if '..' in file_path or file_path.startswith('/'):
                return f"Error: Invalid file path (security violation)"
            
            if not os.path.exists(file_path):
                return f"Error: File not found: {file_path}"
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Limit size
            if len(content) > 10000:
                content = content[:10000] + "\n... (truncated)"
            
            logger.info(f"Read file: {file_path} ({len(content)} chars)")
            # FIX: Don't use markdown code blocks - just return plain text
            return f"📄 File: {file_path}\n\nContent:\n{content}"
        
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return f"Error reading file: {str(e)}"

class FileSearchInput(BaseModel):
    """Input schema for file search tool"""
    pattern: str = Field(description="Glob pattern to search (e.g., '*.py', 'src/**/*.ts')")
    max_results: int = Field(default=20, description="Maximum number of results")

class FileSearchTool(BaseTool):
    name: str = "search_files"
    description: str = "Search for files matching a glob pattern. Use wildcards: *.py, **/*.ts, etc."
    args_schema: Type[BaseModel] = FileSearchInput
    
    def _run(self, pattern: str, max_results: int = 20) -> str:
        """Search for files"""
        try:
            files = glob.glob(pattern, recursive=True)
            
            # Filter out common directories to ignore
            ignore_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build'}
            files = [f for f in files if not any(d in f.split(os.sep) for d in ignore_dirs)]
            
            if not files:
                return f"No files found matching pattern: {pattern}"
            
            files = files[:max_results]
            logger.info(f"Found {len(files)} files matching {pattern}")
            
            return f"📁 Found {len(files)} files:\n\n" + "\n".join(f"- {f}" for f in files)
        
        except Exception as e:
            logger.error(f"Error searching files: {e}")
            return f"Error searching files: {str(e)}"

class ListDirectoryInput(BaseModel):
    """Input schema for directory listing"""
    directory: str = Field(default=".", description="Directory to list")

class ListDirectoryTool(BaseTool):
    name: str = "list_directory"
    description: str = "List contents of a directory to understand project structure"
    args_schema: Type[BaseModel] = ListDirectoryInput
    
    def _run(self, directory: str = ".") -> str:
        """List directory contents"""
        try:
            if '..' in directory or directory.startswith('/'):
                return "Error: Invalid directory path"
            
            if not os.path.exists(directory):
                return f"Error: Directory not found: {directory}"
            
            items = os.listdir(directory)
            
            # Separate files and dirs
            dirs = [f"{item}/" for item in items if os.path.isdir(os.path.join(directory, item))]
            files = [item for item in items if os.path.isfile(os.path.join(directory, item))]
            
            logger.info(f"Listed directory: {directory}")
            
            result = f"📁 Directory: {directory}\n\n**Directories:**\n"
            result += "\n".join(f"- {d}" for d in sorted(dirs)) if dirs else "- (none)"
            result += "\n\n**Files:**\n"
            result += "\n".join(f"- {f}" for f in sorted(files)) if files else "- (none)"
            
            return result
        
        except Exception as e:
            logger.error(f"Error listing directory: {e}")
            return f"Error listing directory: {str(e)}"

class ProposeEditInput(BaseModel):
    """Input schema for code edit proposal"""
    file_path: str = Field(description="Path to file to edit")
    description: str = Field(description="Description of what change to make and why")
    old_code: Optional[str] = Field(default=None, description="Code snippet to replace (if editing existing code)")
    new_code: str = Field(description="New code to insert or use as replacement")

class ProposeEditTool(BaseTool):
    name: str = "propose_edit"
    description: str = "Propose a code change that requires human approval before applying"
    args_schema: Type[BaseModel] = ProposeEditInput
    
    def _run(self, file_path: str, description: str, new_code: str, old_code: Optional[str] = None) -> str:
        """Propose an edit (returns special format for approval)"""
        logger.info(f"Proposing edit to {file_path}")
        
        # Return special format that frontend will parse
        return f"APPROVAL_REQUIRED|{file_path}|{description}|{old_code or ''}|{new_code}"

# Export all tools
def get_workspace_tools() -> List[BaseTool]:
    """Get all workspace tools"""
    return [
        FileReaderTool(),
        FileSearchTool(),
        ListDirectoryTool(),
        ProposeEditTool()
    ]
