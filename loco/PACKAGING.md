# Loco Extension - Packaging & Deployment Guide

## 📦 Bundled Backend Architecture

Loco uses an **offline-first architecture** where the Python backend is bundled directly with the VS Code extension. This means:

✅ **No external server required**  
✅ **Works offline** (with Ollama)  
✅ **Auto-starts on extension activation**  
✅ **Auto-installs dependencies**  

## 🏗️ Build Process

### 1. Development Structure
```
loco/
├── loco/              # Extension (TypeScript)
│   ├── src/           # Extension source
│   ├── dist/          # Compiled JS
│   └── backend/       # Backend (copied during build)
└── backend/           # Backend source (Python)
    ├── src/
    ├── requirements.txt
    └── ...
```

### 2. Build Steps

The build process (`npm run package`) does:

1. **Type checking**: `tsc --noEmit`
2. **Linting**: `eslint src`
3. **Copy backend**: `node scripts/copy-backend.js` (NEW!)
   - Copies `../backend/` to `./backend/`
   - Excludes: venv, __pycache__, tests
4. **Bundle extension**: `esbuild` (production mode)

### 3. What Gets Packaged

The `.vsix` file includes:
```
loco-0.1.0.vsix
├── extension.js (bundled TypeScript)
├── package.json
├── README.md
├── CHANGELOG.md
├── LICENSE
└── backend/
    ├── requirements.txt
    ├── src/
    │   ├── main.py
    │   ├── agents/
    │   ├── llm/
    │   └── ...
    └── ...
```

## 🚀 Building & Publishing

### Install VSCE (VS Code Extension CLI)
```bash
npm install -g @vscode/vsce
```

### Build the Extension
```bash
cd loco
npm run package     # Compiles + copies backend
vsce package        # Creates .vsix file
```

This creates: `loco-0.1.0.vsix`

### Test Locally
```bash
# Install in VS Code
code --install-extension loco-0.1.0.vsix

# Or via UI: Extensions → ⋯ → Install from VSIX
```

### Publish to Marketplace

1. **Create Publisher Account**
   - Go to: https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft account
   - Create publisher (e.g., "maulikdang")

2. **Update package.json**
   ```json
   {
     "publisher": "your-publisher-id"
   }
   ```

3. **Get Personal Access Token**
   - Go to: https://dev.azure.com
   - Create PAT with "Marketplace (Publish)" scope

4. **Publish**
   ```bash
   vsce login your-publisher-id
   vsce publish
   ```

## 🔧 Backend Auto-Start

When users install the extension:

1. **Extension activates** (`extension.ts`)
2. **BackendManager starts** (`backendManager.ts`)
3. **Finds bundled backend**:
   - Checks: `extensionPath/backend`
   - Falls back to: `extensionPath/../backend` (dev mode)
4. **Detects Python**:
   - Tries: `backend/venv/bin/python`
   - Falls back to: system `python3` or `python`
5. **Installs dependencies** (if needed):
   ```bash
   pip install -r requirements.txt
   ```
6. **Starts server**:
   ```bash
   python -m uvicorn src.main:app --host 127.0.0.1 --port 8000
   ```

## 📋 Pre-Publish Checklist

- [x] README.md updated with features
- [x] CHANGELOG.md created with v0.1.0
- [x] package.json metadata (author, license, repo)
- [x] .vsixignore configured (includes backend, excludes src)
- [x] LICENSE file added (MIT)
- [x] Backend copy script created
- [x] Build script updated (`npm run package`)
- [ ] Extension icon created (128x128px)
- [ ] Publisher account created
- [ ] Publisher ID in package.json
- [ ] Test locally with .vsix
- [ ] Publish to marketplace

## 🎯 User Requirements

Users only need:
- **VS Code** 1.105.0+
- **Python** 3.8+

The extension handles everything else:
- ✅ Backend bundled
- ✅ Dependencies auto-installed
- ✅ Server auto-started
- ✅ No manual setup required!

## 🔍 Troubleshooting

### Backend Won't Start
- Check: Python 3.8+ installed (`python3 --version`)
- Check: Backend files in correct location
- Use: `Loco: Restart Backend` command
- Check: Output Console → "Loco Backend"

### Dependencies Install Fails
- Manually install: `pip install -r <extensionPath>/backend/requirements.txt`
- Check: Internet connection (for first-time pip install)

### Wrong Python Version
- Set in settings: `loco.general.backendPath`
- Point to directory with correct Python venv

## 📝 Notes

- Backend runs on `localhost:8000` (not exposed externally)
- Each user gets their own local backend instance
- No shared state between users
- Complete privacy and control
