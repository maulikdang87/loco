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
        // Green for insertions
        this.insertDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });

        // Red for deletions
        this.deleteDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('diffEditor.removedTextBackground'),
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });
    }

    showDiff(editor: vscode.TextEditor, edits: DiffEdit[]) {
        this.currentEdits = edits;

        const ranges: vscode.Range[] = [];
        edits.forEach(edit => {
            ranges.push(edit.range);
        });

        // Apply green decoration
        editor.setDecorations(this.insertDecorationType, ranges);
        
        console.log('Diff decorations applied:', ranges.length);
    }

    async applyEdits(editor: vscode.TextEditor): Promise<boolean> {
        console.log('Applying edits:', this.currentEdits.length);
        
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

    clearDecorations(editor: vscode.TextEditor) {
        console.log('Clearing decorations');
        
        // Clear all decorations
        editor.setDecorations(this.insertDecorationType, []);
        editor.setDecorations(this.deleteDecorationType, []);
        
        // Clear edits
        this.currentEdits = [];
    }

    dispose() {
        this.insertDecorationType.dispose();
        this.deleteDecorationType.dispose();
    }
}
