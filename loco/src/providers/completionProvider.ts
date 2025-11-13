import * as vscode from 'vscode';
import { BackendClient } from '../api/backendClient';
import { CompletionRequest } from '../types';

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private backend: BackendClient;
    private cache = new Map<string, string>();
    private lastTriggerTime = 0;
    private lastRequestTime = 0;
    private debounceTimer?: NodeJS.Timeout;
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
        
        const config = vscode.workspace.getConfiguration('loco');
        if (!config.get<boolean>('general.enabled') || !config.get<boolean>('completions.enabled')) {
            return null;
        }

        // FIX: Proper debouncing - only trigger after user stops typing
        const now = Date.now();
        const delay = config.get<number>('completions.delay') || 500;  // Increased to 500ms
        
        // Cancel if still typing
        if (now - this.lastTriggerTime < delay) {
            return null;
        }

        // Don't trigger too frequently
        if (now - this.lastRequestTime < 2000) {  // At least 2 seconds between requests
            return null;
        }

        // Only trigger on significant triggers (not every character)
        const line = document.lineAt(position.line).text;
        const beforeCursor = line.substring(0, position.character);
        
        // Only trigger after: newline, dot, opening paren/bracket, or significant word
        const significantTriggers = /[.\(\[\{]\s*$|^\s*$|^(if|for|while|def|function|class)\s/;
        if (!significantTriggers.test(beforeCursor) && context.triggerKind !== vscode.InlineCompletionTriggerKind.Automatic) {
            return null;
        }

        this.lastTriggerTime = now;

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
            this.lastRequestTime = now;
            const response = await this.backend.complete(request);

            if (!response || token.isCancellationRequested) {
                return null;
            }

            // Clean with indentation awareness - pass document for proper formatting
            const cleaned = this.cleanCompletion(response.completion, document, position);

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
        } catch (error: any) {
            // Handle rate limit errors gracefully
            if (error?.status === 429 || error?.response?.status === 429) {
                console.warn('Rate limit reached, skipping completion');
                return null;
            }
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

    private cleanCompletion(completion: string, document: vscode.TextDocument, position: vscode.Position): string {
        // Remove markdown
        completion = completion.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
        
        // Get the line where cursor is
        const currentLine = document.lineAt(position.line).text;
        const beforeCursor = currentLine.substring(0, position.character);
        
        // Calculate base indentation (indent of current line)
        const baseIndent = beforeCursor.match(/^(\s*)/)?.[1] || '';
        
        // Check if we're after a trigger that increases indent (: { ( [)
        const needsExtraIndent = /[:{\(\[]$/.test(beforeCursor.trim());
        
        // Get tab settings from workspace configuration
        const editorConfig = vscode.workspace.getConfiguration('editor', document.uri);
        const useSpaces = editorConfig.get<boolean>('insertSpaces') !== false;
        const tabSize = editorConfig.get<number>('tabSize') || 4;
        const indentUnit = useSpaces ? ' '.repeat(tabSize) : '\t';
        
        // Calculate final base indent
        const finalBaseIndent = needsExtraIndent ? baseIndent + indentUnit : baseIndent;
        
        // Split completion into lines
        const lines = completion.split('\n');
        
        // Apply base indent to first line only
        const result = lines.map((line, i) => {
            if (i === 0) {
                // First line: just add base indent if it doesn't have any
                return line.startsWith(' ') || line.startsWith('\t') ? line : finalBaseIndent + line.trim();
            } else {
                // Subsequent lines: preserve as-is (LLM should handle relative indent)
                return line;
            }
        }).join('\n');
        
        return result;
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