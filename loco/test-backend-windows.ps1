# Windows Backend Test Script
# Run this in PowerShell to test if backend can start

Write-Host "🔍 Testing Loco Backend on Windows..." -ForegroundColor Cyan

# Check if we're in the right directory
if (-Not (Test-Path "backend/src/main.py")) {
    Write-Host "❌ Error: Run this script from the loco extension root directory" -ForegroundColor Red
    exit 1
}

# Check for Python
Write-Host "`n📋 Checking Python..." -ForegroundColor Yellow
$pythonCmd = $null

# Check for venv first
if (Test-Path "backend/locovenv/Scripts/python.exe") {
    $pythonCmd = "backend\locovenv\Scripts\python.exe"
    Write-Host "✅ Found Python in locovenv: $pythonCmd" -ForegroundColor Green
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
    $version = & python --version 2>&1
    Write-Host "✅ Found system Python: $version" -ForegroundColor Green
} else {
    Write-Host "❌ Python not found. Please install Python 3.8+" -ForegroundColor Red
    exit 1
}

# Check Python version
Write-Host "`n📋 Checking Python version..." -ForegroundColor Yellow
$versionOutput = & $pythonCmd --version 2>&1
Write-Host "   $versionOutput" -ForegroundColor Gray

# Check dependencies
Write-Host "`n📋 Checking dependencies..." -ForegroundColor Yellow

$deps = @('uvicorn', 'fastapi', 'pydantic_settings', 'langchain', 'tree_sitter')
$missingDeps = @()

foreach ($dep in $deps) {
    $check = & $pythonCmd -c "import $dep" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ $dep" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $dep (missing)" -ForegroundColor Red
        $missingDeps += $dep
    }
}

if ($missingDeps.Count -gt 0) {
    Write-Host "`n⚠️  Missing dependencies detected!" -ForegroundColor Yellow
    Write-Host "Install with: $pythonCmd -m pip install -r backend\requirements.txt" -ForegroundColor Cyan
    
    $install = Read-Host "`nInstall now? (y/n)"
    if ($install -eq 'y') {
        Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
        & $pythonCmd -m pip install -r backend\requirements.txt
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Installation failed" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Skipping installation" -ForegroundColor Gray
        exit 1
    }
}

# Check port 8000
Write-Host "`n📋 Checking if port 8000 is available..." -ForegroundColor Yellow
$port = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($port) {
    Write-Host "⚠️  Port 8000 is already in use!" -ForegroundColor Yellow
    Write-Host "   Process ID: $($port.OwningProcess)" -ForegroundColor Gray
    Write-Host "   State: $($port.State)" -ForegroundColor Gray
    
    $kill = Read-Host "`nKill the process? (y/n)"
    if ($kill -eq 'y') {
        Stop-Process -Id $port.OwningProcess -Force
        Write-Host "✅ Process killed" -ForegroundColor Green
        Start-Sleep -Seconds 2
    } else {
        Write-Host "⚠️  Backend may fail to start" -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Port 8000 is available" -ForegroundColor Green
}

# Try to start backend
Write-Host "`n🚀 Starting backend..." -ForegroundColor Cyan
Write-Host "   Command: $pythonCmd -m uvicorn src.main:app --host 127.0.0.1 --port 8000" -ForegroundColor Gray
Write-Host "   Directory: backend\" -ForegroundColor Gray
Write-Host "`n   Press Ctrl+C to stop the backend`n" -ForegroundColor Yellow

cd backend
& $pythonCmd -m uvicorn src.main:app --host 127.0.0.1 --port 8000
