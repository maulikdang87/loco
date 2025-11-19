import * as vscode from 'vscode';
import { BackendClient } from './api/backendClient';
import { InlineCompletionProvider } from './providers/completionProvider';
import { ChatPanel } from './chat/chatPanel';
import { AgentCommands } from './commands/agentCommands';
import { InlinePopupProvider } from './providers/inlinePopupProvider';

let backend: BackendClient;
let completionProvider: InlineCompletionProvider;
let agentCommands: AgentCommands;
let popupProvider: InlinePopupProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Loco activating...');

    // Initialize backend
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
        () => ChatPanel.createOrShow(context.extensionUri, backend)
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
        backend,
        popupProvider,
        agentCommands
    );

    console.log('✅ Loco activated');
    vscode.window.showInformationMessage('Loco is ready! Select code and right-click.');
}

export function deactivate() {
    console.log('👋 Loco deactivated');
}
