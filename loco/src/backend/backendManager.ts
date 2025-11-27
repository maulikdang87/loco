import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as path from 'path';
import axios from 'axios';

export class BackendManager {
    private backendProcess: childProcess.ChildProcess | null = null;
    private readonly backendPort = 8000;
    private readonly backendHost = '127.0.0.1';
    private statusBarItem: vscode.StatusBarItem;
    private maxRetries = 3;
    private retryCount = 0;
    private startupGracePeriod = 5000; // 5 seconds grace period
    private startupTime: number = 0;
    private stderrBuffer: string = ''; // Buffer to store backend stderr output
    private isStarting: boolean = false; // Prevent concurrent startups

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'loco.restartBackend';
        
        // Ensure backend stops when VS Code closes
        process.on('beforeExit', () => {
            console.log('🔄 VS Code closing, stopping backend...');
            this.stop();
        });
        
        process.on('exit', () => {
            console.log('🔄 Process exit, stopping backend...');
            this.stop();
        });
    }
    
    /**
     * Check if we're still in startup grace period
     */
    private isInGracePeriod(): boolean {
        return Date.now() - this.startupTime < this.startupGracePeriod;
    }

    /**
     * Clear startup flag
     */
    private clearStartupFlag(): void {
        this.isStarting = false;
    }

    /**
     * Sync status bar with actual backend state
     */
    async syncStatus(): Promise<void> {
        // Use Windows-specific check for better reliability on Windows
        const isRunning = process.platform === 'win32' 
            ? await this.isRunningWindows() 
            : await this.isRunning();
            
        if (isRunning) {
            console.log('🔄 Backend running normally, updating status');
            this.updateStatusBar('ready');
        } else {
            console.log('🔄 Backend not running, updating status');
            this.updateStatusBar('stopped');
        }
    }

    /**
     * Windows-specific status sync with continuous monitoring
     */
    private async syncStatusWindows(): Promise<void> {
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            try {
                if (await this.isRunningWindows()) {
                    console.log('✅ Windows backend detected as ready');
                    this.updateStatusBar('ready');
                    return;
                }
            } catch (error) {
                console.log(`🔍 Windows health check attempt ${attempts + 1} failed:`, error);
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between attempts
        }
        
        console.log('❌ Windows backend failed to become ready after 10 attempts');
        this.updateStatusBar('error');
    }

    /**
     * Kill any processes using port 8000 (Windows only)
     */
    private async killPortProcesses(): Promise<void> {
        if (process.platform !== 'win32') return;
        
        try {
            const { execSync } = require('child_process');
            // Find processes using port 8000
            const output = execSync('netstat -ano | findstr :8000', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
            
            const lines = output.split('\n').filter((line: string) => line.trim());
            const pids = new Set<string>();
            
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 5) {
                    const pid = parts[parts.length - 1];
                    if (pid && !isNaN(parseInt(pid))) {
                        pids.add(pid);
                    }
                }
            }
            
            for (const pid of pids) {
                try {
                    execSync(`taskkill /pid ${pid} /F`, { stdio: 'ignore' });
                    console.log(`🔪 Killed process using port 8000: PID ${pid}`);
                } catch {
                    // Process might already be dead, ignore
                }
            }
        } catch {
            // No processes found or netstat failed, ignore
        }
    }

    /**
     * Start backend server if not already running
     */
    async start(context: vscode.ExtensionContext): Promise<boolean> {
        console.log('🚀 Starting Loco backend...');
        console.log('📍 Backend start() method called');
        
        // Prevent concurrent startups
        if (this.isStarting) {
            console.log('⏳ Backend startup already in progress, skipping...');
            return false;
        }
        
        // Check if already running - use Windows-specific check on Windows
        console.log('📍 Checking if backend is already running...');
        const isRunning = process.platform === 'win32' 
            ? await this.isRunningWindows() 
            : await this.isRunning();
            
        if (isRunning) {
            console.log('✅ Backend already running, updating status bar');
            this.updateStatusBar('ready');
            return true;
        }
        
        // If we have a dead process reference, clean it up
        if (this.backendProcess && !this.backendProcess.killed) {
            console.log('🧹 Cleaning up dead backend process...');
            try {
                this.backendProcess.kill();
                this.backendProcess = null;
            } catch (error) {
                console.warn('Warning: Could not clean up old process:', error);
            }
        }
        
        // On Windows, kill any hanging processes on port 8000
        if (process.platform === 'win32') {
            console.log('🧹 Cleaning up any hanging processes on port 8000...');
            await this.killPortProcesses();
            // Wait a moment for processes to die
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('📍 Backend not running, proceeding with startup...');
        
        // Set startup flag
        this.isStarting = true;

        // Find backend path
        const backendPath = this.findBackendPath(context);
        console.log(`📁 Found backend path: ${backendPath}`);
        if (!backendPath) {
            vscode.window.showErrorMessage(
                'Loco backend not found. Please check installation.'
            );
            return false;
        }
        console.log(`📁 Backend path is valid and exists`);
        console.log(`📁 Extension path: ${context.extensionPath}`);

        // Find Python executable (prefer venv if it exists)
        console.log('📍 Finding Python executable...');
        const pythonPath = await this.findPython(backendPath);
        if (!pythonPath) {
            console.log('❌ Python not found!');
            vscode.window.showErrorMessage(
                'Python 3 not found. Please install Python 3.8+.'
            );
            return false;
        }
        console.log(`📍 Found Python: ${pythonPath}`);
        console.log(`🐍 Python type: ${pythonPath.includes('locovenv') ? 'locovenv' : pythonPath.includes('venv') ? 'venv' : 'system'}`);
        console.log(`📁 Python exists on filesystem: ${require('fs').existsSync(pythonPath)}`);

        // Check and ensure dependencies are installed
        console.log('📋 Checking dependencies...');
        const depsInstalled = await this.ensureDependencies(pythonPath, backendPath);
        console.log(`📋 Dependency check result: ${depsInstalled}`);
        
        if (!depsInstalled) {
            // Dependencies not installed and user declined setup
            console.log('❌ Dependencies not installed, aborting backend start');
            this.updateStatusBar('error');
            this.clearStartupFlag();
            return false;
        }

        // After successful dependency install, continue with backend startup
        console.log('✅ Dependencies verified, proceeding to start backend server...');
        console.log('🎯 We made it past ensureDependencies() - about to spawn backend process');

        // Get API keys from VS Code settings
        const config = vscode.workspace.getConfiguration('loco');
        const geminiKey = config.get<string>('apiKeys.gemini', '');
        const groqKey = config.get<string>('apiKeys.groq', '');
        const openaiKey = config.get<string>('apiKeys.openai', '');

        // Set up environment with API keys
        const env = {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            GEMINI_API_KEY: geminiKey,
            GROQ_API_KEY: groqKey,
            OPENAI_API_KEY: openaiKey,
            HOST: this.backendHost,
            PORT: this.backendPort.toString(),
        };

        // Mark startup time for grace period
        this.startupTime = Date.now();
        this.updateStatusBar('starting');
        this.stderrBuffer = ''; // Clear previous errors
        console.log('🎯 About to spawn backend process...');

        try {
            // Prepare command for different platforms
            const isWindows = process.platform === 'win32';
            const spawnArgs = ['-m', 'uvicorn', 'src.main:app',
                '--host', this.backendHost,
                '--port', this.backendPort.toString(),
            ];
            const spawnOptions: childProcess.SpawnOptions = {
                cwd: backendPath,
                env,
                shell: process.platform === 'win32',
                windowsHide: true,
            };

            // Use path as-is since path.join() already creates proper platform paths
            const spawnCommand = pythonPath;

            console.log(`🚀 Starting backend process now...`);
            console.log(`   Command: ${spawnCommand} ${spawnArgs.join(' ')}`);
            console.log(`   Working directory: ${backendPath}`);
            console.log(`   Platform: ${process.platform}`);
            console.log(`   Shell: ${spawnOptions.shell}`);
            console.log('🎯 ABOUT TO SPAWN PROCESS - if you see this, dependency flow worked!');
            
            // Start backend process
            this.backendProcess = childProcess.spawn(
                spawnCommand,
                spawnArgs,
                spawnOptions
            );

            // Windows-specific: Start continuous status monitoring
            if (process.platform === 'win32') {
                console.log('🪟 Starting Windows-specific backend monitoring...');
                setTimeout(() => {
                    this.syncStatusWindows();
                }, 2000); // Wait 2 seconds before starting monitoring
            }

            // Handle output
            this.backendProcess.stdout?.on('data', (data: Buffer) => {
                const message = data.toString();
                console.log(`Backend: ${message}`);
                
                // Check for successful startup
                if (message.includes('Application startup complete')) {
                    this.updateStatusBar('ready');
                    // Don't show info message during auto-start (reduces noise)
                }
            });

            this.backendProcess.stderr?.on('data', (data: Buffer) => {
                const error = data.toString();
                this.stderrBuffer += error; // Store all errors
                console.error(`Backend stderr: ${error}`);
                
                // Log startup errors immediately for debugging
                if (error.includes('No module named') || 
                    error.includes('ModuleNotFoundError') ||
                    error.includes('ImportError') ||
                    error.includes('cannot find') ||
                    error.includes('not found') ||
                    error.toLowerCase().includes('error')) {
                    console.error(`⚠️ Critical error: ${error}`);
                }
                
                // Handle port binding conflicts specifically
                if (error.includes('10048') || error.includes('address already in use')) {
                    console.error('🔴 Port conflict detected - another backend instance is running');
                    if (!this.isInGracePeriod()) {
                        vscode.window.showErrorMessage(
                            '🔴 Port Conflict: Another Loco backend is already running.\n\nPlease close other VS Code windows with Loco or restart VS Code.',
                            'Restart VS Code',
                            'Show Running Processes'
                        ).then(choice => {
                            if (choice === 'Restart VS Code') {
                                vscode.commands.executeCommand('workbench.action.reloadWindow');
                            } else if (choice === 'Show Running Processes') {
                                const terminal = vscode.window.createTerminal('Port Check');
                                terminal.show();
                                terminal.sendText('netstat -ano | findstr :8000');
                            }
                        });
                    }
                    this.backendProcess?.kill();
                    return;
                }
                
                // Skip error dialogs during grace period (first 5 seconds)
                if (this.isInGracePeriod()) {
                    return;
                }
                
                // Only check for Anaconda if we're actually using system Python (not venv)
                const usingVenv = pythonPath.includes('locovenv') || pythonPath.includes('venv') || pythonPath.includes('.venv');
                
                // Check for Anaconda Python asyncio issues (only if not using venv)
                if (!usingVenv && error.toLowerCase().includes('anaconda') && error.includes('asyncio')) {
                    vscode.window.showErrorMessage(
                        '❌ Loco Backend Error: Anaconda Python Incompatibility\n\n' +
                        'Anaconda Python has asyncio issues with the backend.\n\n' +
                        'Solution: Use regular Python or create locovenv',
                        { modal: true },
                        'Install Regular Python',
                        'Create Locovenv'
                    ).then(choice => {
                        if (choice === 'Install Regular Python') {
                            vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
                            this.showAnacondaWorkaround(backendPath);
                        } else if (choice === 'Create Locovenv') {
                            this.showVenvCreationInstructions(backendPath);
                        }
                    });
                    this.backendProcess?.kill();
                    return;
                }
                
                // Check for asyncio/uvicorn errors (only if not using venv)
                if (!usingVenv && (error.includes('run_until_complete') || error.includes('base_events.py'))) {
                    // Check if this is actually Anaconda-related
                    if (pythonPath.toLowerCase().includes('anaconda') || pythonPath.toLowerCase().includes('conda')) {
                        vscode.window.showErrorMessage(
                            '❌ Loco Backend Error: Asyncio Compatibility Issue\n\n' +
                            'Detected Anaconda Python. This is often incompatible.\n\n' +
                            'Recommended: Create a locovenv with regular Python.',
                            { modal: true },
                            'Create Locovenv',
                            'Ignore'
                        ).then(choice => {
                            if (choice === 'Create Locovenv') {
                                this.showVenvCreationInstructions(backendPath);
                            }
                        });
                        this.backendProcess?.kill();
                        return;
                    }
                }
                
                // Show critical errors
                if (error.includes('ModuleNotFoundError') || 
                    error.includes('ImportError')) {
                    vscode.window.showErrorMessage(
                        `Loco backend error: ${error.substring(0, 150)}`,
                        'Show Full Error'
                    ).then(choice => {
                        if (choice === 'Show Full Error') {
                            const outputChannel = vscode.window.createOutputChannel('Loco Backend Error');
                            outputChannel.appendLine(error);
                            outputChannel.show();
                        }
                    });
                }
            });

            // Handle process exit
            this.backendProcess.on('exit', (code: number | null, signal: string | null) => {
                console.log(`Backend exited with code ${code}, signal ${signal}`);
                console.log(`Recent stderr output: ${this.stderrBuffer.slice(-500)}`); // Last 500 chars
                
                // Skip error dialogs during grace period (first 5 seconds)
                if (this.isInGracePeriod()) {
                    console.log('Backend exited during grace period, skipping error dialog');
                    this.updateStatusBar('stopped');
                    return;
                }
                
                this.updateStatusBar('stopped');
                
                if (code !== 0 && code !== null) {
                    // Check for common Windows errors
                    const isWindows = process.platform === 'win32';
                    let errorHint = '';
                    
                    if (isWindows && code === 1) {
                        errorHint = '\n\nPossible issues:\n• Dependencies not fully installed\n• Python not found in PATH\n• Virtual environment not activated';
                    }
                    
                    // Backend crashed - show error message with diagnostic option on Windows
                    const buttons = ['Show Logs', 'Reinstall Dependencies', 'Restart'];
                    if (isWindows) {
                        buttons.push('Run Diagnostics');
                    }
                    
                    vscode.window.showErrorMessage(
                        `Loco backend crashed with exit code ${code}.${errorHint}`,
                        ...buttons
                    ).then(choice => {
                        if (choice === 'Show Logs') {
                            const outputChannel = vscode.window.createOutputChannel('Loco Backend Error');
                            outputChannel.clear();
                            outputChannel.appendLine('🔴 Loco Backend Error Details');
                            outputChannel.appendLine('='.repeat(60));
                            outputChannel.appendLine(`\nExit Code: ${code}`);
                            outputChannel.appendLine(`Signal: ${signal}`);
                            outputChannel.appendLine(`Python: ${pythonPath}`);
                            outputChannel.appendLine(`Backend Path: ${backendPath}`);
                            outputChannel.appendLine(`\n${'='.repeat(60)}`);
                            outputChannel.appendLine('\n📋 Backend Error Output:\n');
                            
                            if (this.stderrBuffer.trim()) {
                                outputChannel.appendLine(this.stderrBuffer);
                            } else {
                                outputChannel.appendLine('(No error output captured)');
                                outputChannel.appendLine('\nThe backend exited without producing error messages.');
                                outputChannel.appendLine('This usually means:');
                                outputChannel.appendLine('  • Python or a module failed to load');
                                outputChannel.appendLine('  • Import error occurred before uvicorn started');
                                outputChannel.appendLine('  • Try running the diagnostic tool');
                            }
                            outputChannel.appendLine(`\n${'='.repeat(60)}`);
                            outputChannel.show();
                        } else if (choice === 'Reinstall Dependencies') {
                            // Clear marker file to force reinstall
                            const fs = require('fs');
                            const markerFile = path.join(backendPath, '.deps_installed');
                            if (fs.existsSync(markerFile)) {
                                fs.unlinkSync(markerFile);
                                console.log('Cleared dependency marker file');
                            }
                            this.installDependencies(pythonPath, backendPath);
                        } else if (choice === 'Run Diagnostics') {
                            this.diagnoseWindowsSetup(context);
                        } else if (choice === 'Restart') {
                            this.start(context);
                        }
                    });
                }
                
                if (code !== 0 && this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`Retrying backend start (${this.retryCount}/${this.maxRetries})`);
                    this.clearStartupFlag(); // Allow retry to proceed
                    setTimeout(() => this.start(context), 2000);
                }
            });

            // Wait for backend to be ready
            const result = await this.waitForBackend();
            this.clearStartupFlag();
            return result;

        } catch (error: any) {
            console.error('Failed to start backend:', error);
            vscode.window.showErrorMessage(`Failed to start backend: ${error.message}`);
            this.updateStatusBar('error');
            this.clearStartupFlag();
            return false;
        }
    }

    /**
     * Stop backend server
     */
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
                
                // Wait a bit for graceful shutdown
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

    /**
     * Restart backend server
     */
    async restart(context: vscode.ExtensionContext): Promise<boolean> {
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.start(context);
    }

    /**
     * Check if backend is running
     */
    async isRunning(): Promise<boolean> {
        try {
            const response = await axios.get(
                `http://${this.backendHost}:${this.backendPort}/health`,
                { timeout: 2000 }
            );
            return response.status === 200;
        } catch {
            return false;
        }
    }

    /**
     * Windows-specific health check - simpler and more reliable
     * Just checks if /health returns ANY response (not empty)
     */
    private async isRunningWindows(): Promise<boolean> {
        try {
            const response = await axios.get(
                `http://${this.backendHost}:${this.backendPort}/health`,
                { timeout: 3000 }
            );
            // On Windows, just check if we get any response at all
            return response.status === 200 && response.data !== null && response.data !== undefined;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get detailed backend health status
     */
    async getHealthStatus(): Promise<{status: string, details?: any} | null> {
        try {
            const response = await axios.get(
                `http://${this.backendHost}:${this.backendPort}/health`,
                { timeout: 2000 }
            );
            if (response.status === 200 && response.data) {
                return {
                    status: response.data.status || 'unknown',
                    details: response.data
                };
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Wait for backend to be ready
     */
    private async waitForBackend(): Promise<boolean> {
        const maxWait = 30; // 30 seconds
        const interval = 1000; // Check every second

        for (let i = 0; i < maxWait; i++) {
            if (await this.isRunning()) {
                // Check detailed health status
                const health = await this.getHealthStatus();
                if (health) {
                    console.log(`✅ Backend is ready (status: ${health.status})`);
                    
                    if (health.status === 'degraded') {
                        console.warn('⚠️ Backend running in degraded mode (Ollama not available)');
                        console.log('💡 This is normal if using Groq/Gemini. Agent mode will work fine.');
                        console.log('💡 Chat mode requires at least one LLM provider configured.');
                    }
                    
                    this.updateStatusBar('ready');
                } else {
                    console.log('✅ Backend is ready');
                    this.updateStatusBar('ready');
                }
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }

        console.error('❌ Backend failed to start within timeout');
        this.updateStatusBar('error');
        return false;
    }

    /**
     * Find backend path relative to extension
     */
    private findBackendPath(context: vscode.ExtensionContext): string | null {
        const fs = require('fs');
        
        // Try multiple possible locations
        const possiblePaths = [
            // Production: Bundled with extension
            path.join(context.extensionPath, 'backend'),
            // Development: loco/loco -> ../backend
            path.join(context.extensionPath, '..', 'backend'),
            // Alternative: Check if we're in the loco subfolder during dev
            path.join(context.extensionPath, '..', '..', 'backend'),
            // User configured path
            vscode.workspace.getConfiguration('loco').get<string>('general.backendPath', ''),
        ];

        console.log(`🔍 Checking ${possiblePaths.length} possible backend paths:`);
        for (let i = 0; i < possiblePaths.length; i++) {
            const backendPath = possiblePaths[i];
            console.log(`   ${i + 1}. ${backendPath} - exists: ${backendPath ? require('fs').existsSync(backendPath) : 'null'}`);
            if (backendPath && this.isValidBackendPath(backendPath)) {
                console.log(`✅ Found backend at: ${backendPath}`);
                return backendPath;
            }
        }

        console.error('❌ Backend not found in any expected location');
        return null;
    }

    /**
     * Check if path contains valid backend
     */
    private isValidBackendPath(backendPath: string): boolean {
        const fs = require('fs');
        const mainFile = path.join(backendPath, 'src', 'main.py');
        return fs.existsSync(mainFile);
    }

    /**
     * Find Python executable
     * Prioritizes virtual environment in backend folder
     */
    private async findPython(backendPath?: string): Promise<string | null> {
        const fs = require('fs');
        
        // First, check for locovenv (our custom venv) in backend folder
        if (backendPath) {
            const locovenvPaths = [
                // Loco-specific venv
                path.join(backendPath, 'locovenv', 'bin', 'python'),
                path.join(backendPath, 'locovenv', 'Scripts', 'python.exe'), // Windows
                // Fallback to standard venv names
                path.join(backendPath, 'venv', 'bin', 'python'),
                path.join(backendPath, 'venv', 'Scripts', 'python.exe'), // Windows
                path.join(backendPath, '.venv', 'bin', 'python'),
                path.join(backendPath, '.venv', 'Scripts', 'python.exe'), // Windows
                path.join(backendPath, 'env', 'bin', 'python'),
                path.join(backendPath, 'env', 'Scripts', 'python.exe'), // Windows
            ];

            console.log(`🔍 Checking ${locovenvPaths.length} potential venv paths...`);
            for (const venvPython of locovenvPaths) {
                console.log(`   Checking: ${venvPython} - exists: ${fs.existsSync(venvPython)}`);
                if (fs.existsSync(venvPython)) {
                    console.log(`Found venv Python: ${venvPython}`);
                    // Verify it works
                    try {
                        const result = childProcess.spawnSync(venvPython, ['--version'], {
                            shell: process.platform === 'win32'
                        });
                        if (result.status === 0) {
                            const version = result.stdout.toString();
                            console.log(`Using venv Python: ${version}`);
                            
                            // On Windows, verify uvicorn is accessible
                            if (process.platform === 'win32') {
                                const uvicornCheck = childProcess.spawnSync(
                                    venvPython, 
                                    ['-m', 'uvicorn', '--version'],
                                    { shell: true }
                                );
                                if (uvicornCheck.status !== 0) {
                                    console.warn(`⚠️ Uvicorn not found in venv: ${venvPython}`);
                                    continue;
                                }
                                console.log('✅ Uvicorn accessible in venv');
                            }
                            
                            return venvPython;
                        }
                    } catch {
                        continue;
                    }
                }
            }
        }

        // Fall back to system Python
        console.log('🔍 No venv found, checking system Python...');
        const possiblePaths = ['python3', 'python', 'py'];
        console.log(`   Will check: ${possiblePaths.join(', ')}`);

        for (const pythonCmd of possiblePaths) {
            console.log(`   Trying: ${pythonCmd}`);
            try {
                const result = childProcess.spawnSync(pythonCmd, ['--version'], {
                    shell: true
                });
                if (result.status === 0) {
                    const version = result.stdout.toString();
                    console.log(`Found Python: ${pythonCmd} (${version})`);
                    
                    // Check if it's Anaconda Python
                    const pathResult = childProcess.spawnSync(pythonCmd, ['-c', 'import sys; print(sys.executable)'], {
                        shell: true
                    });
                    const pythonPath = pathResult.stdout.toString().trim().toLowerCase();
                    
                    if (pythonPath.includes('anaconda') || pythonPath.includes('conda')) {
                        console.warn('⚠️ Detected Anaconda Python - may have compatibility issues');
                        vscode.window.showWarningMessage(
                            '⚠️ Anaconda Python Detected\n\n' +
                            'Anaconda Python may have compatibility issues with Loco backend.\n\n' +
                            'If you experience issues, please use regular Python or create a virtual environment.',
                            'Continue Anyway',
                            'Show Fix'
                        ).then(choice => {
                            if (choice === 'Show Fix' && backendPath) {
                                this.showAnacondaWorkaround(backendPath);
                            }
                        });
                    }
                    
                    console.log(`✅ Using system Python: ${pythonCmd}`);
                    return pythonCmd;
                }
            } catch {
                continue;
            }
        }

        // Check VS Code Python extension
        const pythonExt = vscode.extensions.getExtension('ms-python.python');
        if (pythonExt) {
            // Get Python path from Python extension
            const pythonPath = vscode.workspace.getConfiguration('python').get<string>('pythonPath');
            if (pythonPath) {
                console.log(`📍 Found VS Code Python setting: ${pythonPath}`);
                return pythonPath;
            }
        }

        console.log('❌ No Python executable found in any location');
        return null;
    }

    /**
     * Ensure backend dependencies are installed
     */
    private async ensureDependencies(pythonPath: string, backendPath: string): Promise<boolean> {
        console.log('Checking backend dependencies...');
        const fs = require('fs');
        
        // Check for dependency marker file (created after successful install)
        const markerFile = path.join(backendPath, '.deps_installed');
        console.log(`🔍 Checking marker file: ${markerFile}`);
        if (fs.existsSync(markerFile)) {
            const markerContent = fs.readFileSync(markerFile, 'utf8');
            console.log(`✅ Dependencies already verified (marker file exists, created: ${markerContent})`);
            return true;
        } else {
            console.log('❌ No marker file found, checking dependencies manually');
        }
        
        // Check for all critical dependencies needed to run the backend
        const criticalDeps = [
            'uvicorn',        // Server
            'fastapi',        // Framework
            'pydantic_settings', // Config
            'langchain',      // Core LLM
            'tree_sitter',    // Code parsing
        ];
        
        let allInstalled = true;
        const missingDeps: string[] = [];
        
        for (const dep of criticalDeps) {
            const checkResult = childProcess.spawnSync(
                pythonPath,
                ['-c', `import ${dep}`],
                { 
                    cwd: backendPath,
                    shell: process.platform === 'win32',
                    encoding: 'utf8'
                }
            );
            
            if (checkResult.status !== 0) {
                allInstalled = false;
                missingDeps.push(dep);
                const errorMsg = checkResult.stderr || checkResult.error?.message || 'Unknown error';
                console.log(`❌ Missing dependency: ${dep} - ${errorMsg}`);
            } else {
                console.log(`✅ Found dependency: ${dep}`);
            }
        }

        if (allInstalled) {
            console.log('✅ All dependencies installed');
            return true;
        }

        console.log(`📦 Missing dependencies: ${missingDeps.join(', ')}. Setting up installation...`);
        
        // Check if using a virtual environment (including locovenv)
        const isUsingVenv = pythonPath.includes('locovenv') || pythonPath.includes('venv') || pythonPath.includes('.venv');
        
        if (isUsingVenv) {
            // In venv, offer to install automatically
            const choice = await vscode.window.showInformationMessage(
                '🚀 Loco Backend - First Time Setup\n\nDependencies need to be installed. This will take 1-2 minutes.',
                { modal: true },
                'Install Now',
                'Manual Setup'
            );

            if (choice === 'Install Now') {
                return await this.installDependencies(pythonPath, backendPath);
            } else {
                this.showManualSetupInstructions(backendPath);
                return false;
            }
        } else {
            // Not in venv - strongly recommend creating one
            const choice = await vscode.window.showWarningMessage(
                '⚠️ Loco Backend Setup Required\n\n' +
                'Dependencies need to be installed. It\'s strongly recommended to use a virtual environment.\n\n' +
                'Installing to system Python may require administrator privileges.',
                { modal: true },
                'Create Virtual Environment (Recommended)',
                'Install to System Python',
                'Cancel'
            );

            if (choice === 'Create Virtual Environment (Recommended)') {
                this.showVenvCreationInstructions(backendPath);
                return false;
            } else if (choice === 'Install to System Python') {
                const confirm = await vscode.window.showWarningMessage(
                    '⚠️ Installing to system Python may require administrator privileges.\n\nContinue?',
                    { modal: true },
                    'Yes, Install',
                    'Cancel'
                );
                
                if (confirm === 'Yes, Install') {
                    return await this.installDependencies(pythonPath, backendPath);
                }
                return false;
            }
            return false;
        }
    }

    /**
     * Show instructions for creating virtual environment
     */
    private showVenvCreationInstructions(backendPath: string): void {
        const terminal = vscode.window.createTerminal({
            name: 'Loco Setup',
            cwd: backendPath
        });
        terminal.show();
        
        const isWindows = process.platform === 'win32';
        const isMac = process.platform === 'darwin';
        const pythonCmd = isWindows ? 'python' : 'python3';
        const pipCmd = isWindows ? 'pip' : 'pip3';
        const activateCmd = isWindows ? 'locovenv\\Scripts\\activate' : 'source locovenv/bin/activate';
        
        // Execute commands directly instead of showing them as comments
        if (isMac || !isWindows) {
            terminal.sendText(`echo "🚀 Loco Backend Setup"`);
            terminal.sendText(`echo ""`);
            terminal.sendText(`echo "Step 1: Creating locovenv virtual environment..."`);
            terminal.sendText(`${pythonCmd} -m venv locovenv`);
            terminal.sendText(`echo ""`);
            terminal.sendText(`echo "Step 2: Activating virtual environment..."`);
            terminal.sendText(`${activateCmd}`);
            terminal.sendText(`echo ""`);
            terminal.sendText(`echo "Step 3: Installing dependencies (1-2 minutes)..."`);
            terminal.sendText(`${pipCmd} install -r requirements.txt`);
            terminal.sendText(`echo ""`);
            terminal.sendText(`echo "✅ Setup complete! Reload VS Code window now."`);
        } else {
            // Windows - use explicit paths to ensure venv is used
            terminal.sendText(`echo 🚀 Loco Backend Setup`);
            terminal.sendText(`echo Creating virtual environment...`);
            terminal.sendText(`${pythonCmd} -m venv locovenv`);
            terminal.sendText(`echo Installing dependencies in virtual environment...`);
            terminal.sendText(`locovenv\\Scripts\\pip.exe install -r requirements.txt`);
            terminal.sendText(`echo ✅ Setup complete! Reload VS Code window.`);
        }
        
        vscode.window.showInformationMessage(
            'Setup is running in the terminal. After it completes, reload the VS Code window.',
            'Reload Window'
        ).then(choice => {
            if (choice === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }

    /**
     * Show manual setup instructions
     */
    private showManualSetupInstructions(backendPath: string): void {
        const terminal = vscode.window.createTerminal({
            name: 'Loco Setup',
            cwd: backendPath
        });
        terminal.show();
        
        const isWindows = process.platform === 'win32';
        const pipCmd = isWindows ? 'pip' : 'pip3';
        
        terminal.sendText(`echo "🔧 Loco Backend - Manual Installation"`);
        terminal.sendText(`echo ""`);
        terminal.sendText(`echo "Installing dependencies..."`);
        terminal.sendText(`${pipCmd} install -r requirements.txt`);
        terminal.sendText(`echo ""`);
        terminal.sendText(`echo "✅ Done! Reload VS Code window."`);
    }

    /**
     * Install backend dependencies
     */
    private async installDependencies(pythonPath: string, backendPath: string): Promise<boolean> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Installing Loco backend dependencies...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Installing packages...' });

            const requirementsFile = path.join(backendPath, 'requirements.txt');
            
            return new Promise<boolean>((resolve) => {
                const installProcess = childProcess.spawn(
                    pythonPath,
                    ['-m', 'pip', 'install', '-r', requirementsFile],
                    { 
                        cwd: backendPath,
                        shell: process.platform === 'win32'
                    }
                );

                let output = '';

                installProcess.stdout?.on('data', (data: Buffer) => {
                    const message = data.toString();
                    output += message;
                    console.log(`Install: ${message}`);
                });

                installProcess.stderr?.on('data', (data: Buffer) => {
                    const message = data.toString();
                    output += message;
                    console.log(`Install: ${message}`);
                });

                installProcess.on('close', (code: number | null) => {
                    if (code === 0) {
                        // Create marker file to remember dependencies are installed
                        const fs = require('fs');
                        const markerFile = path.join(backendPath, '.deps_installed');
                        try {
                            fs.writeFileSync(markerFile, new Date().toISOString());
                            console.log('✅ Created dependency marker file');
                        } catch (err) {
                            console.warn('Warning: Could not create marker file:', err);
                        }
                        
                        console.log('✅ Dependencies installed successfully!');
                        console.log(`✅ Marker file created at: ${markerFile}`);
                        console.log('🔄 Resolving installDependencies with TRUE - backend should continue starting...');
                        
                        // Don't show modal dialog that might block the flow
                        vscode.window.showInformationMessage(
                            '✅ Dependencies installed! Backend is starting automatically.'
                        );
                        
                        console.log('🚀 About to resolve(true) - this should return to start() method');
                        resolve(true);
                    } else {
                        // Check for Windows file lock error
                        if (output.includes('WinError 32') || output.includes('being used by another process')) {
                            vscode.window.showErrorMessage(
                                '❌ Installation Failed: Files are locked\n\n' +
                                'The backend process is using these files.\n\n' +
                                'Solution:\n' +
                                '1. Close this VS Code window\n' +
                                '2. Reopen it\n' +
                                '3. Installation will retry automatically',
                                { modal: true },
                                'Close Window'
                            ).then(choice => {
                                if (choice === 'Close Window') {
                                    vscode.commands.executeCommand('workbench.action.closeWindow');
                                }
                            });
                        } else {
                            vscode.window.showErrorMessage(
                                'Failed to install dependencies. Check the output for details.',
                                'Show Output',
                                'Manual Setup'
                            ).then(selection => {
                                if (selection === 'Show Output') {
                                    const outputChannel = vscode.window.createOutputChannel('Loco Backend Install');
                                    outputChannel.appendLine(output);
                                    outputChannel.show();
                                } else if (selection === 'Manual Setup') {
                                    this.showManualSetupInstructions(backendPath);
                                }
                            });
                        }
                        resolve(false);
                    }
                });
            });
        });
    }

    /**
     * Update status bar
     */
    private updateStatusBar(state: 'starting' | 'ready' | 'stopped' | 'error'): void {
        switch (state) {
            case 'starting':
                this.statusBarItem.text = '$(loading~spin) Loco: Starting...';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'ready':
                this.statusBarItem.text = '$(check) Loco: Ready';
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.tooltip = 'Loco backend is running\nClick to restart';
                break;
            case 'stopped':
                this.statusBarItem.text = '$(circle-slash) Loco: Stopped';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                this.statusBarItem.tooltip = 'Click to restart Loco backend';
                break;
            case 'error':
                this.statusBarItem.text = '$(error) Loco: Error';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                this.statusBarItem.tooltip = 'Loco backend failed to start';
                break;
        }
        this.statusBarItem.show();
    }

    /**
     * Show Anaconda workaround instructions
     */
    private showAnacondaWorkaround(backendPath: string): void {
        const terminal = vscode.window.createTerminal({
            name: 'Loco - Anaconda Fix',
            cwd: backendPath
        });
        terminal.show();
        
        const isWindows = process.platform === 'win32';
        const pythonCmd = isWindows ? 'py' : 'python3';
        const pipCmd = isWindows ? 'pip' : 'pip3';
        const activateCmd = isWindows ? 'locovenv\\Scripts\\activate' : 'source locovenv/bin/activate';
        
        terminal.sendText(`echo "⚠️ Anaconda Python Incompatibility Fix"`);
        terminal.sendText(`echo ""`);
        terminal.sendText(`echo "Anaconda Python has asyncio issues with Loco."`);
        terminal.sendText(`echo ""`);
        terminal.sendText(`echo "Solution: Install regular Python from python.org"`);
        terminal.sendText(`echo "Then run these commands:"`);
        terminal.sendText(`echo ""`);
        terminal.sendText(`echo "1. ${pythonCmd} -m venv locovenv"`);
        terminal.sendText(`echo "2. ${activateCmd}"`);
        terminal.sendText(`echo "3. ${pipCmd} install -r requirements.txt"`);
        terminal.sendText(`echo "4. Reload VS Code"`);
        terminal.sendText(`echo ""`);
        terminal.sendText(`echo "Download Python: https://www.python.org/downloads/"`);
        
        vscode.window.showInformationMessage(
            '💡 Tip: Regular Python (not Anaconda) works best with Loco.\n\n' +
            'Download from python.org and create a locovenv virtual environment.',
            'Download Python',
            'Got It'
        ).then(choice => {
            if (choice === 'Download Python') {
                vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
            }
        });
    }

    /**
     * Get backend URL
     */
    getBackendUrl(): string {
        return `http://${this.backendHost}:${this.backendPort}`;
    }

    /**
     * Diagnose Windows setup issues
     */
    private async diagnoseWindowsSetup(context: vscode.ExtensionContext): Promise<void> {
        const fs = require('fs');
        const outputChannel = vscode.window.createOutputChannel('Loco Diagnostics');
        outputChannel.show();
        
        outputChannel.appendLine('🔍 Loco Windows Diagnostics\n');
        outputChannel.appendLine('=' .repeat(50));
        
        try {
            const backendPath = this.findBackendPath(context);
            if (!backendPath) {
                outputChannel.appendLine('❌ Backend path not found');
                return;
            }
            
            const pythonPath = await this.findPython(backendPath);
            
            outputChannel.appendLine(`\n1. Python Environment:`);
            outputChannel.appendLine(`   Path: ${pythonPath || 'NOT FOUND'}`);
            
            if (pythonPath) {
                // Check Python version
                const versionResult = childProcess.spawnSync(pythonPath, ['--version'], {
                    shell: true,
                    encoding: 'utf8'
                });
                outputChannel.appendLine(`   Version: ${versionResult.stdout.trim()}`);
                
                // Check if uvicorn is installed
                outputChannel.appendLine(`\n2. Uvicorn Check:`);
                const uvicornResult = childProcess.spawnSync(
                    pythonPath,
                    ['-m', 'uvicorn', '--version'],
                    { shell: true, encoding: 'utf8' }
                );
                
                if (uvicornResult.status === 0) {
                    outputChannel.appendLine(`   ✅ Uvicorn found: ${uvicornResult.stdout.trim()}`);
                } else {
                    outputChannel.appendLine(`   ❌ Uvicorn not found`);
                    outputChannel.appendLine(`   Error: ${uvicornResult.stderr}`);
                }
                
                // Check dependencies
                outputChannel.appendLine(`\n3. Dependencies:`);
                const deps = ['fastapi', 'uvicorn', 'langgraph', 'langchain_ollama'];
                for (const dep of deps) {
                    const depResult = childProcess.spawnSync(
                        pythonPath,
                        ['-c', `import ${dep.replace('-', '_')}; print('OK')`],
                        { shell: true, encoding: 'utf8' }
                    );
                    
                    const status = depResult.status === 0 ? '✅' : '❌';
                    outputChannel.appendLine(`   ${status} ${dep}`);
                }
                
                // Check backend files
                outputChannel.appendLine(`\n4. Backend Files:`);
                const mainPy = path.join(backendPath, 'src', 'main.py');
                const reqTxt = path.join(backendPath, 'requirements.txt');
                
                outputChannel.appendLine(`   ${fs.existsSync(mainPy) ? '✅' : '❌'} src/main.py`);
                outputChannel.appendLine(`   ${fs.existsSync(reqTxt) ? '✅' : '❌'} requirements.txt`);
                
            } else {
                outputChannel.appendLine(`   ❌ Python not found in venv`);
            }
            
            outputChannel.appendLine(`\n${'='.repeat(50)}`);
            
            // Show recent stderr if available
            if (this.stderrBuffer.trim()) {
                outputChannel.appendLine(`\n5. Recent Backend Errors:`);
                const recentErrors = this.stderrBuffer.split('\n').slice(-10).join('\n');
                outputChannel.appendLine(recentErrors);
            }
            
            outputChannel.appendLine(`\n${'='.repeat(50)}`);
            outputChannel.appendLine(`\nIf issues persist, try:`);
            outputChannel.appendLine(`1. Delete the locovenv folder`);
            outputChannel.appendLine(`2. Reload VS Code`);
            outputChannel.appendLine(`3. Let Loco reinstall dependencies`);
            
        } catch (error: any) {
            outputChannel.appendLine(`\n❌ Error during diagnostics: ${error.message}`);
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stop();
        this.statusBarItem.dispose();
    }
}
