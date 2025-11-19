# Backend Overview: Loco AI Coding Assistant

This document provides a comprehensive overview of the `backend/` folder in the Loco project. It explains the architecture, main components, and the purpose of each Python file.

---

## 1. High-Level Architecture

The backend is a FastAPI-based Python server that powers the Loco AI coding assistant. It provides:
- REST API endpoints for chat, code completion, and agentic tasks
- Integration with multiple LLM providers (Ollama, Groq, Gemini, OpenAI)
- Workspace tools for file reading, searching, editing, and proposing code changes
- Multi-agent orchestration for advanced coding workflows

---

## 2. Folder Structure & Key Files

```
backend/
    __init__.py
    BACKEND_OVERVIEW.md   # <--- THIS FILE
    BACKEND_SOFTWARE_ENGINEERING.md
    pytest.ini
    requirements.txt
    src/
        __init__.py
        config.py
        main.py
        agents/
            ...
        llm/
            ...
        models/
            ...
        utils/
            ...
        tests/
            ...
```

### Top-Level Files
- `__init__.py`: Marks the folder as a Python package.
- `pytest.ini`: Pytest configuration for running tests.
- `requirements.txt`: Python dependencies for the backend.

### `src/` Subfolder
Contains all backend source code, organized by domain:

#### `src/main.py`
- **Purpose:** FastAPI app entry point. Defines all API endpoints, configures CORS, logging, and error handling.
- **Key Endpoints:**
  - `/api/v1/complete` - Code completion
  - `/api/v1/chat/{provider}` - Chat with LLMs
  - `/api/v1/agent/task` - Agentic task execution

#### `src/config.py`
- **Purpose:** Centralized configuration (API keys, provider defaults, etc.)

#### `src/agents/`
- **agentic_supervisor.py**: Orchestrates agentic tasks, tool usage, and approval workflows.
- **code_completion_agent.py**: Handles code completion requests.
- **tools/**: Implements workspace tools (read_file, search_files, propose_edit, etc.)
- **Other agents**: Specialized agents for debugging, refactoring, documentation, etc.

#### `src/llm/`
- **llm_manager.py**: Factory for creating LLM clients (Ollama, Groq, Gemini, OpenAI)
- **ollama_client.py**: Handles Ollama-specific API calls

#### `src/models/`
- **schemas.py**: Pydantic models for API requests/responses

#### `src/utils/`
- **context.py**: Context management utilities
- **error_handler.py**: Global error handling for FastAPI

#### `src/tests/`
- Unit tests for all major backend components

---

## 3. Main Backend Flow

1. **User sends a request** (chat, code completion, or agentic task)
2. **FastAPI endpoint** receives the request in `main.py`
3. **LLM Manager** selects the appropriate model/provider
4. **Agent/Tool** is invoked (for agentic tasks)
5. **Workspace tools** interact with the codebase as needed
6. **Response** is returned to the frontend (VS Code extension)

---

## 4. Key Features
- Multi-provider LLM support (Ollama, Groq, Gemini, OpenAI)
- Agentic workflows with tool usage and approval
- Workspace-relative file operations
- Robust error handling and logging
- Extensible agent and tool system

---

## 5. How to Run

1. Install dependencies:
   ```sh
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. Start the server:
   ```sh
   ./venv/bin/uvicorn src.main:app --reload --port 8000
   ```
3. The backend will be available at `http://localhost:8000`

---

## 6. Testing

- Run all backend tests:
  ```sh
  pytest
  ```

---

## 7. Extending the Backend
- Add new tools in `src/agents/tools/`
- Add new agents in `src/agents/`
- Add new endpoints in `src/main.py`

---

For more details, see the code comments in each file.
