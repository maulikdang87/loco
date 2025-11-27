# Change Log

All notable changes to the "Loco" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.22] - 2025-01-24

### 🐛 Enhanced Windows Backend Auto-Start Debugging
- **Added Comprehensive Logging for Dependency Flow**:
  - ✅ Added step-by-step logging to track backend startup process
  - ✅ Enhanced marker file logging with creation timestamps
  - ✅ Added logging to track if execution continues after dependency install
  - ✅ Non-blocking success message to prevent flow interruption

### 🔍 Debug Information Added
- **Full Process Tracing**:
  - Shows Python path detection
  - Shows dependency checking steps
  - Shows marker file creation and verification
  - Shows if backend spawn process is reached
  - Helps identify exactly where the Windows startup flow breaks

---

## [0.1.21] - 2025-01-24

### 🔑 CRITICAL FIX: Agent Mode API Keys Actually Working Now
- **Fixed Agent Mode Using Direct axios Instead of Backend Client**:
  - ✅ Agent mode was bypassing the API key system by calling axios directly
  - ✅ Changed to use `this.backend.executeAgentTask()` which includes API keys
  - ✅ Added debug logging to show API keys being passed to agent
  - ✅ Agent mode now works consistently with VS Code settings on all platforms

### 🐛 Root Cause Identified
- **Chat Mode vs Agent Mode Code Paths**:
  - Chat mode: Uses `this.backend.chat()` ✅ (includes API keys)
  - Agent mode: Was using `axios.post()` ❌ (bypassed API keys)
  - Now both use the backend client with proper API key handling

---

## [0.1.20] - 2025-01-23

### 🪟 Critical Windows Backend Auto-Start Fix
- **Fixed Backend Not Starting Automatically on Windows**:
  - ✅ Uses the detected Python executable directly with correct working directory
  - ✅ Launches backend without relying on shell-specific syntax (no manual command needed)
  - ✅ Backend now starts automatically after dependency installation
  - ✅ No more manual "python -m uvicorn" needed

### 🔑 Fixed Agent Mode API Keys (For Real This Time)
- **Fixed Agent Mode API Key Retrieval**:
  - ✅ Changed from `api_keys` to `runtime_api_keys` attribute
  - ✅ Added debug logging to trace API key flow through system
  - ✅ API keys now properly retrieved from LLM manager
  - ✅ Agent mode works with Gemini/Groq/OpenAI from VS Code settings

### 🐛 Debug Improvements
- **Enhanced Logging**:
  - Added logging for received API keys in main.py endpoint
  - Added logging for runtime keys set in LLM manager
  - Added logging for API keys retrieved by agents
  - Easier to diagnose API key flow issues

---

## [0.1.18] - 2025-01-23

### 🔑 Critical Agent Mode API Key Fix
- **Fixed Agent Mode Not Using API Keys from VS Code Settings**:
  - ✅ Agent mode now properly receives and uses API keys from VS Code settings
  - ✅ Fixed `agentic_supervisor.py` to pass `api_keys` parameter to LLM manager
  - ✅ Resolves "GEMINI_API_KEY not configured" error in agent mode
  - ✅ Agent mode now works consistently with Chat mode

### 🐛 Bug Fixes
- **Agent Mode API Key Propagation**:
  - Fixed agents not receiving runtime API keys set by main.py endpoint
  - All agents now retrieve API keys from llm_manager.api_keys attribute
  - API keys properly flow: VS Code settings → Frontend → Backend endpoint → LLM manager → Agents

---

## [0.1.17] - 2025-01-23

### 🪟 Critical Windows Backend Lifecycle Fixes
- **Fixed Backend Not Stopping When VS Code Closes**:
  - ✅ Implemented proper Windows process tree termination using `taskkill /F /T`
  - ✅ Backend processes now fully terminate when VS Code closes (no orphans)
  - ✅ Prevents port conflicts from old backend versions staying alive
  - ✅ Added graceful shutdown period before force kill
  - ✅ Falls back to SIGTERM/SIGKILL on Unix systems

