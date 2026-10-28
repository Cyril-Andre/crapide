import * as assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { AnalysisController } from '../../src/analysisController';
import { CliRunner } from '../../src/cliRunner';
import { CrapCodeLensProvider } from '../../src/codeLensProvider';

const cliPath = process.env.CRAPIDE_REAL_CLI;

suite('Real CLI presentation', () => {
  if (!cliPath) return;

  test('exit 2 JSON drives Problems and CodeLens on a disposable project', async function () {
    this.timeout(120_000);
    const root = mkdtempSync(path.join(os.tmpdir(), 'crapide-p8-real-host-'));
    cpSync(path.resolve(__dirname, '../../../../../test/e2e/fixture'), root, {
      recursive: true,
    });
    const source = path.join(root, 'src/Demo/Calculator.cs');
    const original = readFileSync(source, 'utf8');
    const branches = Array.from(
      { length: 10 },
      (_, index) => `        if (value == ${index}) return ${index};`,
    ).join('\n');
    writeFileSync(
      source,
      original.replace(
        /\n}\s*$/,
        `\n    public static int Risky(int value)\n    {\n${branches}\n        return -1;\n    }\n}\n`,
      ),
    );

    const folder: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(root),
      name: path.basename(root),
      index: 0,
    };
    const commandId = 'crapide.test.p8.real';
    const notices: string[] = [];
    const output = {
      name: 'CRAP IDE real test',
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
      runner: new CliRunner(),
      folders: () => [folder],
      isTrusted: () => true,
      notify: (_level, message) => notices.push(message),
      confirmCoverage: async () => true,
      output,
      executableForFolder: () => ({ cliPath }),
      withCancellation: async (work) => work(new AbortController().signal),
    });
    const provider = new CrapCodeLensProvider(analysis);
    try {
      await vscode.commands.executeCommand(commandId);
      const snapshot = analysis.snapshotFor(folder.uri);
      assert.ok(snapshot, notices.join('\n'));
      assert.equal(snapshot.thresholdExceeded, true);
      const risky = snapshot.members.find((item) =>
        item.member.name.endsWith('Risky'),
      );
      assert.ok(risky);
      assert.ok((risky.member.crap ?? 0) > 8);

      const uri = vscode.Uri.file(source);
      const problems = vscode.languages
        .getDiagnostics(uri)
        .filter((item) => item.source === 'CRAP');
      assert.ok(problems.some((item) => item.message.includes('Risky')));
      await vscode.workspace.openTextDocument(uri);
      const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider',
        uri,
      );
      assert.ok(
        lenses.some(
          (item) =>
            item.command?.title.includes('CRAP') &&
            item.command.title.includes('CC'),
        ),
      );
    } finally {
      provider.dispose();
      analysis.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
