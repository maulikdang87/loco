# Loco - AI Code Assistant

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/maulikdang87/loco)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Loco** is a powerful AI-powered code assistant for VS Code that combines the speed of local models with the intelligence of cloud AI providers. Get contextual code completions, intelligent chat assistance, and autonomous agent capabilities - all with complete control over your data and API keys.

## ✨ Features

### 🤖 **Intelligent Chat Assistant**
- **Contextual Conversations**: Chat with AI about your code with file references using `@filename`
- **Multiple AI Providers**: Choose between Groq (fast), Gemini (smart), or Ollama (local/private)
- **File Context**: Add files to chat context for better, more accurate responses
- **Two Modes**:
  - **Chat Mode**: Ask questions, get explanations, brainstorm solutions
  - **Agent Mode**: Give high-level tasks and let AI execute autonomously

### 🚀 **Code Actions**
Right-click on any code selection to:
- **Explain Code**: Get detailed explanations of complex code
- **Debug Code**: AI-powered debugging assistance
- **Generate Documentation**: Auto-generate JSDoc/docstrings
- **Refactor Code**: Improve code quality and structure

### 💡 **Inline Completions** (Coming Soon)
- Context-aware code suggestions as you type
- Multi-line completions for complex logic
- Configurable delay and temperature

### 🔐 **Privacy First**
- **Local Option**: Use Ollama for 100% local AI (no data leaves your machine)
- **API Keys in VS Code**: Store your API keys securely in VS Code settings
- **Your Choice**: Pick your AI provider based on speed, quality, or privacy needs

### ⚙️ **Auto-Managed Backend**
- Backend automatically starts when extension activates
- Auto-detects Python virtual environments
- One-click dependency installation
- Status indicator in VS Code status bar

## 📦 Installation

### Prerequisites
- **Python 3.8+** must be installed on your system
  - The extension includes a bundled Python backend that auto-starts
  - Check: `python3 --version` or `python --version`
  - Download: https://www.python.org/downloads/

### From VS Code Marketplace (Coming Soon)
1. Open VS Code
2. Go to Extensions (`Cmd+Shift+X` or `Ctrl+Shift+X`)
3. Search for "Loco"
4. Click Install

### Manual Installation
1. Download the latest `.vsix` file from [Releases](https://github.com/maulikdang87/loco/releases)
2. Open VS Code
3. Go to Extensions → `⋯` → Install from VSIX
4. Select the downloaded file
5. The backend will automatically start when the extension activates!

## 🚀 Quick Start

### 1. Configure AI Provider

Open Settings (`Cmd+,` or `Ctrl+,`) and search for "Loco":

**For Groq (Fast & Free):**
- Get API key: https://console.groq.com/keys
- Set `loco.apiKeys.groq`

**For Gemini (Smart):**
- Get API key: https://aistudio.google.com/app/apikey
- Set `loco.apiKeys.gemini`

**For Ollama (Local & Private):**
- Install Ollama: https://ollama.com
- Run: `ollama pull qwen2.5-coder:7b`
- No API key needed!

### 2. Start Using Loco

**Open Chat:**
- Press `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux)
- Or use Command Palette: `Loco: Open Chat`

**Use Code Actions:**
1. Select any code
2. Right-click
3. Choose Loco action (Explain, Debug, Document, Refactor)

**Switch Providers:**
- Use dropdown in chat panel to switch between Groq/Gemini/Ollama

## ⚙️ Configuration

### API Keys
```json
{
  "loco.apiKeys.groq": "gsk_your_key_here",
  "loco.apiKeys.gemini": "your_gemini_key_here",
  "loco.apiKeys.openai": "sk-your_openai_key_here"
}
```

### Models
```json
{
  "loco.chat.model.groq": "llama-3.3-70b-versatile",
  "loco.chat.model.gemini": "gemini-2.5-flash",
  "loco.chat.model.ollama": "qwen2.5-coder:7b"
}
```

### Backend
```json
{
  "loco.general.autoStartBackend": true,
  "loco.general.backendUrl": "http://localhost:8000"
}
```

## 🎯 Use Cases

- **Learning**: Understand unfamiliar code with AI explanations
- **Debugging**: Get AI assistance finding and fixing bugs
- **Documentation**: Auto-generate comprehensive docstrings
- **Refactoring**: Improve code quality with AI suggestions
- **Code Review**: Get AI feedback on code changes
- **Problem Solving**: Brainstorm solutions with AI

## 🛠️ Requirements

- **VS Code**: 1.105.0 or higher
- **Python**: 3.8+ (required - backend is bundled and auto-starts)
  - The extension automatically detects Python on your system
  - Dependencies are installed automatically on first run
- **Ollama**: Optional, only if you want 100% local/private AI models
  - Install from: https://ollama.com
  - Pull models: `ollama pull qwen2.5-coder:7b`

### What Gets Installed
The extension includes:
- ✅ Python backend (bundled in .vsix)
- ✅ Auto-dependency installation (FastAPI, LangChain, etc.)
- ✅ Auto-start/restart functionality
- ❌ No external services required (unless using cloud providers)

## 📝 Commands

- `Loco: Open Chat` - Open chat panel (`Cmd+Shift+L`)
- `Loco: Explain Code` - Explain selected code (`Cmd+Shift+E`)
- `Loco: Debug Code` - Debug selected code (`Cmd+Shift+D`)
- `Loco: Generate Documentation` - Generate docs for code
- `Loco: Refactor Code` - Get refactoring suggestions
- `Loco: Open Settings` - Open Loco settings
- `Loco: Restart Backend` - Restart the backend server
- `Loco: Start/Stop Backend` - Manually control backend

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Issues & Support

Found a bug or have a feature request?
- [Report an Issue](https://github.com/maulikdang87/loco/issues)
- [Discussions](https://github.com/maulikdang87/loco/discussions)

## 🙏 Acknowledgments

Built with:
- [LangChain](https://langchain.com) - AI orchestration
- [FastAPI](https://fastapi.tiangolo.com) - Backend framework
- [Ollama](https://ollama.com) - Local AI models

---

**Made with ❤️ for developers who want AI assistance without compromising control**


## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
