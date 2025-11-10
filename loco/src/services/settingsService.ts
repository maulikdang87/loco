import * as vscode from 'vscode';
import axios from 'axios';

export class SettingsService {
    private static _instance: SettingsService;
    private _statusBarItem: vscode.StatusBarItem;

    static getInstance(): SettingsService {
        if (!SettingsService._instance) {
            SettingsService._instance = new SettingsService();
        }
        return SettingsService._instance;
    }

    private constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this._statusBarItem.text = '$(gear) Loco Settings';
        this._statusBarItem.command = 'loco.openSettings';
        this._statusBarItem.tooltip = 'Open Loco Settings';
        this._statusBarItem.show();

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
        this.validateSettings();
    }

    async validateSettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration('loco');
        const backendUrl = config.get<string>('general.backendUrl');
        const enabled = config.get<boolean>('general.enabled');

        if (!enabled) {
            return;
        }

        try {
            const response = await axios.get(`${backendUrl}/api/v1/providers`, { timeout: 3000 });
            this._statusBarItem.text = '$(check) Loco';
            this._statusBarItem.tooltip = 'Loco: Connected';
            this._statusBarItem.backgroundColor = undefined;
        } catch (error) {
            this._statusBarItem.text = '$(error) Loco';
            this._statusBarItem.tooltip = 'Loco: Backend offline';
            this._statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.errorBackground'
            );
        }
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
        this._statusBarItem.dispose();
    }
}