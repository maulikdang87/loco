import * as vscode from 'vscode';

export class InlineWidget {
    private decorationType?: vscode.TextEditorDecorationType;
    private statusBarItem?: vscode.StatusBarItem;

    /**
     * Show inline widget below selection
     */
    showWidget(
        editor: vscode.TextEditor,
        title: string,
        content: string,
        actions?: Array<{ label: string; callback: () => void }>
    ) {
        const selection = editor.selection;
        
        // Create compact content (max 100 chars)
        const compactContent = this.compactify(content);
        
        // Clear previous
        this.clear(editor);

        // Create decoration type for inline display
        this.decorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: false,
            after: {
                contentText: `  💡 ${compactContent}`,
                backgroundColor: new vscode.ThemeColor('editorInfo.background'),
                border: '1px solid',
                borderColor: new vscode.ThemeColor('editorInfo.border'),
                color: new vscode.ThemeColor('editorInfo.foreground'),
                margin: '0 0 0 1em',
                fontStyle: 'italic',
                textDecoration: 'none; padding: 4px 8px; border-radius: 3px; white-space: nowrap;'
            }
        });

        // Apply decoration at end of last selected line
        const endLine = selection.end.line;
        const lineLength = editor.document.lineAt(endLine).text.length;
        const decorationRange = new vscode.Range(
            endLine,
            lineLength,
            endLine,
            lineLength
        );

        const decorationOptions: vscode.DecorationOptions = {
            range: decorationRange,
            hoverMessage: this.createHoverMessage(title, content, actions)
        };

        editor.setDecorations(this.decorationType, [decorationOptions]);

        // Show full content in status bar with actions
        this.showInStatusBar(title, content, actions);

        // Auto-clear after 8 seconds
        setTimeout(() => {
            this.clear(editor);
        }, 8000);
    }

    /**
     * Create hover message with full content
     */
    private createHoverMessage(
        title: string,
        content: string,
        actions?: Array<{ label: string; callback: () => void }>
    ): vscode.MarkdownString {
        const markdown = new vscode.MarkdownString();
        markdown.supportHtml = true;
        markdown.isTrusted = true;

        // Title
        markdown.appendMarkdown(`### ${title}\n\n`);

        // Content
        markdown.appendMarkdown(content);

        // Actions
        if (actions && actions.length > 0) {
            markdown.appendMarkdown('\n\n---\n\n');
            actions.forEach((action, i) => {
                const command = `loco.inlineAction${i}`;
                markdown.appendMarkdown(`[$(${this.getIcon(action.label)}) ${action.label}](command:${command})  `);
                
                // Register command
                const disposable = vscode.commands.registerCommand(command, () => {
                    action.callback();
                    disposable.dispose();
                });
            });
        }

        return markdown;
    }

    /**
     * Show in status bar with clickable actions
     */
    private showInStatusBar(
        title: string,
        content: string,
        actions?: Array<{ label: string; callback: () => void }>
    ) {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right,
                1000
            );
        }

        const compactContent = this.compactify(content);
        this.statusBarItem.text = `$(lightbulb) ${title}: ${compactContent}`;
        this.statusBarItem.tooltip = content;
        
        if (actions && actions.length > 0) {
            // Use first action as primary
            this.statusBarItem.command = {
                title: actions[0].label,
                command: 'loco.statusBarAction',
                arguments: [actions[0].callback]
            };
            
            vscode.commands.registerCommand('loco.statusBarAction', (callback: () => void) => {
                callback();
            });
        }

        this.statusBarItem.show();

        // Auto-hide after 8 seconds
        setTimeout(() => {
            this.statusBarItem?.hide();
        }, 8000);
    }

    /**
     * Compactify content for inline display
     */
    private compactify(content: string): string {
        // Remove markdown formatting
        let compact = content
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/``````/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\n/g, ' ')
            .trim();

        // Truncate if too long
        if (compact.length > 80) {
            compact = compact.substring(0, 77) + '...';
        }

        return compact;
    }

    private getIcon(label: string): string {
        if (label.toLowerCase().includes('accept') || label.toLowerCase().includes('apply')) {
            return 'check';
        }
        if (label.toLowerCase().includes('reject') || label.toLowerCase().includes('cancel')) {
            return 'close';
        }
        return 'info';
    }

    clear(editor: vscode.TextEditor) {
        if (this.decorationType) {
            editor.setDecorations(this.decorationType, []);
            this.decorationType.dispose();
            this.decorationType = undefined;
        }
        this.statusBarItem?.hide();
    }

    dispose() {
        this.decorationType?.dispose();
        this.statusBarItem?.dispose();
    }
}
