# Windows Backend Testing Guide - v0.1.17

## Quick Verification Checklist

After updating to v0.1.17, verify these critical fixes:

- [ ] Backend stops completely when VS Code closes (no orphan processes)
- [ ] Port 8000 is freed when VS Code closes
- [ ] Dependencies only prompted once (not on every startup)
- [ ] Backend auto-starts after dependency install (no manual reload)
- [ ] Old backend versions don't continue running

---

## Test 1: Backend Process Termination

**Objective**: Verify backend process fully terminates when VS Code closes

### Steps:
1. Open VS Code with Loco extension
2. Wait for backend to start (status bar shows "Loco: Ready")
3. Open Task Manager (Ctrl + Shift + Esc)
4. Go to "Details" tab
5. Find processes with these names:
   - `python.exe` - Look for command line containing "uvicorn" or "src.main:app"
   - `cmd.exe` - May have child python process
6. Note the PID(s) of these processes
7. **Close VS Code completely** (not just the file, close the entire window)
8. Wait 2-3 seconds
9. Check Task Manager again:
   - ✅ **EXPECTED**: All Python/cmd processes with uvicorn should be GONE
   - ❌ **FAIL**: If any remain, backend didn't terminate properly

### Verification Command:
```powershell
# Run this in PowerShell AFTER closing VS Code
tasklist /FI "IMAGENAME eq python.exe" /V | findstr uvicorn

# Expected output: Nothing (empty)
# If you see output: Backend process is still running (BUG)
```

### Port Check:
```powershell
# Check if port 8000 is still in use
netstat -ano | findstr :8000

# Expected output: Nothing (empty)
# If you see output: Port is still occupied (BUG)
```

---

## Test 2: First-Time Dependency Installation

**Objective**: Verify dependencies install correctly and backend auto-starts

### Setup:
1. Locate backend folder: `loco/backend/`
2. **Delete** the file `.deps_installed` (if it exists)
3. Close VS Code completely

### Steps:
1. Open VS Code in the Loco project folder
2. Extension activates and checks dependencies
3. Should see popup: "🚀 Loco Backend - First Time Setup - Dependencies need to be installed. This will take 1-2 minutes."
4. Click "Install Now"
5. Progress notification appears: "Installing Loco backend dependencies..."
6. Wait for installation to complete (1-2 minutes)
7. Should see success message: "✅ Dependencies installed! Backend will start automatically."
8. Click "OK"
9. Wait 5-10 seconds
10. Check status bar:
    - ✅ **EXPECTED**: Shows "Loco: Ready" (backend running)
    - ❌ **FAIL**: Still shows "Loco: Starting..." or "Loco: Stopped"

### Console Output Check:
1. Press F1 → "Developer: Toggle Developer Tools"
2. Go to "Console" tab
3. Look for these messages:
   ```
   ✅ Dependencies already verified (marker file exists)  // On subsequent starts
   ✅ All dependencies installed                           // First install
   ✅ Backend started successfully                         // After install
   ```

---

## Test 3: Subsequent Startups (No Re-prompt)

**Objective**: Verify dependencies are NOT checked again on subsequent startups

### Prerequisites:
- Backend dependencies already installed (Test 2 completed)
- `.deps_installed` marker file exists in `backend/` folder

### Steps:
1. Close VS Code completely
2. Reopen VS Code in the Loco project
3. Extension activates
4. ✅ **EXPECTED**: NO popup asking to install dependencies
5. ✅ **EXPECTED**: Backend starts automatically within 5 seconds
6. ✅ **EXPECTED**: Status bar shows "Loco: Ready"
7. Check console (F12 → Console):
   ```
   ✅ Dependencies already verified (marker file exists)
   🚀 Starting backend server...
   ✅ Backend started successfully
   ```

### What Should NOT Happen:
- ❌ No popup: "Dependencies need to be installed"
- ❌ No re-checking of each dependency (uvicorn, fastapi, etc.)
- ❌ No delay from dependency verification

---

## Test 4: Old Backend Version Cleanup

**Objective**: Verify old backend versions don't continue running after update

### Scenario: You previously had v0.1.9 installed and upgraded to v0.1.17

### Steps:
1. Open Task Manager → Details tab
2. Before closing VS Code, note backend PID:
   ```powershell
   tasklist /FI "IMAGENAME eq python.exe" /V | findstr uvicorn
   ```
3. Close VS Code
4. Wait 3 seconds
5. Check if process is gone:
   ```powershell
   tasklist /FI "IMAGENAME eq python.exe" /V | findstr uvicorn
   ```
6. ✅ **EXPECTED**: No output (process terminated)
7. Reopen VS Code
8. New backend starts (new PID)
9. Close VS Code again
10. ✅ **EXPECTED**: New process also terminates

### Common Issue (Before v0.1.17):
```powershell
# Before fix, you would see multiple Python processes:
python.exe    12345   ...   uvicorn  # Old version still running
python.exe    67890   ...   uvicorn  # New version just started
# Both trying to use port 8000 → conflict!
```

