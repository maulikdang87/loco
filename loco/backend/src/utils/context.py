import re
from typing import Dict, List, Optional


def extract_imports(code: str, language: str) -> List[str]:
    """
    Extract import statements from code
    
    Args:
        code: Source code
        language: Programming language
        
    Returns:
        List of import statements
    """
    imports = []
    
    if language == "python":
        # Match: import X, from X import Y
        pattern = r'^(?:from\s+[\w.]+\s+)?import\s+.+$'
        imports = re.findall(pattern, code, re.MULTILINE)
        
    elif language in ["javascript", "typescript"]:
        # Match: import X from 'Y', const X = require('Y')
        pattern = r'(?:import\s+.+\s+from\s+[\'"].+[\'"]|const\s+.+\s+=\s+require\([\'"].+[\'"]\))'
        imports = re.findall(pattern, code)
        
    elif language in ["java", "csharp"]:
        # Match: import/using statements
        pattern = r'^(?:import|using)\s+[\w.]+;?$'
        imports = re.findall(pattern, code, re.MULTILINE)
    
    return imports


def extract_function_context(prefix: str, language: str) -> Optional[str]:
    """
    Extract the current function or class definition context
    
    Args:
        prefix: Code before cursor
        language: Programming language
        
    Returns:
        Function/class signature or None
    """
    if language == "python":
        # Find the most recent function/class definition
        patterns = [
            r'(class\s+\w+.*?:)',
            r'(def\s+\w+\(.*?\)\s*(?:->\s*\w+)?:)',
            r'(async\s+def\s+\w+\(.*?\)\s*(?:->\s*\w+)?:)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, prefix, re.MULTILINE)
            if matches:
                return matches[-1]  # Most recent definition
                
    elif language in ["javascript", "typescript"]:
        # Match function declarations
        patterns = [
            r'(class\s+\w+.*?{)',
            r'(function\s+\w+\(.*?\)\s*{)',
            r'(const\s+\w+\s*=\s*\(.*?\)\s*=>\s*{)',
            r'(async\s+function\s+\w+\(.*?\)\s*{)'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, prefix)
            if matches:
                return matches[-1]
    
    return None


def get_indentation(line: str) -> str:
    """
    Extract indentation from a line of code
    
    Args:
        line: Line of code
        
    Returns:
        Leading whitespace
    """
    match = re.match(r'^(\s*)', line)
    return match.group(1) if match else ""


def count_indentation_level(code: str) -> int:
    """
    Count the indentation level based on the last line
    
    Args:
        code: Code snippet
        
    Returns:
        Number of indentation units
    """
    if not code.strip():
        return 0
    
    lines = code.rstrip().split('\n')
    last_line = lines[-1] if lines else ""
    
    indent = get_indentation(last_line)
    
    # Count spaces (assuming 4 spaces per level)
    return len(indent) // 4


def build_context_dict(
    prefix: str,
    suffix: str,
    language: str
) -> Dict[str, str]:
    """
    Build a context dictionary for the prompt
    
    Args:
        prefix: Code before cursor
        suffix: Code after cursor
        language: Programming language
        
    Returns:
        Context dictionary with imports and function context
    """
    # Extract imports
    imports = extract_imports(prefix, language)
    imports_text = "\n".join(imports) if imports else "No imports"
    
    # Extract function/class context
    func_context = extract_function_context(prefix, language)
    func_context_text = func_context if func_context else "Global scope"
    
    return {
        "language": language,
        "prefix": prefix,
        "suffix": suffix,
        "imports": imports_text,
        "function_context": func_context_text
    }


def clean_completion(completion: str, language: str) -> str:
    """
    Clean up LLM-generated completion
    
    Args:
        completion: Raw LLM output
        language: Programming language
        
    Returns:
        Cleaned completion
    """
    # Remove markdown code fences
    completion = re.sub(r'```[\w+]*\n?', '', completion)
    
    # Remove trailing explanations
    if '\n\n' in completion:
        # Take only the first paragraph (the actual code)
        completion = completion.split('\n\n')
    
    # Strip leading/trailing whitespace but preserve internal structure
    completion = completion.rstrip()
    
    return completion
    