import * as vscode from 'vscode';

export class InlinePopupProvider implements vscode.HoverProvider {
    private currentContent: vscode.MarkdownString | null = null;
    private currentRange: vscode.Range | null = null;


    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        if (this.currentContent && this.currentRange && this.currentRange.contains(position)) {
            return new vscode.Hover(this.currentContent, this.currentRange);
        }
        return null;
    }

    async showPopup(
        editor: vscode.TextEditor,
        range: vscode.Range,
        title: string,
        content: string,
        actions?: Array<{ label: string; command: string }>
    ) {
        const markdown = new vscode.MarkdownString('', true);
        markdown.isTrusted = true;
        markdown.supportThemeIcons = true;

        // Title
        let mdContent = `**${title}**\n\n`;
        
        // Content
        mdContent += `${content}\n\n`;

        // Actions
        if (actions && actions.length > 0) {
            mdContent += '---\n\n';
            
            const buttons = actions.map(action => {
                const icon = this.getIcon(action.label);
                const isPrimary = action.label.toLowerCase().includes('accept') || 
                                action.label.toLowerCase().includes('apply');
                
                // Format: [$(icon) Label](command:commandId)
                const button = `[$(${icon}) ${action.label}](command:${action.command})`;
                
                return isPrimary ? `**${button}**` : button;
            }).join('  •  ');
            
            mdContent += buttons;
        }

        markdown.value = mdContent;

        // Store and display
        this.currentContent = markdown;
        this.currentRange = range;

        // Move cursor to trigger hover
        editor.selection = new vscode.Selection(range.start, range.start);

        // Show hover
        await vscode.commands.executeCommand('editor.action.showHover');

        // Auto-clear
        setTimeout(() => this.clear(), 15000);
    }

    private getIcon(label: string): string {
        const lower = label.toLowerCase();
        if (lower.includes('accept') || lower.includes('apply')) {
            return 'check';
        }
        if (lower.includes('reject') || lower.includes('cancel')) {
            return 'close';
        }
        if (lower.includes('copy')) {
            return 'clippy';
        }
        if (lower.includes('insert')) {
            return 'add';
        }
        return 'gear';
    }

    clear() {
        this.currentContent = null;
        this.currentRange = null;
    }

    dispose() {
        this.clear();
    }
}