### 🚀 Improved Dependency Installation Flow
- **Backend Auto-Starts After Dependency Install**:
  - ✅ Removed manual "Reload Window" requirement after dependency installation
  - ✅ Backend now starts automatically after successful dependency install
  - ✅ Changed success message to "Backend will start automatically"
  - ✅ Smoother first-time setup experience

### ⚡ Optimized Dependency Checks
- **Dependencies Only Checked Once**:
  - ✅ Uses `.deps_installed` marker file to skip re-checking dependencies
  - ✅ First startup: Checks and installs dependencies, creates marker
  - ✅ Subsequent startups: Skips dependency verification, starts backend immediately
  - ✅ Faster startup times after initial setup

### 🐛 Bug Fixes
- **Process Tree Cleanup**:
  - Fixed orphan Python/uvicorn processes on Windows
  - Fixed "Address already in use" errors from port 8000 conflicts
  - Fixed old backend versions (0.1.9) continuing to run after update

---

## [0.1.16] - 2025-11-23

### 🪟 Critical Windows Console Encoding Fix
- **Fixed OSError [Errno 22] on Windows**:
  - ✅ Added UTF-8 encoding configuration for Windows stdout/stderr
  - ✅ Prevents crashes when logging or printing Unicode characters
  - ✅ Wraps console streams with error handling (`errors='replace'`)
  - ✅ Fixes "Invalid argument" errors during chat requests on Windows

### 🔧 Critical Fixes for Windows
- **Improved Error Propagation and Diagnostics**:
  - ✅ Backend errors now properly thrown (not swallowed as null)
  - ✅ Chat requests show actual backend error messages instead of generic "Failed to get response"
  - ✅ Added connection check before sending chat request
  - ✅ Better logging: shows API key presence, backend connection status, stderr output
  - ✅ Status bar now logs recent stderr when backend exits

- **Enhanced Error Messages**:
  - HTTP 401: "API key not configured" with step-by-step configuration instructions
  - HTTP 400: Shows actual validation error from backend
  - HTTP 500: Shows backend error details
  - ECONNREFUSED: "Backend not running" with "Restart Backend" button
  - Logs show: provider, model, API keys status, connection check result

### 🪟 Windows Backend Startup Improvements
- **Enhanced Windows backend startup reliability**:
  - ✅ Added uvicorn module verification during Python detection
  - ✅ Better path handling for Windows venv Python executables
  - ✅ Improved command logging for spawn debugging
  - ✅ Added diagnostic tool for Windows setup issues

### 🔧 New Features
- **Windows Diagnostics Tool**: Added "Run Diagnostics" button in error dialogs (Windows only)
  - Checks Python environment and version
  - Verifies uvicorn installation
  - Tests all required dependencies
  - Validates backend file structure
  - Shows recent backend errors
  - Provides actionable suggestions

- **Backend Health Status Detection**: Extension now checks backend health status
  - Differentiates between "ok" (all systems) vs "degraded" (Ollama unavailable)
  - Logs helpful hints when backend is in degraded mode
  - Shows that Agent mode works fine with Groq/Gemini even when Ollama is down

### 🐛 Bug Fixes
- **Fixed Status Bar Showing "Error" When Backend is Actually Running**:
  - Backend responding with HTTP 200 now properly shows "$(check) Loco: Ready"
  - Extension recognizes "degraded" status (Ollama unavailable) as still functional
  - Logs clarify that Agent mode with API keys works without Ollama
  - Status bar tooltip updated to show backend is running

- **Fixed Chat Mode Not Working When Ollama Unavailable**:
  - Health endpoint now returns "ok" instead of "degraded" when Ollama is down
  - Backend recognizes it can still function with cloud providers (Groq/Gemini/OpenAI)
  - Even without API keys in .env, frontend can send them from VS Code settings
  - Better error messages when API keys are missing (HTTP 401 with helpful details)
  - Chat panel shows clear error: "API key not configured for provider X"

