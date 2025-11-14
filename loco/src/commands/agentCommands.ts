import * as vscode from 'vscode';
import { BackendClient } from '../api/backendClient';
import { InlinePopupProvider } from '../providers/inlinePopupProvider';
import { DiffProvider, DiffEdit } from '../providers/diffProvider';

export class AgentCommands {
    private backend: BackendClient;
    private popupProvider: InlinePopupProvider;
    private diffProvider: DiffProvider;

    constructor(backend: BackendClient, popupProvider: InlinePopupProvider) {
        this.backend = backend;
        this.popupProvider = popupProvider;
        this.diffProvider = new DiffProvider();
    }

    /**
     * Explain code with inline popup
     */
    async explainCode() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Select code to explain');
            return;
        }

        const selection = editor.selection;
        const code = editor.document.getText(selection);

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Loco: Explaining code...',
            cancellable: false
        }, async () => {
            return await this.backend.explainCode(code, editor.document.fileName);
        });

        if (result && result.response) {
            const copyCmd = this.registerTempCommand('loco.copyExplanation', () => {
                vscode.env.clipboard.writeText(result.response);
                vscode.window.showInformationMessage('✓ Copied to clipboard');
            });

            await this.popupProvider.showPopup(
                editor,
                selection,
                '💡 Explanation',
                result.response,
                [{ label: 'Copy', command: 'loco.copyExplanation' }]
            );

            setTimeout(() => copyCmd.dispose(), 15000);
        } else {
            vscode.window.showErrorMessage('Failed to explain code. Check backend.');
        }
    }

    /**
     * Debug code with inline popup and diff
     */
    async debugCode() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Select code to debug');
            return;
        }

        const selection = editor.selection;
        const code = editor.document.getText(selection);

        // Get diagnostics
        const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
        const errors = diagnostics
            .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
            .map(d => ({ message: d.message }));

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Loco: Debugging...',
            cancellable: false
        }, async () => {
            return await this.backend.debugCode(code, editor.document.fileName, errors);
        });

        if (result && result.response) {
            const fixedCode = this.extractCodeFromMarkdown(result.response);
            
            if (fixedCode && fixedCode !== code) {
                // Show diff
                const edit: DiffEdit = {
                    range: selection,
                    newText: fixedCode,
                    oldText: code
                };

                this.diffProvider.showDiff(editor, [edit]);

                // Register BOTH commands with proper cleanup
                const acceptDisposable = vscode.commands.registerCommand('loco.acceptFix', async () => {
                    console.log('Accept button clicked');
                    await this.diffProvider.applyEdits(editor);
                    this.popupProvider.clear();
                    vscode.window.showInformationMessage('✓ Fix applied');
                    
                    // Cleanup
                    acceptDisposable.dispose();
                    rejectDisposable.dispose();
                });

                const rejectDisposable = vscode.commands.registerCommand('loco.rejectFix', () => {
                    console.log('Reject button clicked');
                    this.diffProvider.clearDecorations(editor);
                    this.popupProvider.clear();
                    vscode.window.showInformationMessage('Changes rejected');
                    
                    // Cleanup
                    acceptDisposable.dispose();
                    rejectDisposable.dispose();
                });

                // Show popup
                await this.popupProvider.showPopup(
                    editor,
                    selection,
                    '🐛 Debug Fix',
                    result.response,
                    [
                        { label: 'Accept', command: 'loco.acceptFix' },
                        { label: 'Reject', command: 'loco.rejectFix' }
                    ]
                );

                // Auto-cleanup after 15 seconds
                setTimeout(() => {
                    acceptDisposable.dispose();
                    rejectDisposable.dispose();
                }, 15000);
            } else {
                // No code fix, just show analysis
                await this.popupProvider.showPopup(
                    editor,
                    selection,
                    '🐛 Debug Analysis',
                    result.response
                );
            }
        } else {
            vscode.window.showErrorMessage('Failed to debug code. Check backend.');
        }
    }

    /**
     * Generate documentation
     */
    async documentCode() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Select code to document');
            return;
        }

        const selection = editor.selection;
        const code = editor.document.getText(selection);

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Loco: Generating documentation...',
            cancellable: false
        }, async () => {
            return await this.backend.documentCode(code, editor.document.fileName);
        });

        if (result && result.response) {
            // Extract ONLY the docstring (not the whole function)
            const docstring = this.extractDocstring(result.response, editor.document.languageId);
            
            if (docstring) {
                const insertLine = selection.start.line;
                const insertPos = new vscode.Position(insertLine, 0);
                
                const firstLine = editor.document.lineAt(insertLine);
                const indent = firstLine.text.match(/^\s*/)?.[0] || '';
                
                // Indent the docstring
                const indentedDocstring = docstring.split('\n')
                    .map(line => indent + line)
                    .join('\n');
                
                const edit: DiffEdit = {
                    range: new vscode.Range(insertPos, insertPos),
                    newText: indentedDocstring + '\n',
                    oldText: ''
                };

                this.diffProvider.showDiff(editor, [edit]);

                const insertCmd = this.registerTempCommand('loco.insertDoc', async () => {
                    await this.diffProvider.applyEdits(editor);
                    this.popupProvider.clear();
                    vscode.window.showInformationMessage('✓ Documentation inserted');
                });

                const cancelCmd = this.registerTempCommand('loco.cancelDoc', () => {
                    this.diffProvider.clearDecorations(editor);
                    this.popupProvider.clear();
                });

                await this.popupProvider.showPopup(
                    editor,
                    selection,
                    '📝 Documentation',
                    result.response,
                    [
                        { label: 'Insert', command: 'loco.insertDoc' },
                        { label: 'Cancel', command: 'loco.cancelDoc' }
                    ]
                );

                setTimeout(() => {
                    insertCmd.dispose();
                    cancelCmd.dispose();
                }, 15000);
            } else {
                await this.popupProvider.showPopup(
                    editor,
                    selection,
                    '📝 Documentation',
                    result.response
                );
            }
        } else {
            vscode.window.showErrorMessage('Failed to generate documentation.');
        }
    }

    /**
     * Refactor code
     */
    async refactorCode() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Select code to refactor');
            return;
        }

        const selection = editor.selection;
        const code = editor.document.getText(selection);

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Loco: Refactoring...',
            cancellable: false
        }, async () => {
            return await this.backend.refactorCode(code, editor.document.fileName);
        });

        if (result && result.response) {
            const refactoredCode = this.extractCodeFromMarkdown(result.response);
            
            if (refactoredCode && refactoredCode !== code) {
                const edit: DiffEdit = {
                    range: selection,
                    newText: refactoredCode,
                    oldText: code
                };

                this.diffProvider.showDiff(editor, [edit]);

                const applyCmd = this.registerTempCommand('loco.applyRefactor', async () => {
                    await this.diffProvider.applyEdits(editor);
                    this.popupProvider.clear();
                    vscode.window.showInformationMessage('✓ Refactoring applied');
                });

                const rejectCmd = this.registerTempCommand('loco.rejectRefactor', () => {
                    this.diffProvider.clearDecorations(editor);
                    this.popupProvider.clear();
                });

                await this.popupProvider.showPopup(
                    editor,
                    selection,
                    '♻️ Refactoring',
                    result.response,
                    [
                        { label: 'Apply', command: 'loco.applyRefactor' },
                        { label: 'Reject', command: 'loco.rejectRefactor' }
                    ]
                );

                setTimeout(() => {
                    applyCmd.dispose();
                    rejectCmd.dispose();
                }, 15000);
            }
        }
    }

    private registerTempCommand(command: string, callback: () => void): vscode.Disposable {
        return vscode.commands.registerCommand(command, callback);
    }

    private extractCodeFromMarkdown(markdown: string): string | null {
        const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/g;
        const matches = [...markdown.matchAll(codeBlockRegex)];
        return matches.length > 0 ? matches[0][1].trim() : null;
    }

    /**
     * Extract ONLY the docstring from response (not the full function)
     */
    private extractDocstring(markdown: string, languageId: string): string | null {
        // First, try to find code blocks
        const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/g;
        const matches = [...markdown.matchAll(codeBlockRegex)];
        
        if (matches.length === 0) {
            return null;
        }

        const code = matches[0][1].trim();

        // Extract based on language
        if (languageId === 'python') {
            // Python: Extract triple-quoted docstring
            const docstringMatch = code.match(/"""([\s\S]*?)"""/);
            if (docstringMatch) {
                return '"""' + docstringMatch[1] + '"""';
            }
            
            // Try single quotes
            const singleQuoteMatch = code.match(/'''([\s\S]*?)'''/);
            if (singleQuoteMatch) {
                return "'''" + singleQuoteMatch[1] + "'''";
            }
        } else if (['javascript', 'typescript', 'java', 'c', 'cpp'].includes(languageId)) {
            // JavaScript/TypeScript/Java: Extract /** ... */ JSDoc
            const jsdocMatch = code.match(/\/\*\*([\s\S]*?)\*\//);
            if (jsdocMatch) {
                return '/**' + jsdocMatch[1] + '*/';
            }
        }

        // Fallback: if entire code block looks like a docstring, return it
        if (code.startsWith('"""') || code.startsWith('/**') || code.startsWith("'''")) {
            return code;
        }

        return null;
    }

    dispose() {
        this.popupProvider.dispose();
        this.diffProvider.dispose();
    }
}
