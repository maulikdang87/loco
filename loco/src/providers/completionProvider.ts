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
        
        // Check if enabled
        const config = vscode.workspace.getConfiguration('loco');
        if (!config.get<boolean>('enabled') || 
            !config.get<boolean>('inlineCompletions')) {
            return null;
        }

        // Debounce: prevent too frequent requests
        const now = Date.now();
        const delay = config.get<number>('completionDelay') || 250;
        
        if (now - this.lastTriggerTime < delay) {
            return null;
        }

        // Don't trigger in comments or strings (simple heuristic)
        const line = document.lineAt(position.line).text;
        const beforeCursor = line.substring(0, position.character);
        if (this.isInCommentOrString(beforeCursor, document.languageId)) {
            return null;
        }

        // Extract context
        const prefix = this.getPrefix(document, position);
        const suffix = this.getSuffix(document, position);

        // Check cache
        const cacheKey = this.getCacheKey(prefix, suffix, document.languageId);
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)!;
            return [new vscode.InlineCompletionItem(cached)];
        }

        // Abort previous request if still pending
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

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
        this.lastTriggerTime = now;
        
        try {
            const response = await this.backend.complete(request);

            if (!response || token.isCancellationRequested) {
                return null;
            }

            // Get current line for indentation context
            const currentLine = document.lineAt(position.line).text;
            
            // Clean with indentation awareness
            const cleaned = this.cleanCompletion(
                response.completion, 
                currentLine,
                position
            );
            
            if (!cleaned || cleaned.length === 0) {
                return null;
            }

            // Cache and return
            this.cache.set(cacheKey, cleaned);
            this.trimCache();

            return [
                new vscode.InlineCompletionItem(
                    cleaned,
                    new vscode.Range(position, position)
                )
            ];
        } catch (error) {
            console.error('Completion error:', error);
            // Don't show error message for every completion failure (too noisy)
            // Errors are already handled by BackendClient
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
        // Remove markdown code fences
        completion = completion.replace(/```\w*\n?/g, '');  // Remove opening fences with optional language
        completion = completion.replace(/```/g, '');        // Remove closing fences
        
        // Remove explanatory text
        completion = completion.replace(/^(Here's|Here is|The completion is|Complete with).*?:\s*/i, '');
        
        // Get current line's indentation
        const indentMatch = line.match(/^(\s*)/);
        const currentIndent = indentMatch ? indentMatch[1] : '';
        
        // If completion doesn't start with whitespace, apply current indent
        const lines = completion.split('\n');
        if (lines.length > 0 && !lines[0].match(/^\s/)) {
            // Check if we're after a colon or opening brace
            const beforeCursor = line.substring(0, position.character);
            const needsExtraIndent = beforeCursor.trim().endsWith(':') || 
                                    beforeCursor.trim().endsWith('{');
            
            const baseIndent = needsExtraIndent 
                ? currentIndent + '    '  // Add 4 spaces
                : currentIndent;
            
            // Apply indentation to all lines
            const indentedLines = lines.map((l, i) => {
                if (l.trim() === '') {
                    return '';  // Preserve empty lines
                }
                if (i === 0) {
                    return baseIndent + l.trimStart();
                }
                
                // Maintain relative indentation for subsequent lines
                const relativeIndent = l.match(/^(\s*)/)?.[1] || '';
                return baseIndent + relativeIndent + l.trimStart();
            });
            
            completion = indentedLines.join('\n');
        }
        
        // Remove duplicate of what's already typed
        const trimmedBefore = line.substring(0, position.character).trimEnd();
        const lastWord = trimmedBefore.split(/\s+/).pop() || '';
        
        if (completion.startsWith(lastWord)) {
            completion = completion.substring(lastWord.length);
        }
        
        return completion.trimEnd();
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