- **Improved Error Messages**:
  - Chat errors now show specific provider name and configuration steps
  - Console logs show if API keys are configured: "📡 API Keys configured: Yes/No"
  - Backend logs show when API keys are missing vs when they're provided
  - Better 401 error: "GROQ API key not configured. Please add API key in VS Code settings"

- **Comprehensive Error Logging**: Backend errors are now fully captured and displayed
  - ✅ All stderr output is buffered and stored
  - ✅ "Show Logs" button displays actual Python error messages (not generic text)
  - ✅ Critical errors (ImportError, ModuleNotFoundError) logged immediately
  - ✅ Diagnostic tool shows recent backend errors
  - ✅ Helps identify exact failure point (missing modules, import errors, etc.)

- **Better startup error detection**: Logs all errors containing "error" keyword
- **Enhanced Python validation**: Verifies uvicorn is accessible before attempting backend start
- **Improved error messages**: Windows exit code 1 now shows specific troubleshooting steps

### 📋 What This Fixes
**Problem**:
- Backend returns HTTP 200 but status bar shows "Error" ❌
- Extension says "backend not working" even though curl shows it's running ❌
- No indication that degraded mode (without Ollama) is normal ❌
- **Chat mode doesn't work but agent mode does** ❌
- Backend shows "exited with code 1" but no actual error details ❌
- Can't see Python import errors or module issues ❌
- Agent mode works but chat shows "backend not working" ❌

**Solution**:
- Status bar correctly shows "Ready" when backend responds with HTTP 200 ✅
- Extension checks health status and logs whether it's "ok" or "degraded" ✅
- Console explains degraded mode is normal without Ollama ✅
- Clarifies that Agent mode with Groq/Gemini works fine ✅
- **Health endpoint returns "ok" even without Ollama (frontend can send API keys)** ✅
- **Chat mode shows clear "API key not configured" errors instead of generic failures** ✅
- **Backend returns proper HTTP 401 with helpful error messages** ✅
- All Python stderr captured in buffer and displayed in logs ✅
- "Show Logs" reveals actual error messages (ImportError, etc.) ✅
- "Run Diagnostics" provides detailed health check with recent errors ✅

## [0.1.10] - 2025-11-23

### 🔧 Critical Windows Fix - Dependency Persistence
- **Fixed dependency re-prompting on Windows**: Extension no longer asks to reinstall after successful installation
  - ✅ Added `.deps_installed` marker file to remember successful installations
  - ✅ Skips dependency check when marker exists for faster startup
  - ✅ Added "Reinstall Dependencies" option in error dialog

### 🐛 Bug Fixes
- **Better dependency detection**: Added detailed logging for each dependency check with error messages
- **Enhanced error messages for Windows**: Shows specific hints for exit code 1 errors
  - Displays Python path and backend path in logs
  - Suggests common fixes (dependencies, PATH, venv)
- **Improved error dialog**: Added "Reinstall Dependencies" button that clears marker and reinstalls

### 📋 What This Fixes
**Before (Windows)**:
- Install dependencies → Reload → Prompt to install again ❌
- Backend fails with no clear reason ❌
- No way to force reinstall ❌

**After (Windows)**:
- Install dependencies → Reload → Backend starts immediately ✅
- Clear error messages with Windows-specific hints ✅
- "Reinstall Dependencies" button for easy troubleshooting ✅

## [0.1.9] - 2025-11-21

### 🎯 Critical Fix - Agent Mode API Keys
- **Fixed all agent commands to use API keys from VS Code settings**: Previously only `processWithAgent` sent API keys
  - ✅ Fixed `explainCode()` - Now sends api_keys to backend
  - ✅ Fixed `debugCode()` - Now sends api_keys to backend
  - ✅ Fixed `documentCode()` - Now sends api_keys to backend
  - ✅ Fixed `refactorCode()` - Now sends api_keys to backend
  - ✅ Fixed `executeAgentTask()` - Now sends api_keys to backend
  - All agent commands now match chat mode behavior: Get keys from VS Code settings → Send in request → Backend uses them

