import * as vscode from 'vscode';
import { BackendClient } from '../api/backendClient';
import { CompletionRequest } from '../types';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private backend: BackendClient;
    private cache = new Map<string, string>();
    private lastTriggerTime = 0;
    private abortController?: AbortController;

    constructor(backend: BackendClient) {
        this.backend = backend;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | null> {
        // Ensure proper indentation and spaces are sent to the LLM
        const prefix = this.getPrefix(document, position);
        const suffix = this.getSuffix(document, position);

        // Build request
        const request: CompletionRequest = {
            prefix,
            suffix,
            language: document.languageId,
            filepath: document.fileName,
            cursor_line: position.line,
            cursor_column: position.character
        };

        // Call backend
        try {
            const response = await this.backend.complete(request);

            if (!response || token.isCancellationRequested) {
                return null;
            }

            // Clean and format the response
            const cleaned = this.cleanCompletion(response.completion, document.lineAt(position.line).text, position);

            if (!cleaned || cleaned.length === 0) {
                return null;
            }

            // Return the inline completion item
            return [
                new vscode.InlineCompletionItem(
                    cleaned,
                    new vscode.Range(position, position)
                )
            ];
        } catch (error) {
            console.error('Completion error:', error);
            return null;
        }
    }

    private getPrefix(doc: vscode.TextDocument, pos: vscode.Position): string {
        // Get 30 lines before cursor for context
        const startLine = Math.max(0, pos.line - 30);
        const range = new vscode.Range(new vscode.Position(startLine, 0), pos);
        return doc.getText(range);
    }

    private getSuffix(doc: vscode.TextDocument, pos: vscode.Position): string {
        // Get 10 lines after cursor
        const endLine = Math.min(doc.lineCount - 1, pos.line + 10);
        const range = new vscode.Range(pos, new vscode.Position(endLine, 999));
        return doc.getText(range);
    }

    private getCacheKey(prefix: string, suffix: string, lang: string): string {
        // Use last 200 chars of prefix for cache key
        const shortPrefix = prefix.slice(-200);
        return `${lang}:${shortPrefix}:${suffix.slice(0, 100)}`;
    }

    private cleanCompletion(completion: string, line: string, position: vscode.Position): string {
        // Ensure proper indentation
        const indentMatch = line.match(/^\s*/);
        const currentIndent = indentMatch ? indentMatch[0] : '';

        const lines = completion.split('\n');
        const indentedLines = lines.map((l, i) => {
            if (i === 0) {
                return currentIndent + l.trimStart();
            }
            return currentIndent + l;
        });

        return indentedLines.join('\n');
    }

    private isInCommentOrString(text: string, lang: string): boolean {
        // Simple heuristic - check if line starts with comment
        const trimmed = text.trimStart();
        
        if (lang === 'python' && trimmed.startsWith('#')) {
            return true;
        }
        if (['javascript', 'typescript', 'java', 'c', 'cpp'].includes(lang)) {
            if (trimmed.startsWith('//')) {
                return true;
            }
        }
        
        return false;
    }

    private trimCache() {
        // Keep cache under 100 entries
        if (this.cache.size > 100) {
            const keysToDelete = Array.from(this.cache.keys()).slice(0, 20);
            keysToDelete.forEach(key => this.cache.delete(key));
        }
    }

    clearCache() {
        this.cache.clear();
    }
}