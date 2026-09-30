import * as vscode from 'vscode';
import { AnalysisController } from './analysisController';
import { presentCodeLenses } from './codeLensPresentation';

export class CrapCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  private readonly registration: vscode.Disposable;
  private readonly navigation: vscode.Disposable;
  private readonly snapshotSubscription: vscode.Disposable;

  constructor(private readonly analysis: AnalysisController) {
    this.registration = vscode.languages.registerCodeLensProvider(
      { language: 'csharp', scheme: 'file' },
      this,
    );
    this.navigation = vscode.commands.registerCommand(
      'crapide.openMember',
      async (uri: vscode.Uri, line: number) => {
        const document = await vscode.workspace.openTextDocument(uri);
        const position = new vscode.Position(line, 0);
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      },
    );
    this.snapshotSubscription = this.analysis.onDidChangeSnapshots(() =>
      this.changed.fire(),
    );
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const presentations = presentCodeLenses(
      this.analysis.membersForDocument(document.uri),
    );
    return presentations.map(({ line, title, tooltip }) => {
      const position = new vscode.Position(line, 0);
      return new vscode.CodeLens(new vscode.Range(position, position), {
        title,
        tooltip,
        command: 'crapide.openMember',
        arguments: [document.uri, line],
      });
    });
  }

  dispose(): void {
    this.snapshotSubscription.dispose();
    this.navigation.dispose();
    this.registration.dispose();
    this.changed.dispose();
  }
}