### 🔧 Improvements
- **Enhanced Windows compatibility**: Added shell mode to virtual environment Python detection
  - Fixed venv Python version check on Windows
  - All spawn commands now properly use shell mode where needed
  - Better handling of Windows paths and commands

### 📝 What This Fixes
**Before**: 
- Chat mode worked with API keys ✅
- `processWithAgent` worked with API keys ✅
- BUT individual agent commands (Explain, Debug, Document, Refactor) failed with "API key not set" ❌

**After**:
- All modes now work consistently with API keys from VS Code settings ✅
- No more "API key not set" errors in any agent mode ✅
- Windows users have better compatibility ✅

## [0.1.8] - 2025-11-21

### 🎯 Major Fix - Agent Mode API Keys
- **Fixed agent mode API key access**: Agent mode now properly accesses API keys from VS Code settings
  - Implemented runtime API key injection in LLM manager
  - All 7 agent endpoints now set runtime API keys before processing
  - API keys flow: VS Code settings → request payload → runtime_api_keys → LLM providers
  - Fixes "API key not set" error that only affected agent mode while chat worked

### 🐛 Bug Fixes
- **Fixed duplicate status bars**: Completely removed status bar from BackendClient
  - Previously had 3 status bars showing at once
  - Now only BackendManager controls the single status bar
  - Status bar properly updates to "Ready" after backend health check
- **Fixed status bar stuck on "Starting..."**: Added status update in waitForBackend()
  - Status bar now correctly shows "Ready" when backend is healthy
  - Shows "Error" if backend fails to start within 30 seconds
- **Fixed duplicate command registration**: Added activation guard to prevent double-activation
  - Extension now checks if already activated before re-registering commands
  - Fixes "command 'loco.openChat' already exists" error
  - Proper cleanup in deactivate() function
- **Reduced startup noise**: Added 5-second grace period for error messages
  - No error dialogs during the first 5 seconds of backend startup
  - Allows normal startup logs without triggering false alarms
  - Removed "Loco is ready!" notification on every activation
  - Backend startup success no longer shows notification (check status bar instead)

### 🔧 Technical Improvements
- **LLM Manager enhancements**:
  - Added `runtime_api_keys` dictionary for per-request API key storage
  - Added `set_runtime_keys(api_keys)` method for runtime injection
  - Added `_get_api_key(provider, request_keys)` with 3-tier priority:
    1. API keys from current request parameter
    2. Runtime API keys (set per-request)
    3. Environment variables from settings
- **All agent endpoints updated**: 
  - `/api/v1/agent/process`, `/debug`, `/explain`, `/refactor`, `/document`, `/task`, `/execute`
  - Each now extracts api_keys and calls `llm_manager.set_runtime_keys()`
- **Cleaner code**: Removed unused dispose() method and statusBar references from BackendClient
- **Startup grace period**: Backend errors are suppressed for 5 seconds after launch to prevent startup log spam

### ✅ Results
**Before**: Multiple conflicting status bars, agent mode failed with "API key not set", command registration errors, too many error popups during startup
**After**: Single accurate status bar, agent mode works with VS Code settings API keys, clean extension activation, quiet startup with grace period

## [0.1.7] - 2025-11-21

### 🐛 Critical Bug Fix
- **Fixed duplicate status bar indicators**: Removed conflicting status bar from settingsService that was causing confusion
  - One status bar showed "$(circle-slash) Loco: Stopped" (process monitor)
  - Another showed "$(check) Loco" (API health check)
  - Both were fighting each other, causing false "backend not working" messages even when chat mode worked fine
- **Better crash detection**: Backend crashes now show detailed error messages with exit codes

### 🔧 Improvements
- **Single source of truth**: Only backendManager now controls the status bar
- **Improved error logging**: Backend crashes show "Show Logs" and "Restart" options
- **Kept working agent mode**: Reverted experimental API key changes that broke the backend

### 📦 What Was Fixed
Users were seeing conflicting status indicators where:
- Chat mode worked fine (backend was running)
- But one status bar showed "Stopped" or "Error"
- This was because settingsService checked API health independently

