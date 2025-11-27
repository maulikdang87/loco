from langchain_core.prompts import PromptTemplate
from typing import Dict

# Code Completion Prompt
CODE_COMPLETION_PROMPT = PromptTemplate(
    input_variables=["language", "prefix", "suffix", "imports", "function_context"],
    template="""You are an expert {language} code completion assistant. Your task is to generate ONLY the missing code that should appear at the cursor position.

CONTEXT:
- Language: {language}

- Current imports:
{imports}

- Function/class context:
{function_context}

CODE BEFORE CURSOR:
{prefix}

CODE AFTER CURSOR:
{suffix}

INSTRUCTIONS:
1. Analyze the code context carefully
2. Understand what should come next based on the pattern
3. Generate ONLY the missing code - no explanations, no markdown
4. Match the existing indentation and code style exactly
5. Be concise - complete only what's immediately needed
6. Do NOT include code fences, comments about what you're doing, or any extra text

COMPLETION (code only):""",
)

# Debugging Prompt
DEBUG_PROMPT = PromptTemplate(
    input_variables=["language", "code", "error_message", "traceback"],
    template="""You are an expert {language} debugging assistant.

CODE WITH ERROR:
{code}

ERROR MESSAGE:
{error_message}

TRACEBACK:
{traceback}

Analyze this error and provide:
1. ROOT CAUSE: What's causing the error
2. FIX: The corrected code
3. EXPLANATION: Why this fix works

Format your response as:
ROOT CAUSE: <explanation>

FIX:
<corrected code>

EXPLANATION: <why this works>
""",
)

# Documentation Prompt
DOCUMENTATION_PROMPT = PromptTemplate(
    input_variables=["language", "code", "doc_style"],
    template="""You are an expert {language} documentation generator.

Generate a comprehensive docstring for this code using {doc_style} style:

{code}

Include:
- Brief description
- Parameters with types
- Return value with type
- Raises (if applicable)
- Example usage

FORMAT YOUR RESPONSE AS A PROPER DOCSTRING ONLY - NO EXTRA TEXT.
""",
)

def get_completion_prompt() -> PromptTemplate:
    return CODE_COMPLETION_PROMPT


def get_debug_prompt() -> PromptTemplate:
    return DEBUG_PROMPT


def get_documentation_prompt() -> PromptTemplate:
    return DOCUMENTATION_PROMPT
