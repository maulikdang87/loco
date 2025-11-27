# Windows Backend Lifecycle Fixes - v0.1.17

## Issues Fixed

### 1. Backend Not Stopping When VS Code Closes
**Problem**: Backend processes remained running after closing VS Code, causing port conflicts and using old backend versions.

**Root Cause**: On Windows, `spawn()` with `shell: true` creates a process tree (cmd.exe → python.exe → uvicorn). The simple `kill()` call only terminated cmd.exe, leaving Python processes as orphans.

**Solution**:
- Added Windows-specific process tree termination using `taskkill /F /T /PID`
- Falls back to SIGTERM/SIGKILL on Unix systems
- Added graceful shutdown period before force kill
- Implemented proper cleanup in `stop()` method

**Code Changes** (`backendManager.ts` line 311-345):
```typescript
async stop(): Promise<void> {
    if (this.backendProcess) {
        console.log('🛑 Stopping Loco backend...');
        
        try {
            // On Windows, kill the entire process tree
            if (process.platform === 'win32') {
                const pid = this.backendProcess.pid;
                if (pid) {
                    try {
                        // Use taskkill to kill process tree on Windows
                        const { execSync } = require('child_process');
                        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
                        console.log(`✅ Killed Windows backend process tree (PID: ${pid})`);
                    } catch (error) {
                        console.error('Failed to taskkill, using standard kill:', error);
                        this.backendProcess.kill('SIGTERM');
                    }
                }
            } else {
                // On Unix, SIGTERM is sufficient
                this.backendProcess.kill('SIGTERM');
            }
            
            // Wait for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Force kill if still running
            if (this.backendProcess && !this.backendProcess.killed) {
                this.backendProcess.kill('SIGKILL');
            }
        } catch (error) {
            console.error('Error stopping backend:', error);
        }
        
        this.backendProcess = null;
        this.updateStatusBar('stopped');
        console.log('✅ Backend stopped');
    }
}
```

### 2. Dependency Installation Flow Improvement
**Problem**: After installing dependencies, users had to manually reload VS Code. The backend didn't start automatically.

**Solution**:
- Changed success message from "Please reload window" to "Backend will start automatically"
- Removed reload window prompt after successful dependency install
- Backend now starts automatically after dependency verification

**Code Changes** (`backendManager.ts` line 793-798):
```typescript
vscode.window.showInformationMessage(
    '✅ Dependencies installed! Backend will start automatically.',
    'OK'
);
resolve(true);
```

Previously required user to click "Reload Window" button:
```typescript
// OLD CODE (removed):
vscode.window.showInformationMessage(
    '✅ Backend dependencies installed successfully! Please reload the window.',
    'Reload Window'
).then(choice => {
    if (choice === 'Reload Window') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
});
```

### 3. Dependency Check Optimization
**Problem**: Dependencies were being checked on every VS Code startup, even after successful installation.

**Solution**:
- `.deps_installed` marker file already exists (from v0.1.10)
- Marker file is created after successful dependency install
- On subsequent startups, if marker exists, dependency check is skipped
- Only checks dependencies once per installation

**Flow**:
1. First time: Check dependencies → Install if needed → Create marker
2. Subsequent starts: Check marker exists → Skip dependency verification → Start backend immediately

## Testing Instructions

### Test 1: Clean Install
1. Delete `.deps_installed` file from `backend/` folder (if exists)
2. Close VS Code completely
3. Open VS Code in the Loco project
4. Should prompt to install dependencies (first time only)
5. Click "Install Now"
6. Wait for installation to complete
7. Backend should start automatically (no reload needed)
8. Check status bar shows "Loco: Ready"

### Test 2: Backend Shutdown on VS Code Close
1. Start backend (status bar shows "Loco: Ready")
2. On Windows: Open Task Manager → Details tab
3. Find `python.exe` processes with command line containing "uvicorn"
4. Note the PID
5. Close VS Code window
6. Check Task Manager - Python process should be gone
7. Verify port 8000 is available: `netstat -ano | findstr :8000`
8. No output = port is free (correct)

### Test 3: Subsequent Startups
1. Backend already installed (marker file exists)
2. Close and reopen VS Code
3. Should NOT prompt for dependency install
4. Backend should start automatically
5. Check console: Should show "✅ Dependencies already verified (marker file exists)"

### Test 4: Multiple VS Code Windows
1. Open VS Code window 1 with Loco
2. Backend starts on port 8000
3. Open VS Code window 2 with Loco
4. Second backend should detect port conflict or use different port
5. Close window 1
6. Backend 1 should stop
7. Close window 2
8. Backend 2 should stop
9. Verify no Python processes remain

## Verification Commands

### Windows
```powershell
# Check for running Python/uvicorn processes
tasklist /FI "IMAGENAME eq python.exe" /V

# Check port 8000 usage
netstat -ano | findstr :8000

# Kill orphan processes (if needed)
taskkill /F /IM python.exe /T
```

### macOS/Linux
```bash
# Check for running Python/uvicorn processes
ps aux | grep uvicorn

# Check port 8000 usage
lsof -i :8000

# Kill orphan processes (if needed)
pkill -f uvicorn
```

## Known Limitations

1. **Port Conflicts**: If backend is already running on port 8000 from another source, startup will fail. Users need to manually kill the process or change port in settings.

2. **Multiple Instances**: Opening multiple VS Code windows with Loco may cause port conflicts. Only one backend can run on port 8000 at a time.

3. **Dependency Changes**: If `requirements.txt` is updated, users need to manually delete `.deps_installed` marker file to trigger re-installation.

## Future Improvements

1. **Port Conflict Detection**: Check if port 8000 is available before starting, auto-kill orphan processes
2. **Version Tracking**: Store backend version in marker file, auto-reinstall on version mismatch
3. **Multi-Instance Support**: Use random available ports for multiple VS Code windows
4. **Dependency Diff**: Compare installed packages vs requirements.txt, only reinstall if outdated

## Changelog

### v0.1.17
- ✅ Fixed Windows backend not stopping when VS Code closes (process tree termination)
- ✅ Improved dependency installation flow (no manual reload required)
- ✅ Backend auto-starts after successful dependency install
- ✅ Optimized dependency checks (only checks once using marker file)
- ✅ Added graceful shutdown with fallback to force kill

### Previous Versions
- v0.1.16: Windows console encoding fix (OSError [Errno 22])
- v0.1.15: Improved error handling and logging
- v0.1.13-v0.1.14: Chat mode fixes and error propagation
- v0.1.11-v0.1.12: Health check improvements
- v0.1.10: Dependency marker file system
- v0.1.9: Agent mode API key fixes
