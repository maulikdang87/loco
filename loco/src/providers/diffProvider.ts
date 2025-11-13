import * as vscode from 'vscode';

export interface DiffEdit {
    range: vscode.Range;
    newText: string;
    oldText: string;
}

export class DiffProvider {
    private insertDecorationType: vscode.TextEditorDecorationType;
    private deleteDecorationType: vscode.TextEditorDecorationType;
    private currentEdits: DiffEdit[] = [];

    constructor() {
        // Create decoration for insertions (green)
        this.insertDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        // Create decoration for deletions (red with strikethrough)
        this.deleteDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
            textDecoration: 'line-through',
            opacity: '0.6',
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });
    }

    /**
     * Show inline diff decorations (green for additions, red for deletions)
     */
    showDiff(editor: vscode.TextEditor, edits: DiffEdit[]) {
        console.log('DiffProvider.showDiff called with edits:', edits);
        this.currentEdits = edits;

        const addedRanges: vscode.Range[] = [];
        const removedRanges: vscode.Range[] = [];

        edits.forEach(edit => {
            if (edit.newText && !edit.oldText) {
                // Addition only (e.g., inserting docstring)
                console.log('Addition detected at range:', edit.range);
                addedRanges.push(edit.range);
            } else if (edit.oldText && !edit.newText) {
                // Deletion only
                console.log('Deletion detected at range:', edit.range);
                removedRanges.push(edit.range);
            } else if (edit.newText !== edit.oldText) {
                // Modification (replacement)
                console.log('Modification detected at range:', edit.range);
                addedRanges.push(edit.range);
            }
        });

        console.log('Applying insert decorations to ranges:', addedRanges);
        console.log('Applying delete decorations to ranges:', removedRanges);

        // Apply green decoration for additions/modifications
        editor.setDecorations(this.insertDecorationType, addedRanges);

        // Apply red decoration for deletions
        editor.setDecorations(this.deleteDecorationType, removedRanges);

        // Focus the editor to make decorations visible
        vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
    }

    /**
     * Apply all pending edits
     */
    async applyEdits(editor: vscode.TextEditor): Promise<boolean> {
        const success = await editor.edit(editBuilder => {
            this.currentEdits.forEach(edit => {
                editBuilder.replace(edit.range, edit.newText);
            });
        });

        if (success) {
            this.clearDecorations(editor);
            this.currentEdits = [];
        }

        return success;
    }

    /**
     * Reject all pending edits
     */
    clearDecorations(editor: vscode.TextEditor) {
        console.log('Clearing decorations');
        editor.setDecorations(this.insertDecorationType, []);
        editor.setDecorations(this.deleteDecorationType, []);
        this.currentEdits = [];
    }

    dispose() {
        this.insertDecorationType.dispose();
        this.deleteDecorationType.dispose();
    }
}
