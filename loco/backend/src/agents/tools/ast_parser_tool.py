from langchain_core.tools import tool
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
from tree_sitter import Language, Parser, Node
from typing import Literal

class ASTParserTool:
    """
    Parse code into Abstract Syntax Tree using Tree-sitter
    Enables semantic code understanding
    """
    
    def __init__(self):
        # Initialize parsers for different languages
        self.parsers = {
            'python': self._init_parser(tspython.language()),
            'javascript': self._init_parser(tsjavascript.language()),
            'typescript': self._init_parser(tsjavascript.language()),
        }
    
    def _init_parser(self, language_func) -> Parser:
        """Initialize parser for a language"""
        lang = Language(language_func)
        parser = Parser(lang)
        return parser
    
    @tool
    def parse_code(
        self, 
        code: str, 
        language: Literal["python", "javascript", "typescript"]
    ) -> dict:
        """
        Parse code into AST and extract key elements
        
        Args:
            code: Source code to parse
            language: Programming language
            
        Returns:
            Structured AST information
        """
        parser = self.parsers.get(language)
        if not parser:
            return {"error": f"Language {language} not supported"}
        
        tree = parser.parse(bytes(code, "utf8"))
        root_node = tree.root_node
        
        return {
            "root_type": root_node.type,
            "functions": self._extract_functions(root_node, language),
            "classes": self._extract_classes(root_node, language),
            "imports": self._extract_imports(root_node, language),
            "variables": self._extract_variables(root_node, language),
            "node_count": root_node.child_count,
            "has_errors": root_node.has_error
        }
    
    def _extract_functions(self, node: Node, language: str) -> list[dict]:
        """Extract all function definitions"""
        functions = []
        
        def traverse(n: Node):
            # Python: function_definition
            # JavaScript: function_declaration, arrow_function
            if language == 'python' and n.type == 'function_definition':
                name_node = n.child_by_field_name('name')
                params_node = n.child_by_field_name('parameters')
                
                functions.append({
                    "name": name_node.text.decode('utf8') if name_node else "unknown",
                    "params": params_node.text.decode('utf8') if params_node else "",
                    "start_line": n.start_point[0],
                    "end_line": n.end_point[0]
                })
            
            elif language in ['javascript', 'typescript']:
                if n.type in ['function_declaration', 'function', 'arrow_function']:
                    name_node = n.child_by_field_name('name')
                    functions.append({
                        "name": name_node.text.decode('utf8') if name_node else "anonymous",
                        "type": n.type,
                        "start_line": n.start_point[0],
                        "end_line": n.end_point[0]
                    })
            
            for child in n.children:
                traverse(child)
        
        traverse(node)
        return functions
    
    def _extract_classes(self, node: Node, language: str) -> list[dict]:
        """Extract all class definitions"""
        classes = []
        
        def traverse(n: Node):
            if n.type == 'class_definition' or n.type == 'class_declaration':
                name_node = n.child_by_field_name('name')
                classes.append({
                    "name": name_node.text.decode('utf8') if name_node else "unknown",
                    "start_line": n.start_point[0],
                    "end_line": n.end_point[0]
                })
            
            for child in n.children:
                traverse(child)
        
        traverse(node)
        return classes
    
    def _extract_imports(self, node: Node, language: str) -> list[str]:
        """Extract import statements"""
        imports = []
        
        def traverse(n: Node):
            # Python: import_statement, import_from_statement
            # JavaScript: import_statement
            if 'import' in n.type:
                imports.append(n.text.decode('utf8'))
            
            for child in n.children:
                traverse(child)
        
        traverse(node)
        return imports
    
    def _extract_variables(self, node: Node, language: str) -> list[dict]:
        """Extract variable declarations"""
        variables = []
        
        def traverse(n: Node):
            # Simplified: look for assignment or declaration nodes
            if language == 'python' and n.type == 'assignment':
                left = n.child_by_field_name('left')
                if left:
                    variables.append({
                        "name": left.text.decode('utf8'),
                        "line": n.start_point[0]
                    })
            
            for child in n.children:
                traverse(child)
        
        traverse(node)
        return variables

# Global instance
ast_parser = ASTParserTool()
