import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('crapide.analyzeWorkspace', async () => {
      await vscode.window.showInformationMessage(
        'CRAP: Analyze Workspace is not implemented yet.',
      );
    }),
  );
}
