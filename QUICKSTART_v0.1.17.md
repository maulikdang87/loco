# Quick Start: LoCo v0.1.17 on Windows

## What's Fixed in This Version

✅ **Backend stops properly when VS Code closes** (no more orphan processes)  
✅ **Backend auto-starts after dependency install** (no manual reload)  
✅ **Dependencies only checked once** (faster subsequent startups)

---

## Installation

1. **Install the VSIX file**:
   ```
   Press Ctrl+Shift+P → "Extensions: Install from VSIX" → Select loco-ai-0.1.17.vsix
   ```

2. **Reload VS Code** when prompted

---

## First Time Setup (Fresh Install)

1. Open VS Code in your project
2. You'll see: **"🚀 Loco Backend - First Time Setup"**
3. Click **"Install Now"**
4. Wait 1-2 minutes (installing dependencies)
5. Success message: **"✅ Dependencies installed! Backend will start automatically."**
6. Status bar shows: **"Loco: Ready"** ✅

**No manual reload required!**

---

## Subsequent Startups

1. Open VS Code
2. Backend starts automatically (within 5 seconds)
3. Status bar shows: **"Loco: Ready"**

**No dependency prompts, no waiting!**

---

## Verify Backend Stops Properly

### After closing VS Code:

```powershell
# Check for orphan Python processes (should be empty)
tasklist /FI "IMAGENAME eq python.exe" /V | findstr uvicorn

# Check if port 8000 is freed (should be empty)
netstat -ano | findstr :8000
```

**Expected**: Both commands return nothing (empty output)

---

## Troubleshooting

### Backend Won't Stop

**If you still see Python processes after closing VS Code:**

```powershell
# Force kill all Python processes
taskkill /F /IM python.exe

# Or kill specific PID:
taskkill /F /T /PID <PID>
```

### Dependencies Keep Re-Prompting

**If you're asked to install dependencies every time:**

Check if marker file exists:
```powershell
Test-Path ".\backend\.deps_installed"
```

If it returns `False`, dependencies aren't being marked as installed. Check file permissions.

### Backend Won't Start

**If status bar shows "Loco: Stopped" after dependency install:**

1. Check if port 8000 is occupied:
   ```powershell
   netstat -ano | findstr :8000
   ```

2. If occupied, kill the process:
   ```powershell
   # Find the PID from the netstat output, then:
   taskkill /F /PID <PID>
   ```

3. Click status bar "Loco: Stopped" → **Restart Backend**

---

## Testing Checklist

After installation, verify:

- [ ] Dependencies installed successfully (first time)
- [ ] Backend started automatically (no manual reload)
- [ ] Status bar shows "Loco: Ready"
- [ ] Close VS Code → Check Task Manager → No Python/uvicorn processes
- [ ] Reopen VS Code → No dependency prompt
- [ ] Backend starts automatically within 5 seconds

---

## Key Files

- **Backend folder**: `loco/backend/`
- **Marker file**: `loco/backend/.deps_installed` (created after first install)
- **Requirements**: `loco/backend/requirements.txt`

---

## What Changed Under the Hood

### 1. Process Tree Termination (Windows)
```typescript
// OLD: Only killed cmd.exe wrapper
backendProcess.kill();

// NEW: Kills entire process tree (cmd.exe + python.exe + uvicorn)
execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
```

### 2. Auto-Start After Install
```typescript
// OLD: Required manual reload
vscode.window.showInformationMessage('Please reload the window.', 'Reload Window');

// NEW: Continues automatically
vscode.window.showInformationMessage('Backend will start automatically.', 'OK');
resolve(true); // Continues startup flow
```

### 3. Single Dependency Check
```typescript
// Checks for marker file first
if (fs.existsSync(markerFile)) {
    console.log('✅ Dependencies already verified');
    return true; // Skip re-checking
}
```

---

## Documentation

For detailed information:
- **WINDOWS_LIFECYCLE_FIXES.md** - Technical details of all fixes
- **WINDOWS_TESTING_GUIDE.md** - 6 comprehensive test cases
- **RELEASE_v0.1.17.md** - Complete release notes
- **CHANGELOG.md** - Full version history

---

## Need Help?

1. Check Task Manager → Details tab → Look for `python.exe` processes
2. Check port usage: `netstat -ano | findstr :8000`
3. View console logs: F12 → Console tab in VS Code
4. Check backend logs: View → Output → "Loco Backend"

---

## Success Indicators

✅ Status bar: "Loco: Ready"  
✅ No Python processes after closing VS Code  
✅ Port 8000 freed after closing VS Code  
✅ No dependency prompts on subsequent startups  
✅ Backend starts within 5 seconds  

---

**Version**: 0.1.17  
**Package Size**: 228 KB  
**Release Date**: January 23, 2025  
**Platform**: Windows 10/11, macOS, Linux
