/**
 * Core types for Loco extension
 */

// API Request/Response types
export interface CompletionRequest {
    prefix: string;
    suffix: string;
    language: string;
    filepath: string;
    cursor_line: number;
    cursor_column: number;
}

export interface CompletionResponse {
    completion: string;
    confidence: number;
    model_used: string;
    latency_ms: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    files?: FileReference[];  // For @ references
}

export interface FileReference {
    path: string;
    name: string;
    language: string;
    content?: string;  // Full content or snippet
    lineStart?: number;
    lineEnd?: number;
}

// Backend message format (simpler, no timestamp required)
export interface BackendChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatRequest {
    messages: BackendChatMessage[];
    files?: FileReference[];
    provider?: string;
    model?: string;
}

export interface ChatResponse {
    message: string;
    model_used: string;
    latency_ms: number;
}

export interface BackendStatus {
    status: string;
    available_providers: Record<string, boolean>;
}

