import { statSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  CliRunner,
  type AnalysisOutcome,
  type AnalysisRequest,
} from './cliRunner';
import {
  resolveReport,
  type FolderSnapshot,
  type ResolvedMember,
} from './reportLocations';

export interface AnalysisRunner {
  run(request: AnalysisRequest): Promise<AnalysisOutcome>;
}

export type NoticeLevel = 'info' | 'warning' | 'error';

export interface AnalysisControllerOptions {
  readonly commandId?: string;
  readonly runner?: AnalysisRunner;
  readonly folders?: () => readonly vscode.WorkspaceFolder[] | undefined;
  readonly isTrusted?: () => boolean;
  readonly confirmCoverage?: (
    folder: vscode.WorkspaceFolder,
  ) => Promise<boolean>;
  readonly notify?: (level: NoticeLevel, message: string) => void;
  readonly output?: vscode.OutputChannel;
  readonly withCancellation?: (
    work: (signal: AbortSignal) => Promise<void>,
  ) => Promise<void>;
}

function isDirectory(directory: string): boolean {
  try {
    return statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function defaultNotice(level: NoticeLevel, message: string): void {
  if (level === 'error') void vscode.window.showErrorMessage(message);
  else if (level === 'warning') void vscode.window.showWarningMessage(message);
  else void vscode.window.showInformationMessage(message);
}

async function defaultConfirmCoverage(
  folder: vscode.WorkspaceFolder,
): Promise<boolean> {
  const selected = await vscode.window.showWarningMessage(
    `CRAP analysis will replace the existing coverage/ directory in ${folder.name}. Continue?`,
    { modal: true },
    'Run analysis',
  );
  return selected === 'Run analysis';
}

async function defaultWithCancellation(
  work: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'CRAP: Analyze Workspace',
      cancellable: true,
    },
    async (_progress, token) => {
      const controller = new AbortController();
      const subscription = token.onCancellationRequested(() =>
        controller.abort(),
      );
      try {
        await work(controller.signal);
      } finally {
        subscription.dispose();
      }
    },
  );
}

function failureMessage(
  folder: vscode.WorkspaceFolder,
  outcome: AnalysisOutcome,
): string {
  if (outcome.ok) throw new Error('Expected a failed analysis.');
  const prefix = `CRAP analysis failed for ${folder.name}: `;
  switch (outcome.kind) {
    case 'missing-cli':
      return `${prefix}crap4csharp was not found. Set crapide.cliPath or install the CLI on PATH.`;
    case 'missing-runtime':
      return `${prefix}dotnet was not found. Set crapide.dotnetPath or install .NET.`;
    case 'fatal-exit':
      if (/span multiple projects/i.test(outcome.stderr))
        return `${prefix}the folder spans multiple C# projects. Analyze a folder with one owning project.`;
      if (/no test project was found/i.test(outcome.stderr))
        return `${prefix}no matching test project was found. Check the CLI's test-project requirements.`;
      if (/no owning project/i.test(outcome.stderr))
        return `${prefix}a source file has no owning .csproj inside the folder.`;
      return `${prefix}the CLI exited with code 1. Check the CRAP IDE output for test or coverage details.`;
    case 'protocol':
      return `${prefix}the CLI did not return compatible JSON. Check that it supports --format json.`;
    case 'output-limit':
      return `${prefix}CLI output exceeded the capture limit. Check the CRAP IDE output.`;
    case 'cancelled':
      return `CRAP analysis cancelled for ${folder.name}.`;
    case 'configuration':
      return `${prefix}the CLI path or invocation directory is invalid.`;
    case 'spawn':
      return `${prefix}the CLI could not be started. Check its path and permissions.`;
    case 'unexpected-exit':
      return `${prefix}the CLI stopped unexpectedly. Check the CRAP IDE output.`;
  }
}

