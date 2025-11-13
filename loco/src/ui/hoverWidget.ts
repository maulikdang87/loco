import * as vscode from 'vscode';

export class HoverWidget {
    private decoration: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];
    private currentEditor?: vscode.TextEditor;
    private currentRange?: vscode.Range;

    constructor() {
        // Create decoration for the hover widget
        this.decoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '',
                backgroundColor: new vscode.ThemeColor('editor.infoBackground'),
                border: '1px solid',
                borderColor: new vscode.ThemeColor('editor.infoBorder'),
                margin: '0 0 0 10px'
            }
        });
    }

    /**
     * Show hover widget at current selection
     */
    async show(
        editor: vscode.TextEditor,
        title: string,
        content: string,
        actions?: Array<{ label: string; callback: () => void }>
    ) {
        this.currentEditor = editor;
        const selection = editor.selection;
        
        // Create webview panel (but make it small and positioned)
        const panel = vscode.window.createWebviewPanel(
            'locoHover',
            title,
            {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true
            },
            {
                enableScripts: true,
                retainContextWhenHidden: false
            }
        );

        // Make it small and positioned at cursor
        panel.webview.html = this.getCompactHtml(title, content, actions || []);

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(message => {
            if (message.type === 'action') {
                const action = actions?.[message.index];
                if (action) {
                    action.callback();
                }
            } else if (message.type === 'close') {
                panel.dispose();
            }
        });

        this.disposables.push(panel);
    }

    /**
     * Show as notification with markdown support
     */
    async showAsNotification(
        title: string,
        content: string,
        actions?: string[]
    ): Promise<string | undefined> {
        // For really simple cases, use VS Code's notification
        // But render markdown as plain text
        const plainText = this.markdownToPlainText(content);
        
        return await vscode.window.showInformationMessage(
            `${title}\n\n${plainText.substring(0, 200)}...`,
            ...(actions || ['Close'])
        );
    }

    /**
     * Show inline widget below selection
     */
    showInline(
        editor: vscode.TextEditor,
        content: string
    ) {
        const selection = editor.selection;
        const line = selection.end.line;
        
        // Create decoration with content
        const decorationOptions: vscode.DecorationOptions = {
            range: new vscode.Range(line, 0, line, 0),
            renderOptions: {
                after: {
                    contentText: ` 💡 ${content.substring(0, 100)}...`,
                    backgroundColor: new vscode.ThemeColor('editorInfo.background'),
                    border: '1px solid',
                    borderColor: new vscode.ThemeColor('editorInfo.border'),
                    margin: '0 0 0 10px',
                    fontStyle: 'italic'
                }
            }
        };

        editor.setDecorations(this.decoration, [decorationOptions]);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            this.clear(editor);
        }, 5000);
    }

    private getCompactHtml(title: string, content: string, actions: Array<{ label: string }>) {
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                body {
                    font-family: var(--vscode-font-family);
                    font-size: 13px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 16px;
                    max-width: 600px;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }

                .title {
                    font-weight: 600;
                    font-size: 13px;
                }

                .close-btn {
                    background: transparent;
                    border: none;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                    padding: 4px;
                    opacity: 0.6;
                }

                .close-btn:hover {
                    opacity: 1;
                }

                .content {
                    line-height: 1.5;
                    margin-bottom: 12px;
                }

                .content strong {
                    color: var(--vscode-textLink-foreground);
                }

                .content ul {
                    margin: 8px 0 8px 20px;
                }

                .content code {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: 'Monaco', monospace;
                    font-size: 12px;
                }

                .content pre {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 10px;
                    border-radius: 4px;
                    overflow-x: auto;
                    margin: 8px 0;
                }

                .actions {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }

                .action-btn {
                    padding: 6px 14px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                }

                .action-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <span class="title">${title}</span>
                <button class="close-btn" onclick="close()">✕</button>
            </div>
            
            <div class="content" id="content">${this.formatMarkdown(content)}</div>
            
            ${actions.length > 0 ? `
            <div class="actions">
                ${actions.map((action, i) => `
                    <button class="action-btn" onclick="performAction(${i})">
                        ${action.label}
                    </button>
                `).join('')}
            </div>
            ` : ''}

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                function close() {
                    vscode.postMessage({ type: 'close' });
                }

                function performAction(index) {
                    vscode.postMessage({ type: 'action', index });
                }
            </script>
        </body>
        </html>`;
    }

    private formatMarkdown(markdown: string): string {
        // Simple markdown to HTML conversion
        let html = markdown;
        
        // Bold
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Code blocks
        html = html.replace(/``````/g, '<pre><code>$1</code></pre>');
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bullet points
        html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }

    private markdownToPlainText(markdown: string): string {
        return markdown
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/``````/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^\- /gm, '• ');
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    clear(editor: vscode.TextEditor) {
        editor.setDecorations(this.decoration, []);
    }

    dispose() {
        this.decoration.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