---

## Test 5: Port Conflict Detection

**Objective**: Verify backend handles port conflicts gracefully

### Setup:
1. Manually start a Python server on port 8000:
   ```powershell
   python -m http.server 8000
   ```
2. Keep this terminal open

### Steps:
1. Open VS Code with Loco
2. Backend tries to start
3. ✅ **EXPECTED**: Error message or log showing "Address already in use"
4. Backend should fail gracefully (not crash)
5. Status bar shows "Loco: Error" or "Loco: Stopped"
6. Close dummy server (Ctrl + C in terminal)
7. Click status bar "Loco: Stopped" → Restart Backend
8. ✅ **EXPECTED**: Backend starts successfully on retry

---

## Test 6: Multiple VS Code Windows

**Objective**: Test behavior with multiple Loco instances

### Steps:
1. Open VS Code Window 1 with Loco project
2. Backend starts on port 8000
3. Open VS Code Window 2 with Loco project (new window)
4. ✅ **EXPECTED**: One of these behaviors:
   - Window 2 backend detects port in use and shows error
   - OR Window 2 reuses Window 1's backend
5. Close Window 1
6. Check if backend stopped:
   ```powershell
   netstat -ano | findstr :8000
   ```
7. Close Window 2
8. Check if backend stopped (should be clear now)

---

## Debugging Tools

### Check Running Python Processes
```powershell
# List all Python processes with details
tasklist /FI "IMAGENAME eq python.exe" /V

# Filter for uvicorn (Loco backend)
tasklist /FI "IMAGENAME eq python.exe" /V | findstr uvicorn
```

### Check Port 8000 Usage
```powershell
# See which process is using port 8000
netstat -ano | findstr :8000

# Output format:
# TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    12345
#                                                    ↑ PID
```

### Kill Orphan Backend Process
```powershell
# If backend didn't stop properly, force kill:
taskkill /F /IM python.exe

# Or kill specific PID:
taskkill /F /PID 12345

# Kill entire process tree:
taskkill /F /T /PID 12345
```

### Check Dependency Marker
```powershell
# Check if marker file exists
Test-Path ".\backend\.deps_installed"

# View marker contents (timestamp)
Get-Content ".\backend\.deps_installed"

# Delete marker (force re-check)
Remove-Item ".\backend\.deps_installed"
```

### View Backend Logs
1. F1 → "Developer: Toggle Developer Tools"
2. Console tab → Look for Loco backend messages
3. Or check VS Code Output panel:
   - View → Output
   - Select "Loco Backend" from dropdown

---

## Expected Results Summary

| Test | Expected Behavior | v0.1.16 (Old) | v0.1.17 (New) |
|------|-------------------|---------------|---------------|
| Backend stops on VS Code close | Process fully terminates | ❌ Orphan process | ✅ Clean termination |
| Port 8000 freed on close | No process using port | ❌ Port occupied | ✅ Port freed |
| Dependency re-prompt | Only once, not every startup | ❌ Every startup | ✅ Once only |
| Auto-start after install | Backend starts without reload | ❌ Manual reload | ✅ Auto-start |
| Old version cleanup | Only current version runs | ❌ Multiple versions | ✅ Single version |

---

## Troubleshooting

### Issue: Backend Still Running After Close
**Symptoms**: `tasklist` shows python.exe with uvicorn after closing VS Code

**Possible Causes**:
1. Extension didn't update properly → Check version in Extensions panel
2. Multiple VS Code windows open → Close all windows
3. Backend crash (not stopped gracefully) → Manually kill process

**Solution**:
```powershell
taskkill /F /T /IM python.exe
```

### Issue: Dependencies Re-Prompt Every Time
**Symptoms**: Always asks to install dependencies on startup

**Possible Causes**:
1. Marker file not created → Check file permissions
2. Marker file deleted accidentally → Check if `.deps_installed` exists
3. Using different backend paths → Check console for backend path

**Solution**:
```powershell
# Manually create marker
echo %date% %time% > backend\.deps_installed
```

### Issue: Backend Won't Start After Install
**Symptoms**: Installation succeeds but status bar shows "Stopped"

**Possible Causes**:
1. Port 8000 still occupied → Check with `netstat`
2. Python environment issue → Check Python version
3. Missing dependencies → Check console for import errors

**Solution**:
1. Kill any processes on port 8000
2. Delete `.deps_installed` marker
3. Restart VS Code (force fresh install)

---

## Reporting Issues

If any test fails, please report with:
1. Test number that failed
2. VS Code version
3. Windows version
4. Console output (F12 → Console → copy all Loco messages)
5. Output from:
   ```powershell
   tasklist /FI "IMAGENAME eq python.exe" /V
   netstat -ano | findstr :8000
   ```

## Success Criteria

✅ All 6 tests pass
✅ No orphan Python processes
✅ Port 8000 freed on close
✅ Dependencies checked once
✅ Backend auto-starts after install
✅ Clean startup/shutdown cycle