function diagnosticFor(resolved: ResolvedMember): vscode.Diagnostic | null {
  const { member, location } = resolved;
  if (location === null || member.crap === null || member.crap <= 8)
    return null;
  const range = new vscode.Range(
    location.startLine,
    0,
    location.endLine,
    location.endColumn,
  );
  const diagnostic = new vscode.Diagnostic(
    range,
    `${member.name}: CRAP ${member.crap} (> 8)`,
    vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.source = 'CRAP';
  return diagnostic;
}

/** Owns one diagnostic collection, one output channel, and per-folder snapshots. */
export class AnalysisController implements vscode.Disposable {
  private readonly command: vscode.Disposable;
  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly output: vscode.OutputChannel;
  private readonly ownsOutput: boolean;
  private readonly runner: AnalysisRunner;
  private readonly folders: () => readonly vscode.WorkspaceFolder[] | undefined;
  private readonly isTrusted: () => boolean;
  private readonly confirmCoverage: (
    folder: vscode.WorkspaceFolder,
  ) => Promise<boolean>;
  private readonly notify: (level: NoticeLevel, message: string) => void;
  private readonly withCancellation: (
    work: (signal: AbortSignal) => Promise<void>,
  ) => Promise<void>;
  private readonly snapshots = new Map<string, FolderSnapshot>();
  private readonly diagnosticsByFolder = new Map<
    string,
    Map<string, readonly vscode.Diagnostic[]>
  >();
  private readonly generations = new Map<string, number>();
  private running = false;

  constructor(options: AnalysisControllerOptions = {}) {
    const commandId = options.commandId ?? 'crapide.analyzeWorkspace';
    this.runner = options.runner ?? new CliRunner();
    this.folders = options.folders ?? (() => vscode.workspace.workspaceFolders);
    this.isTrusted = options.isTrusted ?? (() => vscode.workspace.isTrusted);
    this.confirmCoverage = options.confirmCoverage ?? defaultConfirmCoverage;
    this.notify = options.notify ?? defaultNotice;
    this.withCancellation = options.withCancellation ?? defaultWithCancellation;
    this.diagnostics = vscode.languages.createDiagnosticCollection(commandId);
    this.ownsOutput = options.output === undefined;
    this.output =
      options.output ?? vscode.window.createOutputChannel('CRAP IDE');
    this.command = vscode.commands.registerCommand(commandId, () => this.run());
  }

  snapshotFor(folder: vscode.Uri): FolderSnapshot | undefined {
    return this.snapshots.get(folder.toString());
  }

  private clearFolder(folderKey: string): number {
    const nextGeneration = (this.generations.get(folderKey) ?? 0) + 1;
    this.generations.set(folderKey, nextGeneration);
    this.snapshots.delete(folderKey);
    const old = this.diagnosticsByFolder.get(folderKey);
    this.diagnosticsByFolder.delete(folderKey);
    for (const uri of old?.keys() ?? []) this.refreshUri(uri);
    return nextGeneration;
  }

  private refreshUri(uriString: string): void {
    const combined: vscode.Diagnostic[] = [];
    for (const folderDiagnostics of this.diagnosticsByFolder.values()) {
      combined.push(...(folderDiagnostics.get(uriString) ?? []));
    }
    const uri = vscode.Uri.parse(uriString);
    if (combined.length === 0) this.diagnostics.delete(uri);
    else this.diagnostics.set(uri, combined);
  }

  private publish(folderKey: string, snapshot: FolderSnapshot): void {
    this.snapshots.set(folderKey, snapshot);
    const byUri = new Map<string, vscode.Diagnostic[]>();
    for (const resolved of snapshot.members) {
      const diagnostic = diagnosticFor(resolved);
      if (diagnostic === null || resolved.location === null) continue;
      const uri = vscode.Uri.file(resolved.location.filePath).toString();
      const list = byUri.get(uri) ?? [];
      list.push(diagnostic);
      byUri.set(uri, list);
    }
    this.diagnosticsByFolder.set(folderKey, byUri);
    for (const uri of byUri.keys()) this.refreshUri(uri);
  }

  private async runFolder(
    folder: vscode.WorkspaceFolder,
    signal: AbortSignal,
  ): Promise<void> {
    const folderKey = folder.uri.toString();
    const generation = this.clearFolder(folderKey);
    if (folder.uri.scheme !== 'file') {
      this.notify(
        'error',
        `CRAP analysis requires a file-backed workspace: ${folder.name}.`,
      );
      return;
    }

    const cwd = folder.uri.fsPath;
    if (!isDirectory(path.join(cwd, 'src'))) {
      this.notify(
        'warning',
        `CRAP analysis found no src/ directory in ${folder.name}.`,
      );
      return;
    }
    if (isDirectory(path.join(cwd, 'coverage'))) {
      const confirmed = await this.confirmCoverage(folder);
      if (!confirmed || signal.aborted) {
        this.notify(
          'info',
          `CRAP analysis skipped for ${folder.name}; coverage/ was left untouched.`,
        );
        return;
      }
    }

    const configuration = vscode.workspace.getConfiguration(
      'crapide',
      folder.uri,
    );
    const cliPath = configuration.get<string>('cliPath')?.trim() || undefined;
    const dotnetPath =
      configuration.get<string>('dotnetPath')?.trim() || undefined;
    this.output.appendLine(`=== ${folder.name} ===`);
    const outcome = await this.runner.run({
      cwd,
      executable: { cliPath, dotnetPath },
      signal,
    });
    if (outcome.stderr) this.output.append(outcome.stderr);
    if (this.generations.get(folderKey) !== generation) return;
    if (!outcome.ok) {
      if (outcome.detail) this.output.appendLine(outcome.detail);
      const level = outcome.kind === 'cancelled' ? 'info' : 'error';
      this.notify(level, failureMessage(folder, outcome));
      if (level === 'error') this.output.show(true);
      return;
    }

    let snapshot: FolderSnapshot;
    try {
      snapshot = resolveReport(outcome.report, cwd, outcome.thresholdExceeded);
    } catch (error) {
      this.output.appendLine(String(error));
      this.notify(
        'error',
        `CRAP analysis could not read source files in ${folder.name}.`,
      );
      this.output.show(true);
      return;
    }
    if (signal.aborted || this.generations.get(folderKey) !== generation)
      return;
    this.publish(folderKey, snapshot);
    const unlocated = snapshot.members.filter(
      (member) => member.location === null,
    );
    if (unlocated.length > 0) {
      this.output.appendLine(
        `${unlocated.length} member(s) could not be located in ${folder.name}:`,
      );
      for (const item of unlocated) {
        this.output.appendLine(
          `- ${item.member.name}: ${item.unlocatedReason ?? 'unknown reason'}`,
        );
      }
      this.notify(
        'warning',
        `${unlocated.length} CRAP member(s) could not be located in ${folder.name}; see the CRAP IDE output.`,
      );
    }
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.notify('info', 'CRAP analysis is already running.');
      return;
    }
    if (!this.isTrusted()) {
      this.notify('error', 'Trust the workspace before running CRAP analysis.');
      return;
    }
    const folders = this.folders();
    if (!folders || folders.length === 0) {
      this.notify(
        'warning',
        'Open a file-backed workspace folder before running CRAP analysis.',
      );
      return;
    }
    this.running = true;
    try {
      await this.withCancellation(async (signal) => {
        for (const folder of folders) {
          if (signal.aborted) break;
          await this.runFolder(folder, signal);
        }
      });
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    this.command.dispose();
    this.diagnostics.dispose();
    if (this.ownsOutput) this.output.dispose();
    this.snapshots.clear();
    this.diagnosticsByFolder.clear();
  }
}
