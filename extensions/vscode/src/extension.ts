import * as vscode from 'vscode';
import { AnalysisController } from './analysisController';
import { CrapCodeLensProvider } from './codeLensProvider';

export function activate(context: vscode.ExtensionContext): void {
  const analysis = new AnalysisController();
  context.subscriptions.push(new CrapCodeLensProvider(analysis), analysis);
}
