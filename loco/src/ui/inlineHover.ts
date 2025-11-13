import * as vscode from 'vscode';

export class InlineHover {
    private currentDecoration?: vscode.TextEditorDecorationType;
    
    /**
     * Show inline hover below selection using native VS Code hover
     */
    async showHover(
        editor: vscode.TextEditor,
        title: string,
        content: string,
        actions?: Array<{ label: string; callback: () => void }>
    ) {
        const selection = editor.selection;
        
        // Create markdown content with actions
        let markdown = new vscode.MarkdownString();
        markdown.supportHtml = true;
        markdown.isTrusted = true;
        
        // Add title with icon
        markdown.appendMarkdown(`**${title}**\n\n`);
        
        // Add content
        markdown.appendMarkdown(this.formatContent(content));
        
        // Add action buttons if provided
        if (actions && actions.length > 0) {
            markdown.appendMarkdown('\n\n---\n\n');
            actions.forEach((action, i) => {
                const command = `loco.hoverAction${i}`;
                markdown.appendMarkdown(`[${action.label}](command:${command}) `);
                
                // Register command temporarily
                const disposable = vscode.commands.registerCommand(command, () => {
                    action.callback();
                    disposable.dispose();
                });
            });
        }
        
        // Show hover at the end of selection
        const hoverPosition = selection.end;
        
        // Use decoration to force hover to appear
        this.showDecorationWithHover(editor, selection, markdown);
    }

    /**
     * Show decoration with hover content
     */
    private showDecorationWithHover(
        editor: vscode.TextEditor,
        range: vscode.Range,
        markdown: vscode.MarkdownString
    ) {
        // Clear previous decoration
        if (this.currentDecoration) {
            editor.setDecorations(this.currentDecoration, []);
            this.currentDecoration.dispose();
        }

        // Create decoration type with hover
        this.currentDecoration = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' 💡',
                color: new vscode.ThemeColor('editorInfo.foreground'),
                margin: '0 0 0 0.5em'
            },
            backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
            borderRadius: '3px'
        });

        // Create decoration with hover
        const decoration: vscode.DecorationOptions = {
            range: range,
            hoverMessage: markdown
        };

        editor.setDecorations(this.currentDecoration, [decoration]);

        // Auto-clear after 10 seconds
        setTimeout(() => {
            this.clear(editor);
        }, 10000);
    }

    /**
     * Format markdown content for better display
     */
    private formatContent(content: string): string {
        // Ensure code blocks are properly formatted
        content = content.replace(/``````/g, '$1\n');
        
        // Add spacing
        content = content.replace(/\n\n/g, '\n\n');
        
        return content;
    }

    clear(editor: vscode.TextEditor) {
        if (this.currentDecoration) {
            editor.setDecorations(this.currentDecoration, []);
            this.currentDecoration.dispose();
            this.currentDecoration = undefined;
        }
    }

    dispose() {
        if (this.currentDecoration) {
            this.currentDecoration.dispose();
        }
    }
}
