from langchain_core.tools import tool
from typing import Optional

class FileContextTool:
    """
    Extracts surrounding code context (20 lines before/after cursor)
    Similar to Cursor's context extraction
    """
    
    @staticmethod
    @tool
    def get_surrounding_context(
        file_content: str,
        cursor_line: int,
        lines_before: int = 20,
        lines_after: int = 20
    ) -> dict:
        """
        Get code context around cursor position
        
        Args:
            file_content: Full file content
            cursor_line: Current cursor line (0-indexed)
            lines_before: Number of lines before cursor
            lines_after: Number of lines after cursor
            
        Returns:
            dict with before, current, and after sections
        """
        lines = file_content.split('\n')
        total_lines = len(lines)
        
        # Calculate ranges
        start_line = max(0, cursor_line - lines_before)
        end_line = min(total_lines, cursor_line + lines_after + 1)
        
        context = {
            "before": '\n'.join(lines[start_line:cursor_line]),
            "current_line": lines[cursor_line] if cursor_line < total_lines else "",
            "after": '\n'.join(lines[cursor_line + 1:end_line]),
            "start_line": start_line,
            "end_line": end_line,
            "total_lines": total_lines
        }
        
        return context
    
    @staticmethod
    @tool
    def extract_function_scope(file_content: str, cursor_line: int) -> Optional[dict]:
        """
        Find the function/class that contains the cursor
        
        Returns:
            Function/class definition and body
        """
        lines = file_content.split('\n')
        
        # Simple heuristic: find nearest 'def' or 'class' above cursor
        for i in range(cursor_line, -1, -1):
            line = lines[i].strip()
            if line.startswith('def ') or line.startswith('class '):
                # Find end of function (next def/class or end of indent)
                indent_level = len(lines[i]) - len(lines[i].lstrip())
                end_line = cursor_line
                
                for j in range(i + 1, len(lines)):
                    current_indent = len(lines[j]) - len(lines[j].lstrip())
                    if lines[j].strip() and current_indent <= indent_level:
                        end_line = j
                        break
                else:
                    end_line = len(lines)
                
                return {
                    "name": line.split('(')[0].replace('def ', '').replace('class ', '').strip(),
                    "type": "function" if 'def' in line else "class",
                    "start_line": i,
                    "end_line": end_line,
                    "code": '\n'.join(lines[i:end_line])
                }
        
        return None
