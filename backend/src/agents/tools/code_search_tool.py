from langchain_core.tools import tool
from typing import List, Dict
import re
import difflib

class CodeSearchTool:
    """
    Search for similar code patterns across files
    Uses semantic similarity and pattern matching
    """
    
    @staticmethod
    def _tokenize_code(code: str) -> List[str]:
        """Extract meaningful tokens from code"""
        # Remove comments and strings for better matching
        code = re.sub(r'#.*$', '', code, flags=re.MULTILINE)  # Python comments
        code = re.sub(r'//.*$', '', code, flags=re.MULTILINE)  # JS comments
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)  # Block comments
        code = re.sub(r'"[^"]*"', '""', code)  # Strings
        code = re.sub(r"'[^']*'", "''", code)  # Strings
        
        # Extract identifiers and keywords
        tokens = re.findall(r'\b\w+\b', code)
        return tokens
    
    @tool
    def find_similar_code(
        self,
        query_code: str,
        search_files: List[Dict[str, str]],
        threshold: float = 0.6
    ) -> List[Dict]:
        """
        Find code snippets similar to query
        
        Args:
            query_code: Code to search for
            search_files: List of {path, content} dicts
            threshold: Similarity threshold (0-1)
            
        Returns:
            List of similar code snippets with scores
        """
        query_tokens = set(CodeSearchTool._tokenize_code(query_code))
        results = []
        
        for file in search_files:
            content = file.get("content", "")
            path = file.get("path", "unknown")
            
            # Split into functions/chunks
            chunks = CodeSearchTool._split_into_chunks(content)
            
            for chunk in chunks:
                chunk_tokens = set(CodeSearchTool._tokenize_code(chunk))
                
                # Calculate Jaccard similarity
                intersection = len(query_tokens & chunk_tokens)
                union = len(query_tokens | chunk_tokens)
                
                if union == 0:
                    continue
                
                similarity = intersection / union
                
                if similarity >= threshold:
                    # Also use difflib for sequence matching
                    sequence_match = difflib.SequenceMatcher(
                        None,
                        query_code,
                        chunk
                    ).ratio()
                    
                    # Combined score
                    combined_score = (similarity + sequence_match) / 2
                    
                    results.append({
                        "file": path,
                        "code": chunk[:300],  # Truncate for display
                        "similarity": round(combined_score, 2)
                    })
        
        # Sort by similarity
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:5]  # Top 5 matches
    
    @staticmethod
    def _split_into_chunks(code: str, chunk_size: int = 20) -> List[str]:
        """Split code into function-sized chunks"""
        lines = code.split('\n')
        chunks = []
        
        current_chunk = []
        indent_level = 0
        
        for line in lines:
            stripped = line.strip()
            
            # Start new chunk on function/class definition
            if stripped.startswith(('def ', 'class ', 'function ', 'const ')):
                if current_chunk:
                    chunks.append('\n'.join(current_chunk))
                current_chunk = [line]
                indent_level = len(line) - len(line.lstrip())
            else:
                current_chunk.append(line)
                
                # Also chunk on size
                if len(current_chunk) >= chunk_size:
                    chunks.append('\n'.join(current_chunk))
                    current_chunk = []
        
        if current_chunk:
            chunks.append('\n'.join(current_chunk))
        
        return chunks

# Global instance
code_search_tool = CodeSearchTool()
