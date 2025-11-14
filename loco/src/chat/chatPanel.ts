import * as vscode from 'vscode';
import { BackendClient } from '../api/backendClient';
import { ChatMessage, ChatRequest, FileReference } from '../types';

export class ChatPanel {
    private static currentPanel: ChatPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private backend: BackendClient;
    private chatHistory: ChatMessage[] = [];
    private fileReferences: FileReference[] = [];
    private disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri,
        backend: BackendClient
    ) {
        this.panel = panel;
        this.backend = backend;

        // Set webview content
        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Listen for active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateCurrentFileButton();
        }, null, this.disposables);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (data) => {
                console.log('Received message:', data);
                
                switch (data.type) {
                    case 'sendMessage':
                        await this.handleUserMessage(data.text, this.fileReferences);
                        break;
                    case 'addFile':
                        await this.handleAddFileRequest();
                        break;
                    case 'addCurrentFile':
                        await this.addCurrentFile();
                        break;
                    case 'addFileByPath':
                        await this.addFileByPath(data.path);
                        break;
                    case 'searchFiles':
                        const files = await this.handleFileSearch(data.query);
                        this.panel.webview.postMessage({
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
                        this.updateCurrentFileButton();
                        break;
                    case 'getCurrentFileName':
                        this.updateCurrentFileButton();
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    /**
     * Create or reveal the chat panel (singleton pattern)
     */
    public static createOrShow(extensionUri: vscode.Uri, backend: BackendClient) {
        // If panel already exists, just reveal it
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Create new panel beside the active editor
        const panel = vscode.window.createWebviewPanel(
            'locoChatPanel',
            'Loco Chat',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, backend);
    }

    /**
     * Dispose the panel
     */
    private dispose() {
        ChatPanel.currentPanel = undefined;

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
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
        const filePath = document.fileName;

        // Check if file is already in context
        const existingIndex = this.fileReferences.findIndex(f => f.path === filePath);

        if (existingIndex !== -1) {
            // Remove from context
            this.fileReferences.splice(existingIndex, 1);
            this.updateFileReferences();
            this.updateCurrentFileButton();
            vscode.window.showInformationMessage(`Removed ${document.fileName.split('/').pop()} from chat context`);
            return;
        }

        // Add to context
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
        this.updateCurrentFileButton();
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
            this.updateCurrentFileButton();
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

        this.panel.webview.postMessage(message);
    }

    private updateFileReferences() {
        const message = {
            type: 'updateFiles',
            files: this.fileReferences
        };

        this.panel.webview.postMessage(message);
    }

    private showThinking(show: boolean) {
        const message = {
            type: 'thinking',
            show
        };

        this.panel.webview.postMessage(message);
    }

    private clearChat() {
        this.chatHistory = [];
        this.fileReferences = [];
        this.updateChat();
        this.updateFileReferences();
        this.updateCurrentFileButton();
    }

    private updateCurrentFileButton() {
        const editor = vscode.window.activeTextEditor;
        
        let fileName = '';
        let isInContext = false;
        let filePath = '';

        if (editor) {
            filePath = editor.document.fileName;
            fileName = filePath.split('/').pop() || '';
            isInContext = this.fileReferences.some(f => f.path === filePath);
        }

        const message = {
            type: 'updateCurrentFileButton',
            fileName,
            isInContext,
            filePath
        };

        this.panel.webview.postMessage(message);
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
                :root {
                    --jet-bg: #000000;
                    --jet-panel: #0a0a0a;
                    --jet-border: #1c1c1c;
                    --jet-hover: #111111;
                    --msg-user: #0b62ff;
                    --msg-assistant: #111;
                    --glow: 0 0 12px rgba(0, 122, 255, 0.3);
                    --radius: 12px;
                    --transition: 0.15s ease;
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
                    background: var(--jet-bg);
                    color: var(--vscode-editor-foreground);
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                /* HEADER */
                .header {
                    padding: 14px 18px;
                    background: var(--jet-panel);
                    border-bottom: 1px solid var(--jet-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                    box-shadow: 0 2px 10px #00000066;
                }

                .header h1 {
                    font-size: 14px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #e0e0e0;
                }

                .icon-btn {
                    background: transparent;
                    border: none;
                    color: #888;
                    cursor: pointer;
                    padding: 6px;
                    font-size: 16px;
                    border-radius: 6px;
                    transition: var(--transition);
                }
                .icon-btn:hover {
                    background: var(--jet-hover);
                    color: #fff;
                }

                /* FILE REFERENCES */
                .file-references {
                    padding: 8px 14px;
                    border-bottom: 1px solid var(--jet-border);
                    background: var(--jet-panel);
                    display: none;
                    flex-shrink: 0;
                }
                .file-references.has-files {
                    display: block;
                }

                .file-chip {
                    padding: 5px 10px;
                    background: #111;
                    border: 1px solid #222;
                    color: #ccc;
                    border-radius: 8px;
                    font-size: 11px;
                    margin: 2px 5px 2px 0;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: var(--transition);
                }
                .file-chip:hover {
                    background: #151515;
                }
                .file-chip .remove {
                    cursor: pointer;
                    opacity: 0.7;
                    font-weight: bold;
                }
                .file-chip .remove:hover {
                    opacity: 1;
                }

                /* CHAT AREA */
                .chat-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    background: var(--jet-bg);
                }

                .message {
                    margin-bottom: 18px;
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .message.user {
                    display: flex;
                    justify-content: flex-end;
                }

                .message-bubble {
                    max-width: 85%;
                    padding: 12px 16px;
                    border-radius: var(--radius);
                    line-height: 1.5;
                    font-size: 13px;
                    word-wrap: break-word;
                }

                .message.user .message-bubble {
                    background: var(--msg-user);
                    color: white;
                    border-bottom-right-radius: 4px;
                    box-shadow: var(--glow);
                }

                .message.assistant .message-bubble {
                    background: #0e0e0e;
                    border: 1px solid #222;
                    border-bottom-left-radius: 4px;
                    box-shadow: 0 0 4px #00000055;
                }

                .message-bubble pre {
                    background: #0b0b0b;
                    border: 1px solid #222;
                    padding: 14px;
                    border-radius: 10px;
                    overflow-x: auto;
                    margin: 14px 0;
                    position: relative;
                }

                .message-bubble pre code {
                    background: transparent;
                    padding: 0;
                    color: #d4d4d4;
                    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
                    font-size: 12px;
                    line-height: 1.6;
                    display: block;
                    white-space: pre;
                }

                .message-bubble code {
                    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
                    font-size: 12px;
                    background: #1a1a1a;
                    padding: 2px 6px;
                    border-radius: 3px;
                    color: #4ec9b0;
                    border: 1px solid #2a2a2a;
                }

                /* Syntax Highlighting - VS Code Dark+ Theme */
                .message-bubble pre code .keyword {
                    color: #569cd6;
                }

                .message-bubble pre code .string {
                    color: #ce9178;
                }

                .message-bubble pre code .comment {
                    color: #6a9955;
                    font-style: italic;
                }

                .message-bubble pre code .function {
                    color: #dcdcaa;
                }

                .message-bubble pre code .class {
                    color: #4ec9b0;
                }

                .message-bubble pre code .number {
                    color: #b5cea8;
                }

                .message-bubble pre code .operator {
                    color: #d4d4d4;
                }

                .message-bubble pre code .punctuation {
                    color: #808080;
                }

                .message-bubble pre code .variable {
                    color: #9cdcfe;
                }

                .message-bubble pre code .property {
                    color: #9cdcfe;
                }

                .message-bubble pre code .tag {
                    color: #569cd6;
                }

                .message-bubble pre code .attr-name {
                    color: #9cdcfe;
                }

                .message-bubble pre code .attr-value {
                    color: #ce9178;
                }

                .message-bubble pre code .decorator {
                    color: #dcdcaa;
                }

                .message-bubble pre code .type {
                    color: #4ec9b0;
                }

                .code-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 10px;
                    background: #0a0a0a;
                    border-bottom: 1px solid #222;
                    border-radius: 10px 10px 0 0;
                    margin: 14px 0 0 0;
                }

                .code-language {
                    font-size: 10px;
                    color: #888;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-weight: 600;
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
                    color: #e0e0e0;
                }

                .message-bubble h1 { 
                    font-size: 1.5em;
                    border-bottom: 2px solid #333;
                    padding-bottom: 8px;
                }
                .message-bubble h2 { 
                    font-size: 1.3em;
                    border-bottom: 1px solid #2a2a2a;
                    padding-bottom: 6px;
                }
                .message-bubble h3 { 
                    font-size: 1.1em;
                    color: #4ec9b0;
                }
                .message-bubble h4 { 
                    font-size: 1em;
                    color: #9cdcfe;
                }

                .message-bubble ul,
                .message-bubble ol {
                    margin: 8px 0;
                    padding-left: 24px;
                }

                .message-bubble li {
                    margin: 4px 0;
                    line-height: 1.5;
                }

                .message-bubble li::marker {
                    color: #569cd6;
                }

                .message-bubble blockquote {
                    border-left: 3px solid #569cd6;
                    padding-left: 12px;
                    margin: 8px 0;
                    color: #b0b0b0;
                    font-style: italic;
                    background: #0a0a0a;
                    padding: 8px 12px;
                    border-radius: 4px;
                }

                .message-bubble table {
                    border-collapse: collapse;
                    margin: 12px 0;
                    width: 100%;
                    border: 1px solid #333;
                }

                .message-bubble th,
                .message-bubble td {
                    border: 1px solid #333;
                    padding: 8px 12px;
                    text-align: left;
                }

                .message-bubble th {
                    background: #0a0a0a;
                    font-weight: 600;
                    color: #4ec9b0;
                    border-bottom: 2px solid #569cd6;
                }

                .message-bubble tr:nth-child(even) {
                    background: #050505;
                }

                .message-bubble hr {
                    border: none;
                    border-top: 1px solid #333;
                    margin: 16px 0;
                }

                .message-bubble a {
                    color: #4fc3f7;
                    text-decoration: none;
                    border-bottom: 1px solid transparent;
                    transition: var(--transition);
                }

                .message-bubble a:hover {
                    border-bottom-color: #4fc3f7;
                }

                .message-bubble strong {
                    font-weight: 600;
                    color: #dcdcaa;
                }

                .message-bubble em {
                    font-style: italic;
                    color: #ce9178;
                }

                .copy-btn {
                    margin-top: 6px;
                    background: #111;
                    border: 1px solid #222;
                    padding: 4px 8px;
                    font-size: 11px;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #ddd;
                    transition: var(--transition);
                }
                .copy-btn:hover {
                    background: #1a1a1a;
                }

                /* THINKING */
                .thinking {
                    display: none;
                    padding: 12px 14px;
                    background: #0e0e0e;
                    border: 1px solid #222;
                    border-radius: var(--radius);
                    border-bottom-left-radius: 2px;
                    width: 70px;
                    margin-top: 10px;
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
                    background: #888;
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

                /* INPUT AREA */
                .input-area {
                    border-top: 1px solid var(--jet-border);
                    background: var(--jet-panel);
                    padding: 14px 18px;
                    flex-shrink: 0;
                    box-shadow: 0 -2px 10px #00000066;
                }

                .input-actions {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 8px;
                }

                .action-btn {
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 11px;
                    background: #111;
                    color: #ccc;
                    border: 1px solid #222;
                    cursor: pointer;
                    transition: var(--transition);
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .action-btn:hover {
                    background: #1a1a1a;
                }

                .action-btn.icon-only {
                    padding: 6px 10px;
                    font-size: 14px;
                }

                .action-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .action-btn.in-context {
                    background: #1a2a1a;
                    border-color: #2a4a2a;
                    color: #6ec96e;
                }

                .action-btn.in-context:hover {
                    background: #223a22;
                }

                .input-wrapper {
                    display: flex;
                    gap: 10px;
                    align-items: flex-end;
                    position: relative;
                }

                textarea {
                    flex: 1;
                    background: #0c0c0c;
                    color: #ddd;
                    border: 1px solid #222;
                    border-radius: 8px;
                    padding: 12px;
                    font-family: inherit;
                    font-size: 13px;
                    resize: none;
                    min-height: 40px;
                    max-height: 160px;
                }
                textarea:focus {
                    outline: none;
                    border-color: #0b62ff;
                    box-shadow: var(--glow);
                }

                .send-btn {
                    padding: 10px 18px;
                    border-radius: 8px;
                    background: var(--msg-user);
                    border: none;
                    color: white;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: var(--transition);
                }
                .send-btn:hover {
                    box-shadow: var(--glow);
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
            </style>
        </head>
        <body>
            <div class="header">
                <h1>LOCO CHAT</h1>
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
                    <button class="action-btn" id="addCurrentFileBtn" title="Toggle current file in context" disabled>
                        + No file
                    </button>
                    <button class="action-btn" id="addCurrentFileBtn" title="Toggle current file in context" disabled>
                        + No file
                    </button>
                    <button class="action-btn" id="addCurrentFileBtn" title="Toggle current file in context" disabled>
                        + No file
                    </button>
                    <button class="action-btn icon-only" id="addFileBtn" title="Browse and add file">
                        📎
                    </button>
                </div>
                <div class="input-wrapper">
                    <div class="mention-suggestions" id="mentionSuggestions"></div>
                    <textarea 
                        id="messageInput" 
                        placeholder="Ask about your code... @ to reference files"
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
                const addCurrentFileBtn = document.getElementById('addCurrentFileBtn');
                const clearChatBtn = document.getElementById('clearChatBtn');

                // Add event listeners
                sendBtn.addEventListener('click', sendMessage);
                addFileBtn.addEventListener('click', addFile);
                addCurrentFileBtn.addEventListener('click', addCurrentFile);
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

                function addCurrentFile() {
                    console.log('Adding current file');
                    vscode.postMessage({ type: 'addCurrentFile' });
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

                function updateCurrentFileButton(fileName, isInContext, filePath) {
                    const btn = document.getElementById('addCurrentFileBtn');
                    if (!btn) return;

                    if (!fileName) {
                        btn.disabled = true;
                        btn.textContent = '+ No file';
                        btn.classList.remove('in-context');
                        btn.title = 'No active file';
                    } else {
                        btn.disabled = false;
                        if (isInContext) {
                            btn.textContent = '× ' + fileName;
                            btn.classList.add('in-context');
                            btn.title = 'Remove ' + fileName + ' from context';
                        } else {
                            btn.textContent = '+ ' + fileName;
                            btn.classList.remove('in-context');
                            btn.title = 'Add ' + fileName + ' to context';
                        }
                    }
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
                            // Request update for current file button state
                            vscode.postMessage({ type: 'getCurrentFileName' });
                            break;
                        case 'thinking':
                            showThinking(message.show);
                            break;
                        case 'fileSearchResults':
                            if (isMentionActive) {
                                showMentionSuggestions(message.files || []);
                            }
                            break;
                        case 'updateCurrentFileButton':
                            updateCurrentFileButton(message.fileName, message.isInContext, message.filePath);
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
                            const highlighted = highlightCode(codeContent, codeBlockLang);
                            const btnCode = escapeHtml(codeContent);
                            result.push('<div style="position: relative; margin: 12px 0;">');
                            result.push('<div class="code-header">');
                            result.push('<span class="code-language">' + escapeHtml(codeBlockLang || 'code') + '</span>');
                            result.push('<button class="copy-btn" data-code="' + btnCode + '" style="margin: 0; padding: 3px 8px;">Copy</button>');
                            result.push('</div>');
                            result.push('<pre style="margin: 0; border-radius: 0 0 10px 10px;"><code class="language-' + escapeHtml(codeBlockLang) + '">' + highlighted + '</code></pre>');
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

                function highlightCode(code, language) {
                    if (!code) return '';
                    
                    const escaped = escapeHtml(code);
                    const lang = (language || '').toLowerCase();
                    
                    // Simple but effective syntax highlighting
                    let highlighted = escaped;
                    
                    if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
                        // Keywords
                        highlighted = highlighted.replace(/\\b(const|let|var|function|class|if|else|return|import|export|from|default|async|await|try|catch|new|this|super|extends|implements|interface|type|enum|namespace|public|private|protected|static|readonly)\\b/g, '<span class="keyword">$1</span>');
                        // Strings
                        highlighted = highlighted.replace(/(['"\`])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1/g, '<span class="string">$1$2$1</span>');
                        // Comments
                        highlighted = highlighted.replace(/(\\/\\/.*$)/gm, '<span class="comment">$1</span>');
                        highlighted = highlighted.replace(/(\\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="comment">$1</span>');
                        // Numbers
                        highlighted = highlighted.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="number">$1</span>');
                        // Functions
                        highlighted = highlighted.replace(/\\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\\s*\\()/g, '<span class="function">$1</span>');
                    }
                    else if (lang === 'python' || lang === 'py') {
                        // Keywords
                        highlighted = highlighted.replace(/\\b(def|class|if|elif|else|return|import|from|as|try|except|finally|with|for|while|in|is|not|and|or|lambda|yield|async|await|pass|break|continue|raise|assert|None|True|False|self)\\b/g, '<span class="keyword">$1</span>');
                        // Decorators
                        highlighted = highlighted.replace(/(@[a-zA-Z_][a-zA-Z0-9_]*)/g, '<span class="decorator">$1</span>');
                        // Strings
                        highlighted = highlighted.replace(/(['"])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1/g, '<span class="string">$1$2$1</span>');
                        highlighted = highlighted.replace(/('''[\\s\\S]*?'''|"""[\\s\\S]*?""")/g, '<span class="string">$1</span>');
                        // Comments
                        highlighted = highlighted.replace(/(#.*$)/gm, '<span class="comment">$1</span>');
                        // Numbers
                        highlighted = highlighted.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="number">$1</span>');
                        // Functions
                        highlighted = highlighted.replace(/\\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\\s*\\()/g, '<span class="function">$1</span>');
                    }
                    else if (lang === 'html' || lang === 'xml') {
                        // Tags
                        highlighted = highlighted.replace(/(&lt;\\/?[a-zA-Z][a-zA-Z0-9]*)/g, '<span class="tag">$1</span>');
                        highlighted = highlighted.replace(/(&gt;)/g, '<span class="tag">$1</span>');
                        // Attributes
                        highlighted = highlighted.replace(/\\b([a-zA-Z-]+)(?==)/g, '<span class="attr-name">$1</span>');
                        // Attribute values
                        highlighted = highlighted.replace(/=(['"])(.*?)\\1/g, '=<span class="attr-value">$1$2$1</span>');
                        // Comments
                        highlighted = highlighted.replace(/(&lt;!--[\\s\\S]*?--&gt;)/g, '<span class="comment">$1</span>');
                    }
                    else if (lang === 'css' || lang === 'scss' || lang === 'sass') {
                        // Properties
                        highlighted = highlighted.replace(/\\b([a-z-]+)(?=\\s*:)/g, '<span class="property">$1</span>');
                        // Selectors
                        highlighted = highlighted.replace(/([.#][a-zA-Z][a-zA-Z0-9_-]*)/g, '<span class="class">$1</span>');
                        // Strings
                        highlighted = highlighted.replace(/(['"])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1/g, '<span class="string">$1$2$1</span>');
                        // Comments
                        highlighted = highlighted.replace(/(\\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="comment">$1</span>');
                        // Numbers and units
                        highlighted = highlighted.replace(/\\b(\\d+\\.?\\d*)(px|em|rem|%|vh|vw)?\\b/g, '<span class="number">$1$2</span>');
                    }
                    else if (lang === 'json') {
                        // Keys
                        highlighted = highlighted.replace(/("(?:\\\\.|[^"\\\\])*")\\s*:/g, '<span class="property">$1</span>:');
                        // String values
                        highlighted = highlighted.replace(/:\\s*("(?:\\\\.|[^"\\\\])*")/g, ': <span class="string">$1</span>');
                        // Numbers
                        highlighted = highlighted.replace(/:\\s*(\\d+\\.?\\d*)/g, ': <span class="number">$1</span>');
                        // Booleans and null
                        highlighted = highlighted.replace(/\\b(true|false|null)\\b/g, '<span class="keyword">$1</span>');
                    }
                    else if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
                        // Commands
                        highlighted = highlighted.replace(/\\b(cd|ls|mkdir|rm|cp|mv|echo|cat|grep|sed|awk|curl|wget|git|npm|yarn|pip|python|node|docker)\\b/g, '<span class="keyword">$1</span>');
                        // Strings
                        highlighted = highlighted.replace(/(['"])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1/g, '<span class="string">$1$2$1</span>');
                        // Comments
                        highlighted = highlighted.replace(/(#.*$)/gm, '<span class="comment">$1</span>');
                        // Variables
                        highlighted = highlighted.replace(/(\\$[a-zA-Z_][a-zA-Z0-9_]*|\\$\\{[^}]+\\})/g, '<span class="variable">$1</span>');
                    }
                    else if (lang === 'sql') {
                        // Keywords
                        highlighted = highlighted.replace(/\\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET)\\b/gi, '<span class="keyword">$1</span>');
                        // Strings
                        highlighted = highlighted.replace(/(['"])((?:\\\\.|(?!\\1)[^\\\\])*?)\\1/g, '<span class="string">$1$2$1</span>');
                        // Comments
                        highlighted = highlighted.replace(/(--.*$)/gm, '<span class="comment">$1</span>');
                        // Numbers
                        highlighted = highlighted.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="number">$1</span>');
                    }
                    
                    return highlighted;
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
