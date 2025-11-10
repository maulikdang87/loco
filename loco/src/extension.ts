    // Command: Pick Inline Completion Model
    const pickInlineModelCommand = vscode.commands.registerCommand('loco.pickInlineModel', async () => {
        const { models } = await settingsService.fetchAvailableModels();
        const provider = vscode.workspace.getConfiguration('loco').get<string>('providers.defaultProvider');
        if (!provider) {
            vscode.window.showWarningMessage('No provider selected. Please configure a default provider in settings.');
            return;
        }
        const modelList = models[provider] || [];
        if (!modelList.length) {
            vscode.window.showWarningMessage('No models available for the selected provider.');
            return;
        }
        const picked = await vscode.window.showQuickPick(modelList, {
            placeHolder: 'Select model for inline completions',
        });
        if (picked) {
            await vscode.workspace.getConfiguration('loco').update(`completions.model.${provider}`, picked, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Inline completion model set to: ${picked}`);
        }
    });

    // Command: Pick Chat Model
    const pickChatModelCommand = vscode.commands.registerCommand('loco.pickChatModel', async () => {
        const { models } = await settingsService.fetchAvailableModels();
        const provider = vscode.workspace.getConfiguration('loco').get<string>('providers.defaultProvider');
        if (!provider) {
            vscode.window.showWarningMessage('No provider selected. Please configure a default provider in settings.');
            return;
        }
        const modelList = models[provider] || [];
        if (!modelList.length) {
            vscode.window.showWarningMessage('No models available for the selected provider.');
            return;
        }
        const picked = await vscode.window.showQuickPick(modelList, {
            placeHolder: 'Select model for chat',
        });
        if (picked) {
            await vscode.workspace.getConfiguration('loco').update(`chat.model.${provider}`, picked, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Chat model set to: ${picked}`);
        }
    });
import * as vscode from 'vscode';
import { BackendClient } from './api/backendClient';
import { InlineCompletionProvider } from './providers/completionProvider';
import { ChatPanel } from './chat/chatPanel';
import { SettingsService } from './services/settingsService';

let backend: BackendClient;
let completionProvider: InlineCompletionProvider;
let chatPanel: ChatPanel;
let settingsService: SettingsService;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Loco AI Assistant activating...');

    // Initialize services
    settingsService = SettingsService.getInstance();
    backend = new BackendClient();

    // Initialize inline completion provider
    completionProvider = new InlineCompletionProvider(backend);

    // Ensure inline completions are enabled in the configuration
    const config = vscode.workspace.getConfiguration('loco');
    const inlineCompletionsEnabled = config.get<boolean>('completions.enabled', true);

    if (!inlineCompletionsEnabled) {
        vscode.window.showWarningMessage('Inline completions are disabled in settings. Enable them to use this feature.');
    } else {
        console.log('Inline completions are enabled.');
    }

    // Debug log to confirm provider registration
    console.log('Registering inline completion provider...');
    const completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        completionProvider
    );

    // Initialize chat panel
    chatPanel = new ChatPanel(context.extensionUri, backend);
    
    // Register webview view provider (for sidebar view)
    const chatViewDisposable = vscode.window.registerWebviewViewProvider(
        ChatPanel.viewType,
        chatPanel,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );

    // Create a panel-based chat that opens on the right side
    let chatPanelInstance: vscode.WebviewPanel | undefined;

    // Register commands
    const openChatCommand = vscode.commands.registerCommand(
        'loco.openChat',
        async () => {
            // Create or reveal webview panel on the right side
            if (chatPanelInstance) {
                chatPanelInstance.reveal(vscode.ViewColumn.Beside);
            } else {
                chatPanelInstance = vscode.window.createWebviewPanel(
                    'locoChat',
                    'Loco Chat',
                    { 
                        viewColumn: vscode.ViewColumn.Beside, // Opens beside current editor (right side)
                        preserveFocus: false 
                    },
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [context.extensionUri]
                    }
                );

                // Set the HTML content using ChatPanel's method
                const htmlContent = chatPanel.getHtmlContentForPanel(chatPanelInstance.webview);
                chatPanelInstance.webview.html = htmlContent;

                // Handle messages from webview
                chatPanelInstance.webview.onDidReceiveMessage(async (data) => {
                    await chatPanel.handleWebviewMessage(data, chatPanelInstance!.webview);
                });

                // Handle panel disposal
                chatPanelInstance.onDidDispose(() => {
                    chatPanel.unregisterPanel(chatPanelInstance!.webview);
                    chatPanelInstance = undefined;
                });
            }
        }
    );

    const toggleCompletionsCommand = vscode.commands.registerCommand(
        'loco.toggleInlineCompletions',
        async () => {
            const config = vscode.workspace.getConfiguration('loco');
            const current = config.get<boolean>('completions.enabled');
            await config.update('completions.enabled', !current, vscode.ConfigurationTarget.Global);
            
            vscode.window.showInformationMessage(
                `Inline completions ${!current ? 'enabled ✓' : 'disabled ✗'}`
            );
        }
    );

    const clearCacheCommand = vscode.commands.registerCommand(
        'loco.clearCache',
        () => {
            completionProvider.clearCache();
            vscode.window.showInformationMessage('✓ Cache cleared');
        }
    );

    const addFileCommand = vscode.commands.registerCommand(
        'loco.addFileReference',
        () => {
            vscode.window.showInformationMessage(
                'Open chat and click "📎 Add File" to add current file'
            );
        }
    );

    const openSettingsCommand = vscode.commands.registerCommand(
        'loco.openSettings',
        () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'loco');
        }
    );

    const showModelsCommand = vscode.commands.registerCommand(
        'loco.showAvailableModels',
        () => {
            settingsService.showModelInfo();
        }
    );



    // Add all to subscriptions
    context.subscriptions.push(
        completionDisposable,
        chatViewDisposable,
        openChatCommand,
        toggleCompletionsCommand,
        clearCacheCommand,
        addFileCommand,
        openSettingsCommand,
        showModelsCommand,
        pickInlineModelCommand,
        pickChatModelCommand,
        backend,
        settingsService
    );

    console.log('✅ Loco AI Assistant activated successfully');
    
    // Show welcome message
    vscode.window.showInformationMessage(
        '✨ Loco is ready! Press Cmd+Shift+L to open chat',
        'Open Chat'
    ).then(selection => {
        if (selection === 'Open Chat') {
            vscode.commands.executeCommand('loco.openChat');
        }
    });
    
    // Debug log to confirm activation
    console.log('Activating InlineCompletionProvider...');

    // Ensure the backend client is initialized
    if (!backend) {
        console.error('Backend client is not initialized. Inline completions will not work.');
    } else {
        console.log('Backend client initialized successfully.');
    }

    // Debug log to confirm configuration settings
    console.log('Loco configuration:', config);

    // Check if inline completions are enabled
    if (!inlineCompletionsEnabled) {
        console.warn('Inline completions are disabled in the configuration.');
    } else {
        console.log('Inline completions are enabled in the configuration.');
    }
}

export function deactivate() {
    console.log('👋 Loco deactivated');
}
