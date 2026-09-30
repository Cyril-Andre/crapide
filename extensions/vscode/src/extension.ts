import * as vscode from 'vscode';
import { AnalysisController } from './analysisController';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(new AnalysisController());
}
