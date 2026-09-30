import * as assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  AnalysisController,
  type AnalysisRunner,
  type NoticeLevel,
} from '../../src/analysisController';
import type { AnalysisOutcome, AnalysisRequest } from '../../src/cliRunner';
import type { JsonMember } from '../../src/jsonReport';

let nextCommand = 0;

function member(overrides: Partial<JsonMember> = {}): JsonMember {
  return {
    name: 'Demo.Sample.Check',
    file: 'src/Sample.cs',
    startLine: 1,
    endLine: 3,
    complexity: 3,
    coveragePercent: 0,
    crap: 12,
    ...overrides,
  };
}

function success(
  members: readonly JsonMember[],
  exitCode: 0 | 2 = 2,
): AnalysisOutcome {
  return {
    ok: true,
    report: { members },
    thresholdExceeded: exitCode === 2,
    exitCode,
    stderr: 'test progress\n',
  };
}

function workspace(): {
  folder: vscode.WorkspaceFolder;
  file: vscode.Uri;
  dispose: () => void;
} {
  const root = mkdtempSync(path.join(os.tmpdir(), 'crapide-p5-'));
  mkdirSync(path.join(root, 'src'));
  const file = vscode.Uri.file(path.join(root, 'src', 'Sample.cs'));
  writeFileSync(file.fsPath, 'first\nsecond\nthird\n');
  return {
    folder: { uri: vscode.Uri.file(root), name: path.basename(root), index: 0 },
    file,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function diagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
  return vscode.languages
    .getDiagnostics(uri)
    .filter((diagnostic) => diagnostic.source === 'CRAP');
}

class FakeRunner implements AnalysisRunner {
  readonly calls: AnalysisRequest[] = [];

  constructor(
    private readonly answer: (request: AnalysisRequest) => AnalysisOutcome,
  ) {}

  run(request: AnalysisRequest): Promise<AnalysisOutcome> {
    this.calls.push(request);
    return Promise.resolve(this.answer(request));
  }
}

function controller(
  folders: readonly vscode.WorkspaceFolder[],
  runner: AnalysisRunner,
  options: {
    trusted?: boolean;
    confirmCoverage?: boolean;
    notices?: { level: NoticeLevel; message: string }[];
  } = {},
): { commandId: string; controller: AnalysisController } {
  const commandId = `crapide.test.p5.${nextCommand++}`;
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
  return {
    commandId,
    controller: new AnalysisController({
      commandId,
      runner,
      folders: () => folders,
      isTrusted: () => options.trusted ?? true,
      confirmCoverage: async () => options.confirmCoverage ?? true,
      notify: (level, message) => options.notices?.push({ level, message }),
      output,
      withCancellation: async (work) => work(new AbortController().signal),
    }),
  };
}

suite('P5 manual analysis', () => {
  test('exit 2 publishes only located CRAP > 8 while retaining all records', async () => {
    const fixture = workspace();
    const runner = new FakeRunner(() =>
      success([
        member({ crap: 8 }),
        member({ name: 'Demo.Sample.Overload', crap: 12 }),
        member({ name: 'Demo.Sample.Overload', crap: 15 }),
        member({ name: 'Demo.Sample.Unavailable', crap: null }),
        member({ name: 'Demo.Sample.Missing', file: null, crap: 20 }),
      ]),
    );
    const notices: { level: NoticeLevel; message: string }[] = [];
    const registered = controller([fixture.folder], runner, { notices });
    try {
      await vscode.commands.executeCommand(registered.commandId);
      assert.equal(runner.calls.length, 1);
      assert.equal(runner.calls[0].cwd, fixture.folder.uri.fsPath);
      assert.equal(
        registered.controller.snapshotFor(fixture.folder.uri)?.members.length,
        5,
      );
      const problems = diagnostics(fixture.file);
      assert.equal(problems.length, 2);
      assert.deepEqual(
        problems.map((diagnostic) => diagnostic.message),
        [
          'Demo.Sample.Overload: CRAP 12 (> 8)',
          'Demo.Sample.Overload: CRAP 15 (> 8)',
        ],
      );
      assert.equal(problems[0].severity, vscode.DiagnosticSeverity.Warning);
      assert.equal(problems[0].range.start.line, 0);
      assert.ok(
        notices.some((notice) => /could not be located/.test(notice.message)),
      );
    } finally {
      registered.controller.dispose();
      fixture.dispose();
    }
  });

  test('a failed rerun clears its prior snapshot and Problems', async () => {
    const fixture = workspace();
    let fail = false;
    const runner = new FakeRunner(() =>
      fail
        ? { ok: false, kind: 'fatal-exit', stderr: 'tests failed', exitCode: 1 }
        : success([member()]),
    );
    const notices: { level: NoticeLevel; message: string }[] = [];
    const registered = controller([fixture.folder], runner, { notices });
    try {
      await vscode.commands.executeCommand(registered.commandId);
      assert.equal(diagnostics(fixture.file).length, 1);
      fail = true;
      await vscode.commands.executeCommand(registered.commandId);
      assert.equal(diagnostics(fixture.file).length, 0);
      assert.equal(
        registered.controller.snapshotFor(fixture.folder.uri),
        undefined,
      );
      assert.ok(notices.some((notice) => notice.level === 'error'));
    } finally {
      registered.controller.dispose();
      fixture.dispose();
    }
  });

  test('multi-root runs use separate cwd and keep unrelated findings', async () => {
    const first = workspace();
    const second = workspace();
    const runner = new FakeRunner((request) =>
      request.cwd === first.folder.uri.fsPath
        ? success([member()])
        : {
            ok: false,
            kind: 'fatal-exit',
            stderr: 'span multiple projects',
            exitCode: 1,
          },
    );
    const registered = controller([first.folder, second.folder], runner);
    try {
      await vscode.commands.executeCommand(registered.commandId);
      assert.deepEqual(
        runner.calls.map((request) => request.cwd),
        [first.folder.uri.fsPath, second.folder.uri.fsPath],
      );
      assert.equal(diagnostics(first.file).length, 1);
      assert.equal(diagnostics(second.file).length, 0);
      assert.equal(
        registered.controller.snapshotFor(second.folder.uri),
        undefined,
      );
    } finally {
      registered.controller.dispose();
      first.dispose();
      second.dispose();
    }
  });

  test('untrusted and virtual workspaces never launch a process', async () => {
    const fixture = workspace();
    const runner = new FakeRunner(() => success([member()]));
    const notices: { level: NoticeLevel; message: string }[] = [];
    const untrusted = controller([fixture.folder], runner, {
      trusted: false,
      notices,
    });
    const virtualFolder: vscode.WorkspaceFolder = {
      uri: vscode.Uri.parse('memfs:/virtual'),
      name: 'virtual',
      index: 0,
    };
    const virtual = controller([virtualFolder], runner, { notices });
    try {
      await vscode.commands.executeCommand(untrusted.commandId);
      await vscode.commands.executeCommand(virtual.commandId);
      assert.equal(runner.calls.length, 0);
      assert.ok(
        notices.some((notice) => /Trust the workspace/.test(notice.message)),
      );
      assert.ok(notices.some((notice) => /file-backed/.test(notice.message)));
    } finally {
      untrusted.controller.dispose();
      virtual.controller.dispose();
      fixture.dispose();
    }
  });

  test('existing coverage requires confirmation on every run', async () => {
    const fixture = workspace();
    const runner = new FakeRunner(() => success([member()]));
    const approved = controller([fixture.folder], runner, {
      confirmCoverage: true,
    });
    try {
      await vscode.commands.executeCommand(approved.commandId);
      assert.equal(runner.calls.length, 1);
      assert.equal(diagnostics(fixture.file).length, 1);
    } finally {
      approved.controller.dispose();
    }
    mkdirSync(path.join(fixture.folder.uri.fsPath, 'coverage'));
    const declined = controller([fixture.folder], runner, {
      confirmCoverage: false,
    });
    try {
      await vscode.commands.executeCommand(declined.commandId);
      assert.equal(runner.calls.length, 1);
      assert.equal(diagnostics(fixture.file).length, 0);
      assert.equal(
        declined.controller.snapshotFor(fixture.folder.uri),
        undefined,
      );
    } finally {
      declined.controller.dispose();
      fixture.dispose();
    }
  });

  test('missing src and cancelled runs do not publish findings', async () => {
    const fixture = workspace();
    const runner = new FakeRunner(() => ({
      ok: false,
      kind: 'cancelled',
      stderr: '',
    }));
    const notices: { level: NoticeLevel; message: string }[] = [];
    const registered = controller([fixture.folder], runner, { notices });
    try {
      await vscode.commands.executeCommand(registered.commandId);
      assert.equal(diagnostics(fixture.file).length, 0);
      assert.equal(
        registered.controller.snapshotFor(fixture.folder.uri),
        undefined,
      );
      assert.ok(notices.some((notice) => /cancelled/.test(notice.message)));
      rmSync(path.join(fixture.folder.uri.fsPath, 'src'), {
        recursive: true,
      });
      await vscode.commands.executeCommand(registered.commandId);
      assert.equal(runner.calls.length, 1);
      assert.ok(notices.some((notice) => /no src\//.test(notice.message)));
    } finally {
      registered.controller.dispose();
      fixture.dispose();
    }
  });

  test('overlapping commands cannot bypass a later coverage confirmation', async () => {
    const fixture = workspace();
    let releaseRun: (() => void) | undefined;
    let signalStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    let calls = 0;
    const runner: AnalysisRunner = {
      run: async () => {
        calls += 1;
        signalStarted?.();
        await blocked;
        return success([member()]);
      },
    };
    const notices: { level: NoticeLevel; message: string }[] = [];
    const registered = controller([fixture.folder], runner, { notices });
    try {
      const first = vscode.commands.executeCommand(registered.commandId);
      await started;
      await vscode.commands.executeCommand(registered.commandId);
      assert.equal(calls, 1);
      assert.ok(
        notices.some((notice) => /already running/.test(notice.message)),
      );
      releaseRun?.();
      await first;
      assert.equal(diagnostics(fixture.file).length, 1);
    } finally {
      releaseRun?.();
      registered.controller.dispose();
      fixture.dispose();
    }
  });
});
