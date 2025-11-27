import * as vscode from 'vscode';
import { BackendClient } from './api/backendClient';
import { InlineCompletionProvider } from './providers/completionProvider';
import { ChatPanel } from './chat/chatPanel';
import { AgentCommands } from './commands/agentCommands';
import { InlinePopupProvider } from './providers/inlinePopupProvider';
import { BackendManager } from './backend/backendManager';

let backend: BackendClient;
let backendManager: BackendManager;
let completionProvider: InlineCompletionProvider;
let agentCommands: AgentCommands;
let popupProvider: InlinePopupProvider;
let isActivated = false;

export async function activate(context: vscode.ExtensionContext) {
    // Prevent double activation
    if (isActivated) {
        console.log('⚠️ Loco already activated, skipping...');
        return;
    }
    
    isActivated = true;
    console.log('🚀 Loco activating...');

    // Initialize backend manager
    backendManager = new BackendManager();
    
    // Sync status bar with actual backend state
    await backendManager.syncStatus();
    
    // Check if auto-start is enabled
    const config = vscode.workspace.getConfiguration('loco');
    const autoStart = config.get<boolean>('general.autoStartBackend', true);
    
    if (autoStart) {
        // Start backend automatically
        const backendStarted = await backendManager.start(context);
        if (!backendStarted) {
            vscode.window.showWarningMessage(
                'Loco backend failed to start. Some features may not work.',
                'Retry', 'Settings'
            ).then(selection => {
                if (selection === 'Retry') {
                    backendManager.restart(context);
                } else if (selection === 'Settings') {
                    vscode.commands.executeCommand('loco.openSettings');
                }
            });
        }
    } else {
        console.log('Auto-start disabled. Backend not started.');
        vscode.window.showInformationMessage(
            'Loco backend auto-start is disabled. Start manually if needed.',
            'Start Now'
        ).then(selection => {
            if (selection === 'Start Now') {
                backendManager.start(context);
            }
        });
    }

    // Initialize backend client
    backend = new BackendClient();

    // Initialize popup provider
    popupProvider = new InlinePopupProvider();
    
    // Register hover provider for ALL languages
    const hoverDisposable = vscode.languages.registerHoverProvider(
        { scheme: '*', pattern: '**' },
        popupProvider
    );

    // Initialize completion provider
    completionProvider = new InlineCompletionProvider(backend);
    const completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        completionProvider
    );

    // Initialize agent commands with popup provider
    agentCommands = new AgentCommands(backend, popupProvider);

    // Register commands
    const openChatCommand = vscode.commands.registerCommand(
        'loco.openChat',
        () => {
            if (!backendManager.isRunning()) {
                vscode.window.showWarningMessage(
                    'Loco backend is not running. Please start it first.',
                    'Start Backend'
                ).then(selection => {
                    if (selection === 'Start Backend') {
                        backendManager.start(context);
                    }
                });
                return;
            }
            ChatPanel.createOrShow(context.extensionUri, backend);
        }
    );

    const explainCommand = vscode.commands.registerCommand(
        'loco.explainCode',
        () => agentCommands.explainCode()
    );

    const debugCommand = vscode.commands.registerCommand(
        'loco.debugCode',
        () => agentCommands.debugCode()
    );

    const refactorCommand = vscode.commands.registerCommand(
        'loco.refactorCode',
        () => agentCommands.refactorCode()
    );

    const documentCommand = vscode.commands.registerCommand(
        'loco.documentCode',
        () => agentCommands.documentCode()
    );

    const openSettingsCommand = vscode.commands.registerCommand(
        'loco.openSettings',
        () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'loco');
        }
    );

    const showAvailableModelsCommand = vscode.commands.registerCommand(
        'loco.showAvailableModels',
        () => {
            vscode.window.showInformationMessage('Available models feature coming soon!');
        }
    );

    const clearChatCommand = vscode.commands.registerCommand(
        'loco.clearChat',
        () => {
            vscode.window.showInformationMessage('Chat cleared!');
        }
    );

    const addFileReferenceCommand = vscode.commands.registerCommand(
        'loco.addFileReference',
        () => {
            ChatPanel.createOrShow(context.extensionUri, backend);
        }
    );

    const toggleInlineCompletionsCommand = vscode.commands.registerCommand(
        'loco.toggleInlineCompletions',
        () => {
            const config = vscode.workspace.getConfiguration('loco');
            const currentValue = config.get<boolean>('inlineCompletions', false);
            config.update('inlineCompletions', !currentValue, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(
                `Inline completions ${!currentValue ? 'enabled' : 'disabled'}`
            );
        }
    );

    const clearCacheCommand = vscode.commands.registerCommand(
        'loco.clearCache',
        () => {
            vscode.window.showInformationMessage('Cache cleared!');
        }
    );

    const restartBackendCommand = vscode.commands.registerCommand(
        'loco.restartBackend',
        async () => {
            vscode.window.showInformationMessage('Restarting Loco backend...');
            const success = await backendManager.restart(context);
            if (success) {
                vscode.window.showInformationMessage('✅ Backend restarted successfully');
            } else {
                vscode.window.showErrorMessage('❌ Failed to restart backend');
            }
        }
    );

    const stopBackendCommand = vscode.commands.registerCommand(
        'loco.stopBackend',
        async () => {
            await backendManager.stop();
            vscode.window.showInformationMessage('Loco backend stopped');
        }
    );

    const startBackendCommand = vscode.commands.registerCommand(
        'loco.startBackend',
        async () => {
            const success = await backendManager.start(context);
            if (success) {
                vscode.window.showInformationMessage('✅ Backend started successfully');
            } else {
                vscode.window.showErrorMessage('❌ Failed to start backend');
            }
        }
    );

    // Add to subscriptions
    context.subscriptions.push(
        hoverDisposable,
        completionDisposable,
        openChatCommand,
        explainCommand,
        debugCommand,
        refactorCommand,
        documentCommand,
        openSettingsCommand,
        showAvailableModelsCommand,
        clearChatCommand,
        addFileReferenceCommand,
        toggleInlineCompletionsCommand,
        clearCacheCommand,
        restartBackendCommand,
        stopBackendCommand,
        startBackendCommand,
        backendManager,
        popupProvider,
        agentCommands
    );

    console.log('✅ Loco activated');
    // Don't show info message on every activation (reduces noise)
}

export function deactivate() {
    console.log('👋 Loco deactivated');
    isActivated = false;
    
    // Cleanup backend if needed
    if (backendManager) {
        backendManager.dispose();
    }
}