Now there's only ONE status bar managed by backendManager that accurately reflects backend process status.

**Note:** Agent mode uses API keys from environment variables set during backend startup (from VS Code settings), not from request payloads.

## [0.1.6] - 2025-11-21

### 🐛 Critical Bug Fixes
- **Fixed missing tree-sitter dependencies**: Added `tree-sitter`, `tree-sitter-python`, and `tree-sitter-javascript` to requirements.txt - these were imported by the AST parser but not listed in dependencies
- **Fixed Agent Mode API keys**: Agent mode now properly receives API keys from VS Code settings and passes them to the backend
- **Better backend crash detection**: Now shows detailed error messages when backend process exits unexpectedly
- **Improved error logging**: Backend stderr errors are now captured and displayed with "Show Full Error" option

### 🔧 Improvements
- **All dependencies verified**: Performed comprehensive audit of all imports across backend codebase to ensure every package is in requirements.txt
- **Updated dependency check**: Added `tree_sitter` to critical dependency verification
- **Fixed .env file packaging**: Updated copy-backend script to exclude .env files from package
- **Better crash reporting**: Shows exit code and offers "Show Logs" and "Restart" options when backend crashes

### 📦 What Was Fixed
The backend code imports tree-sitter packages for code parsing (AST analysis), but these dependencies were completely missing from requirements.txt. This caused:
- Backend to install successfully but fail to start
- ModuleNotFoundError when importing tree_sitter_python
- Confusion with false Anaconda warnings

Agent mode was not receiving API keys because the extension didn't pass them in the request payload - they were only set as environment variables during backend startup.

## [0.1.5] - 2025-01-27

### 🔧 Major Improvements - Virtual Environment Naming & Error Detection
- **Renamed virtual environment**: Changed from `venv` to `locovenv` to avoid conflicts with user's existing venv folders
- **Smarter error detection**: Only shows Anaconda warnings when actually using Anaconda Python, not when using virtual environments
- **Better debugging**: Added "Show Full Error" button to see full backend startup errors
- **Enhanced error preview**: Increased error message preview from 100 to 150 characters
- **Comprehensive dependency check**: Now verifies ALL critical dependencies (uvicorn, fastapi, pydantic_settings, langchain, tree_sitter) instead of just one

### 🐛 Bug Fixes
- **Fixed false positive warnings**: No longer shows Anaconda warnings when backend is successfully running in a virtual environment
- **Improved venv detection**: Properly distinguishes between system Python and virtual environment Python
- **Better reliability**: Enhanced detection of successful dependency installation in virtual environments
- **Fixed partial installation detection**: Now catches cases where some dependencies installed but others failed (e.g., pydantic_settings installed but uvicorn missing)
- **Added missing dependencies**: Added tree-sitter packages to requirements.txt (tree-sitter, tree-sitter-python, tree-sitter-javascript) - these were imported by code but not listed in requirements!

## [0.1.4] - 2025-11-21

### 🐛 Critical Bug Fix - macOS/Linux Setup
- **Fixed terminal commands**: Now uses `python3` and `pip3` on macOS/Linux instead of `python`/`pip`
- **Auto-executing setup**: Commands now execute automatically instead of showing as comments
- **No more "command not found" errors**: Proper detection of Python 3 on Unix systems
- **Platform-specific commands**: Uses correct Python command for each OS (py/python/python3)

### ✨ Improvements
- Terminal now executes commands directly with progress messages
- Added `echo` statements to show setup progress
- Better user experience with automatic command execution
- Cross-platform compatibility improved (Windows/macOS/Linux)

## [0.1.3] - 2025-11-21

### 🐛 Critical Bug Fix - Anaconda Python Compatibility
- **Detect Anaconda Python**: Warns users when Anaconda Python is detected (known asyncio issues)
- **Better error messages**: Clear explanation when asyncio errors occur
- **Workaround guide**: Step-by-step instructions to fix Anaconda compatibility issues
- **Python.org recommendation**: Directs users to download regular Python instead

