import * as vscode from 'vscode';
import axios from 'axios';

export class SettingsService {
    private static _instance: SettingsService;

    static getInstance(): SettingsService {
        if (!SettingsService._instance) {
            SettingsService._instance = new SettingsService();
        }
        return SettingsService._instance;
    }

    private constructor() {
        // Watch for settings changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('loco')) {
                this.onSettingsChanged();
            }
        });
    }

    private onSettingsChanged() {
        // React to settings changes
        console.log('Loco settings changed');
    }

    async validateSettings(): Promise<void> {
        // Settings validation - backendManager handles status display
        const config = vscode.workspace.getConfiguration('loco');
        const enabled = config.get<boolean>('general.enabled');

        if (!enabled) {
            return;
        }
    }

    getApiKey(provider: 'groq' | 'gemini' | 'openai'): string | undefined {
        const config = vscode.workspace.getConfiguration('loco');
        const apiKey = config.get<string>(`apiKeys.${provider}`, '');
        return apiKey || undefined;
    }

    async setApiKey(provider: 'groq' | 'gemini' | 'openai', apiKey: string): Promise<void> {
        await vscode.workspace.getConfiguration('loco').update(
            `apiKeys.${provider}`, 
            apiKey, 
            vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`${provider.toUpperCase()} API key updated successfully!`);
    }

    getModelForProvider(provider: string, context: 'chat' | 'completions'): string | undefined {
        const config = vscode.workspace.getConfiguration('loco');
        
        // First check if there's a general model set for this context
        const generalModel = config.get<string>(`${context}.model`, '');
        if (generalModel) {
            return generalModel;
        }
        
        // Fall back to provider-specific model
        return config.get<string>(`${context}.model.${provider}`, '');
    }

    async fetchAvailableModels(): Promise<{ providers: string[], models: Record<string, string[]> }> {
        const config = vscode.workspace.getConfiguration('loco');
        const backendUrl = config.get<string>('general.backendUrl', 'http://localhost:8000');

        try {
            const response = await axios.get(`${backendUrl}/api/v1/providers`, { timeout: 5000 });
            const data = response.data;
            
            const providers = Object.keys(data.available_providers || {}).filter(
                provider => data.available_providers[provider] === true
            );
            
            return {
                providers,
                models: data.models || {}
            };
        } catch (error) {
            console.error('Failed to fetch available models:', error);
            return {
                providers: [],
                models: {}
            };
        }
    }

    showModelInfo() {
        this.fetchAvailableModels().then(({ providers, models }) => {
            const items: vscode.QuickPickItem[] = [];
            
            providers.forEach(provider => {
                const providerModels = models[provider] || [];
                providerModels.forEach(model => {
                    items.push({
                        label: model,
                        description: `${provider}`,
                        detail: `Available model from ${provider}`
                    });
                });
            });

            if (items.length === 0) {
                vscode.window.showInformationMessage('No models available. Check your backend connection.');
                return;
            }

            vscode.window.showQuickPick(items, {
                placeHolder: 'Available models from your backend',
                title: 'Loco Available Models'
            }).then(selected => {
                if (selected) {
                    vscode.window.showInformationMessage(
                        `Selected: ${selected.label} from ${selected.description}`,
                        'Use for Chat',
                        'Use for Completions'
                    ).then(action => {
                        if (action === 'Use for Chat') {
                            vscode.workspace.getConfiguration('loco').update(
                                'chat.model', 
                                selected.label, 
                                vscode.ConfigurationTarget.Global
                            );
                        } else if (action === 'Use for Completions') {
                            vscode.workspace.getConfiguration('loco').update(
                                'completions.model', 
                                selected.label, 
                                vscode.ConfigurationTarget.Global
                            );
                        }
                    });
                }
            });
        });
    }

    dispose() {
        // Cleanup if needed
    }
}