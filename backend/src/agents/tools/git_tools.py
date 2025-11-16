from langchain_core.tools import tool
import git
import os
from typing import Optional

class GitTools:
    """
    Tools for extracting git repository context
    Helps agents understand recent changes
    """
    
    @staticmethod
    def _get_repo(file_path: str) -> Optional[git.Repo]:
        """Find git repo for a file"""
        try:
            # Walk up directory tree to find .git
            directory = os.path.dirname(file_path)
            return git.Repo(directory, search_parent_directories=True)
        except git.InvalidGitRepositoryError:
            return None
    
    @staticmethod
    @tool
    def get_diff(file_path: str, staged: bool = False) -> str:
        """
        Get git diff for a file
        
        Args:
            file_path: Path to file
            staged: Include staged changes
            
        Returns:
            Diff string
        """
        repo = GitTools._get_repo(file_path)
        if not repo:
            return "No git repository found"
        
        try:
            if staged:
                diff = repo.git.diff('--staged', file_path)
            else:
                diff = repo.git.diff(file_path)
            
            return diff if diff else "No changes"
        except Exception as e:
            return f"Error getting diff: {e}"
    
    @staticmethod
    @tool
    def get_recent_commits(file_path: str, count: int = 5) -> list[dict]:
        """
        Get recent commits affecting a file
        
        Args:
            file_path: Path to file
            count: Number of commits to retrieve
            
        Returns:
            List of commit info dicts
        """
        repo = GitTools._get_repo(file_path)
        if not repo:
            return []
        
        try:
            commits = list(repo.iter_commits(paths=file_path, max_count=count))
            
            return [
                {
                    "hash": commit.hexsha[:7],
                    "author": str(commit.author),
                    "date": commit.committed_datetime.isoformat(),
                    "message": commit.message.strip()
                }
                for commit in commits
            ]
        except Exception as e:
            return [{"error": str(e)}]
    
    @staticmethod
    @tool
    def get_blame(file_path: str, line_number: int) -> dict:
        """
        Get git blame for a specific line
        
        Args:
            file_path: Path to file
            line_number: Line number (1-indexed)
            
        Returns:
            Blame information for that line
        """
        repo = GitTools._get_repo(file_path)
        if not repo:
            return {"error": "No git repository"}
        
        try:
            blame = repo.git.blame('-L', f'{line_number},{line_number}', file_path)
            
            # Parse blame output
            parts = blame.split('\t')
            if len(parts) >= 2:
                commit_info = parts[0].split()
                return {
                    "commit": commit_info[0],
                    "author": parts[1] if len(parts) > 1 else "unknown",
                    "line": parts[-1] if len(parts) > 2 else ""
                }
            
            return {"raw": blame}
        except Exception as e:
            return {"error": str(e)}

# Global instance
git_tools = GitTools()
