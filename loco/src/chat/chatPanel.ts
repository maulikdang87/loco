import * as vscode from 'vscode';
import { BackendClient } from '../api/backendClient';
import { ChatMessage, ChatRequest, FileReference } from '../types';

export class ChatPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'loco.chatView';
    private _view?: vscode.WebviewView;
    private openPanels: Set<vscode.Webview> = new Set();
    private backend: BackendClient;
    private chatHistory: ChatMessage[] = [];
    private fileReferences: FileReference[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        backend: BackendClient
    ) {
        this.backend = backend;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('Received message:', data);  // Debug log
            
            switch (data.type) {
                case 'sendMessage':
                    // Use current fileReferences instead of data.files
                    await this.handleUserMessage(data.text, this.fileReferences);
                    break;
                case 'addFile':
                    await this.handleAddFileRequest();
                    break;
                case 'addFileByPath':
                    await this.addFileByPath(data.path);
                    break;
                case 'searchFiles':
                    const files = await this.handleFileSearch(data.query);
                    this._view?.webview.postMessage({
                        type: 'fileSearchResults',
                        files: files
                    });
                    break;
                case 'removeFile':
                    this.removeFileReference(data.path, data.lineStart);
                    break;
                case 'clearChat':
                    this.clearChat();
                    break;
                case 'copyCode':
                    await vscode.env.clipboard.writeText(data.code);
                    vscode.window.showInformationMessage('Code copied!');
                    break;
                case 'webviewReady':
                    // Webview is ready, send initial state
                    this.updateChat();
                    this.updateFileReferences();
                    break;
            }
        });
    }

    private async handleUserMessage(text: string, files: FileReference[]) {
        if (!text.trim()) {
            return;
        }

        console.log('Handling user message:', text);

        // Add user message to history
        const userMessage: ChatMessage = {
            role: 'user',
            content: text,
            timestamp: new Date(),
            files: files || []
        };

        this.chatHistory.push(userMessage);
        this.updateChat();

        // Show thinking indicator
        this.showThinking(true);
        // Also show thinking for any open panels (we'll handle this via a shared state approach)

        try {
            // Serialize messages for backend (backend doesn't need timestamp)
            const serializedMessages = this.chatHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            // Build chat request - use current fileReferences, not the files parameter
            const request: ChatRequest = {
                messages: serializedMessages
            };
            
            // Only include files if we have any
            if (this.fileReferences.length > 0) {
                request.files = this.fileReferences;
            }

            console.log('Sending chat request:', JSON.stringify(request, null, 2));

            // Get response from backend
            const response = await this.backend.chat(request);

            this.showThinking(false);

            if (response) {
                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: response.message,
                    timestamp: new Date()
                };

                this.chatHistory.push(assistantMessage);
                this.updateChat();
            } else {
                vscode.window.showErrorMessage('Failed to get response. Check if backend is running.');
            }
        } catch (error) {
            this.showThinking(false);
            console.error('Chat error:', error);
            vscode.window.showErrorMessage(`Chat error: ${error}`);
        }
    }

    private async handleAddFileRequest() {
        // Show quick pick to choose between current file or browse
        const options = [
            { label: '$(file) Current File', description: 'Add the currently active file', action: 'current' },
            { label: '$(folder-opened) Browse Files', description: 'Select a file from workspace', action: 'browse' }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'How would you like to add a file?'
        });

        if (!selected) {
            return;
        }

        if (selected.action === 'current') {
            await this.addCurrentFile();
        } else if (selected.action === 'browse') {
            await this.browseAndAddFile();
        }
    }

    private async addCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showWarningMessage('No active file to add');
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        
        const fileRef: FileReference = {
            path: document.fileName,
            name: document.fileName.split('/').pop() || 'file',
            language: document.languageId,
            content: selection.isEmpty 
                ? document.getText() 
                : document.getText(selection),
            lineStart: selection.isEmpty ? 0 : selection.start.line,
            lineEnd: selection.isEmpty ? document.lineCount : selection.end.line
        };

        this.addFileReference(fileRef);
    }

    private async browseAndAddFile() {
        // Show file picker
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Add to Chat',
            filters: {
                'All Files': ['*']
            }
        });

        if (!fileUri || fileUri.length === 0) {
            return;
        }

        const uri = fileUri[0];
        
        // Check if it's a file (not a directory)
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type === vscode.FileType.Directory) {
                vscode.window.showWarningMessage('Please select a file, not a directory');
                return;
            }

            // Read file content
            const document = await vscode.workspace.openTextDocument(uri);
            const fileName = uri.fsPath.split(/[/\\]/).pop() || 'file';
            
            const fileRef: FileReference = {
                path: uri.fsPath,
                name: fileName,
                language: document.languageId,
                content: document.getText(),
                lineStart: 0,
                lineEnd: document.lineCount
            };

            this.addFileReference(fileRef);
        } catch (error) {
            console.error('Error reading file:', error);
            vscode.window.showErrorMessage(`Failed to read file: ${error}`);
        }
    }

    private async addFileByPath(filePath: string) {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const fileName = filePath.split(/[/\\]/).pop() || 'file';
            
            const fileRef: FileReference = {
                path: filePath,
                name: fileName,
                language: document.languageId,
                content: document.getText(),
                lineStart: 0,
                lineEnd: document.lineCount
            };

            this.addFileReference(fileRef);
        } catch (error) {
            console.error('Error adding file by path:', error);
            vscode.window.showErrorMessage(`Failed to add file: ${filePath}`);
        }
    }

    private addFileReference(fileRef: FileReference) {
        // Avoid duplicates
        const exists = this.fileReferences.some(f => 
            f.path === fileRef.path && 
            f.lineStart === fileRef.lineStart
        );

        if (!exists) {
            this.fileReferences.push(fileRef);
            this.updateFileReferences();
            vscode.window.showInformationMessage(`Added ${fileRef.name} to chat context`);
        } else {
            vscode.window.showInformationMessage(`${fileRef.name} is already in chat context`);
        }
    }

    private removeFileReference(path: string, lineStart?: number) {
        const beforeCount = this.fileReferences.length;
        this.fileReferences = this.fileReferences.filter(f => {
            // Match by path and lineStart if provided, otherwise just path
            if (lineStart !== undefined) {
                return !(f.path === path && (f.lineStart || 0) === lineStart);
            }
            return f.path !== path;
        });
        
        const removed = beforeCount !== this.fileReferences.length;
        if (removed) {
            this.updateFileReferences();
            console.log(`Removed file reference: ${path}${lineStart !== undefined ? ` (line ${lineStart})` : ''}`);
        }
    }

    private updateChat() {
        // Serialize messages for webview (convert Date to ISO string for JSON serialization)
        const serializedMessages = this.chatHistory.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp.toISOString(),
            files: msg.files
        }));

        const message = {
            type: 'updateChat',
            messages: serializedMessages
        };

        // Update sidebar view
        this._view?.webview.postMessage(message);
        
        // Update all open panels
        this.openPanels.forEach(webview => {
            webview.postMessage(message);
        });
    }

    private updateFileReferences() {
        const message = {
            type: 'updateFiles',
            files: this.fileReferences
        };

        // Update sidebar view
        this._view?.webview.postMessage(message);
        
        // Update all open panels
        this.openPanels.forEach(webview => {
            webview.postMessage(message);
        });
    }

    // Methods for panel mode (right side)
    public getHtmlContentForPanel(webview: vscode.Webview): string {
        return this.getHtmlContent(webview);
    }

    public registerPanel(webview: vscode.Webview) {
        this.openPanels.add(webview);
        // Send initial state
        this.updateChat();
        this.updateFileReferences();
    }

    public unregisterPanel(webview: vscode.Webview) {
        this.openPanels.delete(webview);
    }

    public async handleWebviewMessage(data: any, webview: vscode.Webview): Promise<void> {
        console.log('Received message:', data);
        
        switch (data.type) {
            case 'sendMessage':
                await this.handleUserMessage(data.text, this.fileReferences);
                // updateChat() will update all views
                break;
            case 'addFile':
                await this.handleAddFileRequest();
                // updateFileReferences() will update all views
                break;
            case 'addFileByPath':
                await this.addFileByPath(data.path);
                // updateFileReferences() will update all views
                break;
            case 'searchFiles':
                const files = await this.handleFileSearch(data.query);
                webview.postMessage({
                    type: 'fileSearchResults',
                    files: files
                });
                break;
            case 'removeFile':
                this.removeFileReference(data.path, data.lineStart);
                // updateFileReferences() will update all views
                break;
            case 'clearChat':
                this.clearChat();
                // updateChat() and updateFileReferences() will update all views
                break;
            case 'copyCode':
                await vscode.env.clipboard.writeText(data.code);
                vscode.window.showInformationMessage('Code copied!');
                break;
            case 'webviewReady':
                // This is called from panels, not sidebar view
                // Sidebar view handles webviewReady in resolveWebviewView
                this.registerPanel(webview);
                break;
        }
    }

    private showThinking(show: boolean) {
        const message = {
            type: 'thinking',
            show
        };

        // Update sidebar view
        this._view?.webview.postMessage(message);
        
        // Update all open panels
        this.openPanels.forEach(webview => {
            webview.postMessage(message);
        });
    }

    private clearChat() {
        this.chatHistory = [];
        this.fileReferences = [];
        this.updateChat();
        this.updateFileReferences();
    }

    private async handleFileSearch(query: string): Promise<string[]> {
        // Search for files in workspace matching the query
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const files: string[] = [];
        const excludePattern = '**/{node_modules,.git,dist,build,.next,venv,__pycache__}/**';
        
        // Get current active file's directory or workspace root
        const activeEditor = vscode.window.activeTextEditor;
        let searchDirectory: vscode.WorkspaceFolder | undefined;
        let relativeSearchPath = '**';
        
        if (activeEditor && activeEditor.document.fileName) {
            const activeFileUri = vscode.Uri.file(activeEditor.document.fileName);
            // Find which workspace folder contains this file
            searchDirectory = vscode.workspace.getWorkspaceFolder(activeFileUri);
            
            if (searchDirectory) {
                // Get relative path from workspace root to the active file's directory
                const relativePath = vscode.workspace.asRelativePath(activeFileUri);
                const fileDir = relativePath.split('/').slice(0, -1).join('/'); // Remove filename, keep directory
                
                if (fileDir) {
                    // Search in current directory first, then subdirectories
                    relativeSearchPath = `${fileDir}/**`;
                } else {
                    // File is in root, search from root
                    relativeSearchPath = '**';
                }
            }
        }
        
        // If no active file, use the first workspace folder
        if (!searchDirectory && vscode.workspace.workspaceFolders.length > 0) {
            searchDirectory = vscode.workspace.workspaceFolders[0];
        }

        try {
            if (searchDirectory) {
                let found: vscode.Uri[];
                
                if (!query || query.trim() === '') {
                    // If no query, show files from current directory first
                    // Search in current directory
                    found = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(searchDirectory, `${relativeSearchPath}/*.{ts,tsx,js,jsx,py,md,txt,json,yaml,yml}`),
                        excludePattern,
                        15 // Limit results
                    );
                    
                    // If not enough results, also search in workspace root
                    if (found.length < 10 && relativeSearchPath !== '**') {
                        const rootFiles = await vscode.workspace.findFiles(
                            new vscode.RelativePattern(searchDirectory, '**/*.{ts,tsx,js,jsx,py,md,txt,json,yaml,yml}'),
                            excludePattern,
                            10
                        );
                        // Prioritize current directory files, then add root files
                        const currentDirFiles = new Set(found.map(f => f.fsPath));
                        const additionalFiles = rootFiles.filter(f => !currentDirFiles.has(f.fsPath));
                        found = [...found, ...additionalFiles];
                    }
                } else {
                    // Search for files matching the query in name
                    // Prioritize current directory
                    const pattern = `${relativeSearchPath}/*${query}*`;
                    found = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(searchDirectory, pattern),
                        excludePattern,
                        15 // Limit to 15 results from current directory
                    );
                    
                    // If not enough results, also search in workspace
                    if (found.length < 10 && relativeSearchPath !== '**') {
                        const workspacePattern = `**/*${query}*`;
                        const workspaceFiles = await vscode.workspace.findFiles(
                            new vscode.RelativePattern(searchDirectory, workspacePattern),
                            excludePattern,
                            10
                        );
                        // Prioritize current directory files
                        const currentDirFiles = new Set(found.map(f => f.fsPath));
                        const additionalFiles = workspaceFiles.filter(f => !currentDirFiles.has(f.fsPath));
                        found = [...found, ...additionalFiles];
                    }
                }
                
                files.push(...found.map(uri => uri.fsPath));
            }
            
            // If still no results or multi-root workspace, search other folders
            if (files.length === 0 && vscode.workspace.workspaceFolders.length > 1) {
                for (const folder of vscode.workspace.workspaceFolders) {
                    if (folder === searchDirectory) {
                        continue; // Already searched
                    }
                    
                    let found: vscode.Uri[];
                    
                    if (!query || query.trim() === '') {
                        found = await vscode.workspace.findFiles(
                            new vscode.RelativePattern(folder, '**/*.{ts,tsx,js,jsx,py,md,txt,json,yaml,yml}'),
                            excludePattern,
                            5 // Fewer results from other folders
                        );
                    } else {
                        const pattern = `**/*${query}*`;
                        found = await vscode.workspace.findFiles(
                            new vscode.RelativePattern(folder, pattern),
                            excludePattern,
                            5
                        );
                    }
                    
                    files.push(...found.map(uri => uri.fsPath));
                }
            }
        } catch (error) {
            console.error('File search error:', error);
        }

        // Remove duplicates, prioritize current directory files
        const uniqueFiles = Array.from(new Set(files));
        
        // Sort to prioritize files in current directory (shorter paths relative to active file)
        if (activeEditor && activeEditor.document.fileName) {
            const activeFileDir = activeEditor.document.fileName.split('/').slice(0, -1).join('/');
            uniqueFiles.sort((a, b) => {
                const aInCurrentDir = a.startsWith(activeFileDir);
                const bInCurrentDir = b.startsWith(activeFileDir);
                
                if (aInCurrentDir && !bInCurrentDir) {
                    return -1;
                }
                if (!aInCurrentDir && bInCurrentDir) {
                    return 1;
                }
                
                // If both in same directory, sort by path depth (shallower first)
                const aDepth = a.split('/').length;
                const bDepth = b.split('/').length;
                return aDepth - bDepth;
            });
        }
        
        return uniqueFiles.slice(0, 10);
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>Loco Chat</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .header {
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                }

                .header h1 {
                    font-size: 13px;
                    font-weight: 600;
                }

                .icon-btn {
                    background: transparent;
                    border: none;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                    padding: 4px;
                    opacity: 0.7;
                    font-size: 16px;
                }

                .icon-btn:hover {
                    opacity: 1;
                }

                .file-references {
                    padding: 8px 16px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    display: none;
                    flex-shrink: 0;
                }

                .file-references.has-files {
                    display: block;
                }

                .file-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    border-radius: 12px;
                    font-size: 11px;
                    margin: 2px 4px 2px 0;
                }

                .file-chip .remove {
                    cursor: pointer;
                    font-weight: bold;
                }

                .chat-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                }

                .message {
                    margin-bottom: 16px;
                    animation: fadeIn 0.2s ease-in;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .message.user {
                    display: flex;
                    justify-content: flex-end;
                }

                .message-bubble {
                    max-width: 85%;
                    padding: 10px 14px;
                    border-radius: 12px;
                    line-height: 1.5;
                    font-size: 13px;
                    word-wrap: break-word;
                }

                .message.user .message-bubble {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-bottom-right-radius: 2px;
                }

                .message.assistant .message-bubble {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-bottom-left-radius: 2px;
                }

                .message-bubble pre {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 12px;
                    border-radius: 6px;
                    overflow-x: auto;
                    margin: 12px 0;
                    border: 1px solid var(--vscode-input-border);
                }

                .message-bubble pre code {
                    background: transparent;
                    padding: 0;
                    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
                    font-size: 12px;
                    line-height: 1.5;
                    display: block;
                    white-space: pre;
                }

                .message-bubble code {
                    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
                    font-size: 12px;
                    background: var(--vscode-textCodeBlock-background);
                    padding: 2px 6px;
                    border-radius: 3px;
                    color: var(--vscode-textLink-foreground);
                }

                .message-bubble p {
                    margin: 8px 0;
                    line-height: 1.6;
                }

                .message-bubble h1,
                .message-bubble h2,
                .message-bubble h3,
                .message-bubble h4,
                .message-bubble h5,
                .message-bubble h6 {
                    margin: 16px 0 8px 0;
                    font-weight: 600;
                    line-height: 1.4;
                }

                .message-bubble h1 { font-size: 1.5em; }
                .message-bubble h2 { font-size: 1.3em; }
                .message-bubble h3 { font-size: 1.1em; }
                .message-bubble h4 { font-size: 1em; }

                .message-bubble ul,
                .message-bubble ol {
                    margin: 8px 0;
                    padding-left: 24px;
                }

                .message-bubble li {
                    margin: 4px 0;
                    line-height: 1.5;
                }

                .message-bubble blockquote {
                    border-left: 3px solid var(--vscode-input-border);
                    padding-left: 12px;
                    margin: 8px 0;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }

                .message-bubble table {
                    border-collapse: collapse;
                    margin: 12px 0;
                    width: 100%;
                }

                .message-bubble th,
                .message-bubble td {
                    border: 1px solid var(--vscode-input-border);
                    padding: 6px 12px;
                    text-align: left;
                }

                .message-bubble th {
                    background: var(--vscode-input-background);
                    font-weight: 600;
                }

                .message-bubble hr {
                    border: none;
                    border-top: 1px solid var(--vscode-input-border);
                    margin: 16px 0;
                }

                .message-bubble a {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }

                .message-bubble a:hover {
                    text-decoration: underline;
                }

                .message-bubble strong {
                    font-weight: 600;
                }

                .message-bubble em {
                    font-style: italic;
                }

                .copy-btn {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                    margin-top: 4px;
                }

                .thinking {
                    display: none;
                    padding: 10px 14px;
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 12px;
                    border-bottom-left-radius: 2px;
                    max-width: 80px;
                    margin-bottom: 16px;
                }

                .thinking.show {
                    display: block;
                }

                .thinking-dots {
                    display: flex;
                    gap: 4px;
                }

                .thinking-dots span {
                    width: 6px;
                    height: 6px;
                    background: var(--vscode-foreground);
                    border-radius: 50%;
                    opacity: 0.4;
                    animation: pulse 1.4s infinite ease-in-out;
                }

                .thinking-dots span:nth-child(2) {
                    animation-delay: 0.2s;
                }

                .thinking-dots span:nth-child(3) {
                    animation-delay: 0.4s;
                }

                @keyframes pulse {
                    0%, 80%, 100% { opacity: 0.4; }
                    40% { opacity: 1; }
                }

                .input-area {
                    border-top: 1px solid var(--vscode-panel-border);
                    padding: 12px 16px;
                    flex-shrink: 0;
                }

                .input-actions {
                    display: flex;
                    gap: 6px;
                    margin-bottom: 8px;
                }

                .action-btn {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 6px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                }

                .input-wrapper {
                    display: flex;
                    gap: 8px;
                    align-items: flex-end;
                }

                textarea {
                    flex: 1;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 6px;
                    padding: 10px;
                    font-family: inherit;
                    font-size: 13px;
                    resize: none;
                    min-height: 40px;
                    max-height: 150px;
                }

                textarea:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }

                .send-btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                }

                .send-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                .send-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    opacity: 0.5;
                }

                .mention-suggestions {
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    right: 0;
                    background: var(--vscode-dropdown-background);
                    border: 1px solid var(--vscode-dropdown-border);
                    border-radius: 6px;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 1000;
                    display: none;
                    margin-bottom: 4px;
                }

                .mention-suggestions.show {
                    display: block;
                }

                .mention-item {
                    padding: 8px 12px;
                    cursor: pointer;
                    border-bottom: 1px solid var(--vscode-dropdown-border);
                }

                .mention-item:last-child {
                    border-bottom: none;
                }

                .mention-item:hover,
                .mention-item.selected {
                    background: var(--vscode-list-hoverBackground);
                }

                .mention-item .name {
                    font-weight: 500;
                    font-size: 13px;
                }

                .mention-item .path {
                    font-size: 11px;
                    opacity: 0.7;
                    margin-top: 2px;
                }

                .input-wrapper {
                    position: relative;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>💬 Loco Chat</h1>
                <button class="icon-btn" id="clearChatBtn" title="Clear chat">🗑️</button>
            </div>

            <div class="file-references" id="fileRefs"></div>

            <div class="chat-container" id="chatContainer">
                <div class="empty-state">
                    <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
                    <div>Ask Loco anything...</div>
                </div>
            </div>

            <div class="input-area">
                <div class="input-actions">
                    <button class="action-btn" id="addFileBtn">📎 Add File</button>
                </div>
                <div class="input-wrapper">
                    <div class="mention-suggestions" id="mentionSuggestions"></div>
                    <textarea 
                        id="messageInput" 
                        placeholder="Ask about your code... Type @ to mention files (Cmd+Enter to send)"
                        rows="1"
                    ></textarea>
                    <button class="send-btn" id="sendBtn">Send</button>
                </div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                let messages = [];
                let fileRefs = [];
                let mentionSuggestions = [];
                let selectedSuggestionIndex = -1;
                let isMentionActive = false;

                // Get DOM elements
                const textarea = document.getElementById('messageInput');
                const mentionSuggestionsEl = document.getElementById('mentionSuggestions');
                const sendBtn = document.getElementById('sendBtn');
                const addFileBtn = document.getElementById('addFileBtn');
                const clearChatBtn = document.getElementById('clearChatBtn');

                // Add event listeners
                sendBtn.addEventListener('click', sendMessage);
                addFileBtn.addEventListener('click', addFile);
                clearChatBtn.addEventListener('click', clearChat);

                // Auto-resize textarea
                textarea.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
                    handleMentionInput();
                });

                // Handle @ mention input
                function handleMentionInput() {
                    const text = textarea.value;
                    const cursorPos = textarea.selectionStart;
                    const textBeforeCursor = text.substring(0, cursorPos);
                    
                    // Check if we're in a @ mention
                    const mentionMatch = textBeforeCursor.match(/@([^\\s@]*)$/);
                    
                    if (mentionMatch) {
                        const query = mentionMatch[1];
                        isMentionActive = true;
                        searchFiles(query);
                    } else {
                        hideMentionSuggestions();
                    }
                }

                async function searchFiles(query) {
                    vscode.postMessage({
                        type: 'searchFiles',
                        query: query
                    });
                }

                function showMentionSuggestions(files) {
                    mentionSuggestions = files;
                    selectedSuggestionIndex = -1;
                    
                    if (files.length === 0) {
                        hideMentionSuggestions();
                        return;
                    }

                    mentionSuggestionsEl.innerHTML = files.map((file, index) => {
                        const fileName = file.split(/[/\\\\]/).pop();
                        const filePath = file.length > 50 ? '...' + file.slice(-47) : file;
                        return \`
                            <div class="mention-item" data-index="\${index}" data-path="\${file}">
                                <div class="name">\${fileName}</div>
                                <div class="path">\${filePath}</div>
                            </div>
                        \`;
                    }).join('');

                    // Add click handlers
                    mentionSuggestionsEl.querySelectorAll('.mention-item').forEach((item, index) => {
                        item.addEventListener('click', () => selectMention(index));
                    });

                    mentionSuggestionsEl.classList.add('show');
                }

                function hideMentionSuggestions() {
                    mentionSuggestionsEl.classList.remove('show');
                    isMentionActive = false;
                    selectedSuggestionIndex = -1;
                }

                function selectMention(index) {
                    if (index < 0 || index >= mentionSuggestions.length) return;

                    const filePath = mentionSuggestions[index];
                    const text = textarea.value;
                    const cursorPos = textarea.selectionStart;
                    const textBeforeCursor = text.substring(0, cursorPos);
                    const textAfterCursor = text.substring(cursorPos);
                    
                    // Replace @query with @filename
                    const mentionMatch = textBeforeCursor.match(/@([^\\s@]*)$/);
                    if (mentionMatch) {
                        const fileName = filePath.split(/[/\\\\]/).pop();
                        const newText = textBeforeCursor.substring(0, mentionMatch.index) + '@' + fileName + ' ' + textAfterCursor;
                        textarea.value = newText;
                        textarea.focus();
                        
                        // Set cursor after the mention
                        const newCursorPos = mentionMatch.index + fileName.length + 2;
                        textarea.setSelectionRange(newCursorPos, newCursorPos);
                        
                        // Add file to context
                        vscode.postMessage({
                            type: 'addFileByPath',
                            path: filePath
                        });
                    }

                    hideMentionSuggestions();
                }

                // Send on Cmd+Enter
                textarea.addEventListener('keydown', function(e) {
                    if (isMentionActive && mentionSuggestions.length > 0) {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, mentionSuggestions.length - 1);
                            updateSuggestionSelection();
                            return;
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
                            updateSuggestionSelection();
                            return;
                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault();
                            if (selectedSuggestionIndex >= 0) {
                                selectMention(selectedSuggestionIndex);
                            } else {
                                selectMention(0);
                            }
                            return;
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            hideMentionSuggestions();
                            return;
                        }
                    }

                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                function updateSuggestionSelection() {
                    mentionSuggestionsEl.querySelectorAll('.mention-item').forEach((item, index) => {
                        item.classList.toggle('selected', index === selectedSuggestionIndex);
                    });
                }

                // Hide suggestions when clicking outside
                document.addEventListener('click', (e) => {
                    if (!mentionSuggestionsEl.contains(e.target) && e.target !== textarea) {
                        hideMentionSuggestions();
                    }
                });

                function sendMessage() {
                    const text = textarea.value.trim();
                    if (!text) return;

                    console.log('Sending message:', text);
                    console.log('Current file refs:', fileRefs);

                    // Send message - backend will use fileRefs from extension state
                    vscode.postMessage({
                        type: 'sendMessage',
                        text
                    });

                    textarea.value = '';
                    textarea.style.height = 'auto';
                }

                function addFile() {
                    console.log('Adding file');
                    vscode.postMessage({ type: 'addFile' });
                }

                function removeFile(path, lineStart) {
                    console.log('Removing file:', path, lineStart);
                    vscode.postMessage({ type: 'removeFile', path, lineStart });
                }

                function clearChat() {
                    vscode.postMessage({ type: 'clearChat' });
                }

                function copyCode(code) {
                    vscode.postMessage({ type: 'copyCode', code });
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    console.log('Webview received:', message);

                    switch (message.type) {
                        case 'updateChat':
                            messages = message.messages;
                            renderMessages();
                            break;
                        case 'updateFiles':
                            fileRefs = message.files;
                            renderFileRefs();
                            break;
                        case 'thinking':
                            showThinking(message.show);
                            break;
                        case 'fileSearchResults':
                            if (isMentionActive) {
                                showMentionSuggestions(message.files || []);
                            }
                            break;
                    }
                });

                function renderMessages() {
                    const container = document.getElementById('chatContainer');
                    
                    if (messages.length === 0) {
                        container.innerHTML = \`
                            <div class="empty-state">
                                <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
                                <div>Ask Loco anything...</div>
                            </div>
                        \`;
                        // Remove thinking indicator if no messages
                        const thinking = document.getElementById('thinking');
                        if (thinking) {
                            thinking.remove();
                        }
                        return;
                    }

                    container.innerHTML = messages.map(msg => \`
                        <div class="message \${msg.role}">
                            <div class="message-bubble">
                                \${formatMessage(msg.content)}
                            </div>
                        </div>
                    \`).join('');

                    // Add click handlers for copy buttons
                    container.querySelectorAll('.copy-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const code = e.target.getAttribute('data-code');
                            copyCode(code);
                        });
                    });

                    // Add thinking placeholder if it doesn't exist
                    if (!document.getElementById('thinking')) {
                        container.innerHTML += '<div class="thinking" id="thinking"><div class="thinking-dots"><span></span><span></span><span></span></div></div>';
                    }

                    container.scrollTop = container.scrollHeight;
                }

                function formatMessage(content) {
                    if (!content) return '';
                    
                    // Process markdown manually with proper escaping
                    const lines = content.split('\\n');
                    const result = [];
                    let inCodeBlock = false;
                    let codeBlockLang = '';
                    let codeBlockLines = [];
                    let inList = false;
                    let listItems = [];
                    
                    function processCodeBlock() {
                        if (codeBlockLines.length > 0) {
                            const codeContent = codeBlockLines.join('\\n');
                            const escaped = escapeHtml(codeContent);
                            const btnCode = escapeHtml(codeContent);
                            result.push('<div style="position: relative; margin: 12px 0;">');
                            result.push('<pre><code class="language-' + escapeHtml(codeBlockLang) + '">' + escaped + '</code></pre>');
                            result.push('<button class="copy-btn" data-code="' + btnCode + '">Copy</button>');
                            result.push('</div>');
                            codeBlockLines = [];
                            codeBlockLang = '';
                        }
                    }
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const trimmed = line.trim();
                        const backtick3 = String.fromCharCode(96, 96, 96);
                        
                        if (trimmed.indexOf(backtick3) === 0) {
                            if (inCodeBlock) {
                                processCodeBlock();
                                inCodeBlock = false;
                            } else {
                                if (inList) {
                                    result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>');
                                    inList = false;
                                    listItems = [];
                                }
                                codeBlockLang = trimmed.substring(3).trim();
                                inCodeBlock = true;
                            }
                            continue;
                        }
                        
                        if (inCodeBlock) {
                            codeBlockLines.push(line);
                            continue;
                        }
                        
                        // Headers
                        if (trimmed.indexOf('##### ') === 0) {
                            if (inList) { result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>'); inList = false; listItems = []; }
                            result.push('<h5>' + escapeHtml(trimmed.substring(6)) + '</h5>');
                            continue;
                        }
                        if (trimmed.indexOf('#### ') === 0) {
                            if (inList) { result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>'); inList = false; listItems = []; }
                            result.push('<h4>' + escapeHtml(trimmed.substring(5)) + '</h4>');
                            continue;
                        }
                        if (trimmed.indexOf('### ') === 0) {
                            if (inList) { result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>'); inList = false; listItems = []; }
                            result.push('<h3>' + escapeHtml(trimmed.substring(4)) + '</h3>');
                            continue;
                        }
                        if (trimmed.indexOf('## ') === 0) {
                            if (inList) { result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>'); inList = false; listItems = []; }
                            result.push('<h2>' + escapeHtml(trimmed.substring(3)) + '</h2>');
                            continue;
                        }
                        if (trimmed.indexOf('# ') === 0) {
                            if (inList) { result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>'); inList = false; listItems = []; }
                            result.push('<h1>' + escapeHtml(trimmed.substring(2)) + '</h1>');
                            continue;
                        }
                        
                        // Lists
                        const ulMatch = trimmed.match(/^[-\\*] (.+)$/);
                        const olMatch = trimmed.match(/^(\\d+)\\. (.+)$/);
                        if (ulMatch || olMatch) {
                            if (!inList || (ulMatch && listItems.length > 0 && listItems[0].match(/^\\d+\\./)) || 
                                (olMatch && listItems.length > 0 && listItems[0].match(/^[-\\*]/))) {
                                if (inList) {
                                    result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>');
                                }
                                result.push('<' + (olMatch ? 'ol' : 'ul') + '>');
                                inList = true;
                                listItems = [];
                            }
                            listItems.push(trimmed);
                            result.push('<li>' + formatInline(ulMatch ? ulMatch[1] : olMatch[2]) + '</li>');
                            continue;
                        }
                        
                        if (inList && trimmed === '') {
                            result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>');
                            inList = false;
                            listItems = [];
                            continue;
                        }
                        
                        if (trimmed === '') {
                            continue;
                        }
                        
                        if (inList) {
                            result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>');
                            inList = false;
                            listItems = [];
                        }
                        
                        result.push('<p>' + formatInline(line) + '</p>');
                    }
                    
                    if (inCodeBlock) processCodeBlock();
                    if (inList) result.push('</' + (listItems[0].match(/^\\d+\\./) ? 'ol' : 'ul') + '>');
                    
                    return result.join('\\n');
                }
                
                function formatInline(text) {
                    let html = escapeHtml(text);
                    // Bold
                    html = html.replace(/\\*\\*([^\\*\\n]+)\\*\\*/g, '<strong>$1</strong>');
                    // Italic  
                    html = html.replace(/\\*([^\\*\\n\\*]+)\\*/g, '<em>$1</em>');
                    // Inline code
                    const backtick = String.fromCharCode(96);
                    const codeRegex = new RegExp(backtick + '([^' + backtick + '\\n]+)' + backtick, 'g');
                    html = html.replace(codeRegex, '<code>$1</code>');
                    // Links
                    html = html.replace(/\\[([^\\]]+)\\]\\(([^\\)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
                    return html;
                }

                function renderFileRefs() {
                    const container = document.getElementById('fileRefs');
                    
                    if (fileRefs.length === 0) {
                        container.classList.remove('has-files');
                        container.innerHTML = '';
                        return;
                    }

                    container.classList.add('has-files');
                    container.innerHTML = fileRefs.map((f, index) => \`
                        <span class="file-chip">
                            📄 \${f.name}
                            <span class="remove" data-path="\${f.path}" data-line-start="\${f.lineStart || 0}" title="Remove file">✕</span>
                        </span>
                    \`).join('');
                    
                    // Add click handlers for remove buttons
                    container.querySelectorAll('.remove').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const path = e.target.getAttribute('data-path');
                            const lineStart = parseInt(e.target.getAttribute('data-line-start'));
                            removeFile(path, lineStart);
                        });
                    });
                }

                function showThinking(show) {
                    const thinking = document.getElementById('thinking');
                    if (thinking) {
                        thinking.classList.toggle('show', show);
                        const container = document.getElementById('chatContainer');
                        container.scrollTop = container.scrollHeight;
                    }
                }

                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }

                console.log('Chat panel webview loaded');
                
                // Notify extension that webview is ready
                vscode.postMessage({ type: 'webviewReady' });
            </script>
        </body>
        </html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
