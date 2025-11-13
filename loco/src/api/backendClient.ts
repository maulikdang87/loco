import axios, { AxiosInstance, AxiosError } from 'axios';
import * as vscode from 'vscode';
import {
    CompletionRequest,
    CompletionResponse,
    ChatRequest,
    ChatResponse,
    BackendStatus
} from '../types';

export interface AgentRequest {
    query: string;
    code?: string;
    file?: string;
    context?: string;
    errors?: Array<{ message: string }>;
}

export interface AgentResponse {
    response: string;
    agent_used?: string;
    confidence: number;
    routing_reason?: string;
}

export class BackendClient {
    private client: AxiosInstance;
    private statusBar: vscode.StatusBarItem;
    private baseURL: string;

    constructor() {
        this.baseURL = this.getConfig('general.backendUrl');
        
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 60000,  // 60s for chat
            headers: { 'Content-Type': 'application/json' }
        });

        // Status bar indicator
        this.statusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBar.text = '$(loading~spin) Loco';
        this.statusBar.tooltip = 'Checking Loco backend...';
        this.statusBar.show();

        this.checkConnection();
    }

    private getConfig<T>(key: string): T {
        return vscode.workspace.getConfiguration('loco').get<T>(key) as T;
    }

    async checkConnection(): Promise<boolean> {
        try {
            const response = await this.client.get<BackendStatus>('/health');
            
            this.statusBar.text = '$(check) Loco';
            this.statusBar.tooltip = 'Loco: Connected';
            this.statusBar.backgroundColor = undefined;
            
            return response.data.status === 'ok';
        } catch (error) {
            this.statusBar.text = '$(error) Loco';
            this.statusBar.tooltip = 'Loco: Backend offline';
            this.statusBar.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.errorBackground'
            );
            return false;
        }
    }

    async complete(request: CompletionRequest): Promise<CompletionResponse | null> {
        const provider = this.getConfig<string>('providers.defaultProvider');
        
        // Get provider-specific model or fall back to general completions.model
        const model = this.getConfig<string>(`completions.model.${provider}`)
            || this.getConfig<string>('completions.model');

        try {
            const response = await this.client.post<CompletionResponse>(
                `/api/v1/complete/${provider}`,
                {
                    ...request,
                    model
                }
            );
            return response.data;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    async chat(request: ChatRequest): Promise<ChatResponse | null> {
        const provider = request.provider || this.getConfig<string>('providers.defaultProvider');
        
        // Get provider-specific model or fall back to general chat.model
        let model = request.model 
            || this.getConfig<string>(`chat.model.${provider}`)
            || this.getConfig<string>('chat.model');

        // If still no model, get default from backend
        if (!model) {
            model = await this.getDefaultModelForProvider(provider);
        }

        try {
            const response = await this.client.post<ChatResponse>(
                `/api/v1/chat/${provider}`,
                {
                    ...request,
                    model
                }
            );
            return response.data;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    /**
     * Process request through multi-agent system
     * Automatically routes to appropriate agent
     */
    async processWithAgent(request: AgentRequest): Promise<AgentResponse | null> {
        try {
            const response = await this.client.post<AgentResponse>(
                '/api/v1/agent/process',
                request
            );
            return response.data;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    /**
     * Debug code - analyze errors and suggest fixes
     */
    async debugCode(code: string, file: string, errors?: Array<{ message: string }>): Promise<AgentResponse | null> {
        try {
            const response = await this.client.post<AgentResponse>(
                '/api/v1/agent/debug',
                { code, file, errors }
            );
            return response.data;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    /**
     * Explain code in detail
     */
    async explainCode(code: string, file: string, context?: string): Promise<AgentResponse | null> {
        try {
            const response = await this.client.post<AgentResponse>(
                '/api/v1/agent/explain',
                { code, file, context }
            );
            return response.data;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    /**
     * Generate documentation/docstrings
     */
    async documentCode(code: string, file: string): Promise<AgentResponse | null> {
        try {
            const response = await this.client.post<AgentResponse>(
                '/api/v1/agent/document',
                { code, file }
            );
            return response.data;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    /**
     * Suggest refactorings
     */
    async refactorCode(code: string, file: string, context?: string): Promise<AgentResponse | null> {
        try {
            const response = await this.client.post<AgentResponse>(
                '/api/v1/agent/refactor',
                { code, file, context }
            );
            return response.data;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    private async getDefaultModelForProvider(provider: string): Promise<string> {
        try {
            const response = await this.client.get('/api/v1/providers');
            const models = response.data.models[provider];
            if (models && models.length > 0) {
                // Return the first model as default
                return models[0];
            }
        } catch (error) {
            console.error('Failed to fetch provider models:', error);
        }
        
        // Fallback defaults
        const fallbacks: Record<string, string> = {
            'ollama': 'qwen2.5-coder:7b',
            'groq': 'llama-3.3-70b-versatile',
            'gemini': 'gemini-1.5-flash',
            'openai': 'gpt-4o-mini'
        };
        return fallbacks[provider] || '';
    }

    private handleError(error: any) {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            
            console.error('Backend error:', {
                code: axiosError.code,
                status: axiosError.response?.status,
                message: axiosError.message,
                response: axiosError.response?.data
            });
            
            if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ENOTFOUND') {
                // Only show error for chat, not for completions (too noisy)
                const isChatRequest = axiosError.config?.url?.includes('/chat/');
                if (isChatRequest) {
                    vscode.window.showErrorMessage(
                        'Loco backend is not running. Start with: uvicorn src.main:app --reload',
                        'Show Command'
                    ).then(selection => {
                        if (selection === 'Show Command') {
                            const terminal = vscode.window.createTerminal('Loco Backend');
                            terminal.show();
                            terminal.sendText('cd backend && uvicorn src.main:app --reload');
                        }
                    });
                }
            } else if (axiosError.response?.status === 503) {
                vscode.window.showWarningMessage(
                    'Loco: Provider not available. Check API keys in backend/.env'
                );
            } else if (axiosError.response?.status === 500) {
                const responseData = axiosError.response?.data as any;
                const errorDetail = responseData?.detail || axiosError.message;
                console.error('Backend 500 error:', errorDetail);
            }
        } else {
            console.error('Unknown error:', error);
        }
    }

    dispose() {
        this.statusBar.dispose();
    }
}
