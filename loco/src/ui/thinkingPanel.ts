import * as vscode from 'vscode';
import { marked } from 'marked';

export class ThinkingPanel {
    private panel: vscode.WebviewPanel | undefined;
    private currentEditor: vscode.TextEditor | undefined;
    private onAcceptCallback?: () => void;
    private onRejectCallback?: () => void;

    constructor(private extensionUri: vscode.Uri) {}

    /**
     * Show thinking panel with agent activity
     */
    show(
        title: string,
        agentName: string,
        thinking: string,
        onAccept?: () => void,
        onReject?: () => void
    ) {
        this.onAcceptCallback = onAccept;
        this.onRejectCallback = onReject;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'locoThinking',
                title,
                { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            this.panel.webview.onDidReceiveMessage(message => {
                switch (message.type) {
                    case 'accept':
                        this.onAcceptCallback?.();
                        break;
                    case 'reject':
                        this.onRejectCallback?.();
                        this.panel?.dispose();
                        break;
                }
            });
        }

        this.panel.webview.html = this.getHtmlContent(title, agentName, thinking);
    }

    /**
     * Update panel content
     */
    update(content: string) {
        if (this.panel) {
            // Parse markdown on extension side, not in webview
            const htmlContent = marked.parse(content) as string;
            this.panel.webview.postMessage({
                type: 'update',
                content: htmlContent
            });
        }
    }

    /**
     * Show tool usage
     */
    showTool(toolName: string, toolInput: any) {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'tool',
                toolName,
                toolInput: JSON.stringify(toolInput, null, 2)
            });
        }
    }

    private getHtmlContent(title: string, agentName: string, thinking: string): string {
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>${title}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body {
                    font-family: var(--vscode-font-family);
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 20px;
                    line-height: 1.6;
                }

                .header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 20px;
                }

                .agent-badge {
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .title {
                    font-size: 16px;
                    font-weight: 600;
                }

                .thinking {
                    margin-bottom: 20px;
                }

                .section {
                    margin-bottom: 24px;
                }

                .section-title {
                    font-size: 13px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    opacity: 0.9;
                }

                .tool-usage {
                    background: var(--vscode-textBlockQuote-background);
                    border-left: 3px solid var(--vscode-textLink-foreground);
                    padding: 12px;
                    margin-bottom: 12px;
                    border-radius: 4px;
                }

                .tool-name {
                    font-weight: 600;
                    margin-bottom: 6px;
                    color: var(--vscode-textLink-foreground);
                }

                pre {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 12px;
                    border-radius: 6px;
                    overflow-x: auto;
                    font-size: 12px;
                }

                code {
                    font-family: 'Monaco', 'Menlo', monospace;
                }

                .content {
                    margin-bottom: 24px;
                }

                .actions {
                    position: sticky;
                    bottom: 0;
                    background: var(--vscode-editor-background);
                    padding: 16px 0;
                    border-top: 1px solid var(--vscode-panel-border);
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }

                .btn {
                    padding: 8px 20px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: opacity 0.2s;
                }

                .btn:hover {
                    opacity: 0.9;
                }

                .btn-accept {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }

                .btn-reject {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }

                .spinner {
                    display: inline-block;
                    width: 14px;
                    height: 14px;
                    border: 2px solid var(--vscode-foreground);
                    border-radius: 50%;
                    border-top-color: transparent;
                    animation: spin 0.6s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <span class="agent-badge">${agentName}</span>
                <span class="title">${title}</span>
            </div>

            <div id="toolsSection" class="section" style="display: none;">
                <div class="section-title">🔧 Tools Used</div>
                <div id="toolsList"></div>
            </div>

            <div class="section">
                <div class="section-title">💭 Analysis</div>
                <div class="content" id="content">${marked.parse(thinking)}</div>
            </div>

            <div class="actions">
                <button class="btn btn-reject" onclick="reject()">Reject</button>
                <button class="btn btn-accept" onclick="accept()">✓ Accept Changes</button>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                function accept() {
                    vscode.postMessage({ type: 'accept' });
                }

                function reject() {
                    vscode.postMessage({ type: 'reject' });
                }

                window.addEventListener('message', event => {
                    const message = event.data;

                    if (message.type === 'update') {
                        // Content is already parsed HTML from extension
                        document.getElementById('content').innerHTML = message.content;
                    }

                    if (message.type === 'tool') {
                        const toolsSection = document.getElementById('toolsSection');
                        const toolsList = document.getElementById('toolsList');
                        
                        toolsSection.style.display = 'block';
                        
                        const toolDiv = document.createElement('div');
                        toolDiv.className = 'tool-usage';
                        toolDiv.innerHTML = \`
                            <div class="tool-name">\${message.toolName}</div>
                            <pre><code>\${message.toolInput}</code></pre>
                        \`;
                        toolsList.appendChild(toolDiv);
                    }
                });
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

    dispose() {
        this.panel?.dispose();
    }
}
