import * as assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  AnalysisController,
  type AnalysisRunner,
} from '../../src/analysisController';
import type { AnalysisOutcome, AnalysisRequest } from '../../src/cliRunner';
import { CrapCodeLensProvider } from '../../src/codeLensProvider';
import type { JsonMember } from '../../src/jsonReport';

let nextCommand = 0;

function fixture(): {
  folder: vscode.WorkspaceFolder;
  file: vscode.Uri;
  dispose: () => void;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), 'crapide-p6-'));
  mkdirSync(path.join(root, 'src'));
  const file = vscode.Uri.file(path.join(root, 'src', 'Sample.cs'));
  writeFileSync(file.fsPath, 'first\nsecond\nthird\n');
  return {
    folder: { uri: vscode.Uri.file(root), name: path.basename(root), index: 0 },
    file,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function member(name: string, startLine = 2): JsonMember {
  return {
    name,
    file: 'src/Sample.cs',
    startLine,
    endLine: startLine,
    complexity: 3,
    coveragePercent: 0,
    crap: 12,
  };
}

function success(members: readonly JsonMember[]): AnalysisOutcome {
  return {
    ok: true,
    report: { members },
    thresholdExceeded: true,
    exitCode: 2,
    stderr: '',
  };
}

function setup(
  folders: vscode.WorkspaceFolder[],
  runner: AnalysisRunner,
): {
  commandId: string;
  analysis: AnalysisController;
  provider: CrapCodeLensProvider;
} {
  const commandId = `crapide.test.p6.${nextCommand++}`;
  const output = {
    name: 'CRAP IDE test',
    append: () => undefined,
    appendLine: () => undefined,
    replace: () => undefined,
    clear: () => undefined,
    show: () => undefined,
    hide: () => undefined,
    dispose: () => undefined,
  } as vscode.OutputChannel;
  const analysis = new AnalysisController({
    commandId,
    runner,
    folders: () => folders,
    isTrusted: () => true,
    notify: () => undefined,
    output,
    withCancellation: async (work) => work(new AbortController().signal),
  });
  return { commandId, analysis, provider: new CrapCodeLensProvider(analysis) };
}

async function lenses(uri: vscode.Uri): Promise<vscode.CodeLens[]> {
  const document = await vscode.workspace.openTextDocument(uri);
  assert.equal(document.languageId, 'csharp');
  return vscode.commands.executeCommand<vscode.CodeLens[]>(
    'vscode.executeCodeLensProvider',
    uri,
  );
}

suite('P6 CodeLens', () => {
  test('queries distinct lenses and navigates to the reported start line', async () => {
    const target = fixture();
    const runner: AnalysisRunner = {
      run: async () => success([member('Demo.Check'), member('Demo.Check')]),
    };
    const { commandId, analysis, provider } = setup([target.folder], runner);
    try {
      await vscode.commands.executeCommand(commandId);
      const found = await lenses(target.file);
      assert.equal(found.length, 2);
      assert.deepEqual(
        found.map((lens) => lens.range.start.line),
        [1, 1],
      );
      assert.deepEqual(
        found.map((lens) => lens.range.start.character),
        [0, 0],
      );
      assert.match(found[0].command?.title ?? '', /Demo.Check \(1\/2\)/);
      assert.match(found[1].command?.title ?? '', /Demo.Check \(2\/2\)/);
      const command = found[1].command;
      assert.ok(command);
      await vscode.commands.executeCommand(
        command.command,
        ...(command.arguments ?? []),
      );
      assert.equal(
        vscode.window.activeTextEditor?.document.uri.toString(),
        target.file.toString(),
      );
      assert.equal(vscode.window.activeTextEditor?.selection.active.line, 1);
      assert.equal(
        vscode.window.activeTextEditor?.selection.active.character,
        0,
      );
    } finally {
      provider.dispose();
      analysis.dispose();
      target.dispose();
    }
  });

  test('failed rerun clears its lenses and leaves another folder intact', async () => {
    const first = fixture();
    const second = fixture();
    const folders = [first.folder, second.folder];
    let failSecond = false;
    const runner: AnalysisRunner = {
      run: async (request: AnalysisRequest) =>
        request.cwd === second.folder.uri.fsPath && failSecond
          ? { ok: false, kind: 'fatal-exit', stderr: '', exitCode: 1 }
          : success([member('Demo.Check')]),
    };
    const { commandId, analysis, provider } = setup(folders, runner);
    let changes = 0;
    const subscription = provider.onDidChangeCodeLenses(() => changes++);
    try {
      await vscode.commands.executeCommand(commandId);
      assert.equal((await lenses(first.file)).length, 1);
      assert.equal((await lenses(second.file)).length, 1);
      folders.splice(0, 1);
      failSecond = true;
      const before = changes;
      await vscode.commands.executeCommand(commandId);
      assert.ok(changes > before);
      assert.equal((await lenses(second.file)).length, 0);
      assert.equal((await lenses(first.file)).length, 1);
    } finally {
      subscription.dispose();
      provider.dispose();
      analysis.dispose();
      first.dispose();
      second.dispose();
    }
  });
});
