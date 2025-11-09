import * as vscode from 'vscode';
import { BackendClient } from './api/backendClient';
import { InlineCompletionProvider } from './providers/completionProvider';
import { ChatPanel } from './chat/chatPanel';

let backend: BackendClient;
let completionProvider: InlineCompletionProvider;
let chatPanel: ChatPanel;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Loco AI Assistant activating...');

    // Initialize backend client
    backend = new BackendClient();

    // Initialize inline completion provider
    completionProvider = new InlineCompletionProvider(backend);
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
            const current = config.get<boolean>('inlineCompletions');
            await config.update('inlineCompletions', !current, vscode.ConfigurationTarget.Global);
            
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

    // Add all to subscriptions
    context.subscriptions.push(
        completionDisposable,
        chatViewDisposable,
        openChatCommand,
        toggleCompletionsCommand,
        clearCacheCommand,
        addFileCommand,
        backend
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
}

export function deactivate() {
    console.log('👋 Loco deactivated');
}