### ✨ Improvements
- Added automatic detection of Anaconda in Python path
- Shows modal dialog with fix instructions for asyncio errors
- Terminal-based setup guide for creating venv with regular Python
- Direct link to download regular Python from python.org
- Gracefully kills backend process when Anaconda issues detected

### 📝 Known Issues
- Anaconda Python has asyncio compatibility issues with uvicorn
- **Workaround**: Use regular Python from python.org or create a venv with regular Python

## [0.1.2] - 2025-11-21

### 🐛 Critical Bug Fix
- **Fixed Windows file lock error**: Added detection and proper handling for WinError 32 (file being used by another process)
- **Better error messages**: Clear instructions when installation fails due to locked files
- **Auto-reload prompt**: Suggests closing and reopening VS Code window to resolve file locks
- **Improved recovery**: Better fallback to manual setup instructions

### ✨ Improvements  
- Enhanced error detection for Windows-specific issues
- Added "Close Window" option when files are locked
- Better user guidance for resolving installation conflicts

## [0.1.1] - 2025-11-21

### 🐛 Bug Fixes
- **Fixed dependency conflicts**: Updated requirements.txt with flexible version ranges to resolve pip installation conflicts
- **Improved first-time setup**: Better user guidance for dependency installation with virtual environment recommendations
- **Permission handling**: Added warnings and guidance for installations requiring administrator privileges
- **Windows compatibility**: Fixed dependency resolution issues on Windows platforms

### ✨ Improvements
- Enhanced setup flow with modal dialogs and clear instructions
- Added step-by-step terminal guidance for virtual environment creation
- Better error messages and recovery options during setup
- Platform-specific instructions (Windows vs macOS/Linux)

## [0.1.0] - 2025-11-21

### 🎉 Initial Release

#### Features
- **Chat Interface**: Interactive AI chat panel with file context support
  - Reference files using `@filename` syntax
  - Switch between Chat and Agent modes
  - Real-time streaming responses
  
- **Multiple AI Providers**:
  - Groq (fast cloud models: Llama 3.3 70B, Mixtral)
  - Gemini (Google's smart models: Gemini 2.5 Flash)
  - Ollama (local/private models: Qwen 2.5 Coder, DeepSeek, etc.)
  - Easy provider switching via dropdown menu
  
- **Code Actions**: Right-click context menu for:
  - Explain Code: Get detailed code explanations
  - Debug Code: AI-powered debugging assistance
  - Generate Documentation: Auto-generate JSDoc/docstrings
  - Refactor Code: Get refactoring suggestions
  
- **VS Code Settings Integration**:
  - Secure API key storage in VS Code settings
  - Configurable models per provider
  - Auto-start backend option
  - Custom backend URL support
  
- **Auto-Managed Backend**:
  - Automatic backend server startup on extension activation
  - Smart Python virtual environment detection
  - One-click dependency installation
  - Status indicator in VS Code status bar
  - Manual controls: Start/Stop/Restart backend
  
- **Commands**:
  - `Loco: Open Chat` (Cmd+Shift+L / Ctrl+Shift+L)
  - `Loco: Explain Code` (Cmd+Shift+E / Ctrl+Shift+E)
  - `Loco: Debug Code` (Cmd+Shift+D / Ctrl+Shift+D)
  - `Loco: Generate Documentation`
  - `Loco: Refactor Code`
  - `Loco: Open Settings`
  - `Loco: Restart Backend`
  - `Loco: Start Backend`
  - `Loco: Stop Backend`

#### Technical
- TypeScript 5.9.3 with strict type checking
- Python 3.11+ backend with FastAPI
- LangChain integration for AI orchestration
- Real-time streaming with Server-Sent Events (SSE)
- Virtual environment (venv) support

#### Privacy & Security
- API keys stored in VS Code settings (not hardcoded)
- Local AI option with Ollama (no data leaves your machine)
- User controls all API keys and provider choices

---

## [Unreleased]

### Planned Features
- Inline code completions
- Code lens integration
- Terminal command assistance
- Git commit message generation
- Multi-file refactoring
- Custom prompt templates
