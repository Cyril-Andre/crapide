import * as assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  buildInvocation,
  CliRunner,
  type Invocation,
  type ProcessAdapter,
  type ProcessResult,
} from '../../src/cliRunner';

const cwd = path.resolve('/tmp/crapide workspace café');
const validJson = '{"members":[]}';

class FakeProcess implements ProcessAdapter {
  readonly calls: Invocation[] = [];

  constructor(private readonly result: ProcessResult) {}

  run(invocation: Invocation): Promise<ProcessResult> {
    this.calls.push(invocation);
    return Promise.resolve(this.result);
  }
}

test('constructs fixed arguments without shell splitting', () => {
  assert.deepEqual(buildInvocation({ cwd, executable: {} }), {
    command: 'crap4csharp',
    args: ['--format', 'json'],
    cwd,
  });
  assert.deepEqual(
    buildInvocation({
      cwd,
      executable: {
        cliPath: './bin café/Microsoft.Crap4CSharp.dll',
        dotnetPath: './runtime space/dotnet',
      },
    }),
    {
      command: path.join(cwd, 'runtime space/dotnet'),
      args: [
        path.join(cwd, 'bin café/Microsoft.Crap4CSharp.dll'),
        '--format',
        'json',
      ],
      cwd,
    },
  );
  assert.deepEqual(
    buildInvocation({
      cwd,
      executable: { cliPath: './native tool' },
    }).args,
    ['--format', 'json'],
  );
});

for (const [code, thresholdExceeded] of [
  [0, false],
  [2, true],
] as const) {
  test(`exit ${code} with valid JSON is publishable`, async () => {
    const fake = new FakeProcess({
      kind: 'exited',
      code,
      signal: null,
      stdout: validJson,
      stderr: 'test progress\n',
    });
    const result = await new CliRunner(fake).run({ cwd, executable: {} });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.thresholdExceeded, thresholdExceeded);
    assert.equal(result.exitCode, code);
    assert.deepEqual(result.report.members, []);
    assert.equal(result.stderr, 'test progress\n');
    assert.deepEqual(fake.calls[0].args, ['--format', 'json']);
  });
}

for (const [processResult, failure] of [
  [
    {
      kind: 'exited',
      code: 1,
      signal: null,
      stdout: validJson,
      stderr: 'fatal',
    },
    'fatal-exit',
  ],
  [
    { kind: 'exited', code: 3, signal: null, stdout: validJson, stderr: '' },
    'unexpected-exit',
  ],
  [
    {
      kind: 'exited',
      code: null,
      signal: 'SIGTERM',
      stdout: validJson,
      stderr: '',
    },
    'unexpected-exit',
  ],
  [
    { kind: 'exited', code: 0, signal: null, stdout: '', stderr: '' },
    'protocol',
  ],
  [
    {
      kind: 'exited',
      code: 1,
      signal: null,
      stdout: '',
      stderr: 'Unknown option: --format',
    },
    'unsupported-format',
  ],
  [
    {
      kind: 'exited',
      code: 1,
      signal: null,
      stdout: '',
      stderr:
        'A compatible .NET SDK was not found. Requested SDK version: 8.0.406',
    },
    'missing-sdk',
  ],
  [
    {
      kind: 'exited',
      code: 2,
      signal: null,
      stdout: '{"members":{}}',
      stderr: '',
    },
    'protocol',
  ],
  [{ kind: 'spawn', stderr: '', error: 'ENOENT' }, 'spawn'],
  [{ kind: 'output-limit', stderr: 'progress' }, 'output-limit'],
  [{ kind: 'cancelled', stderr: '' }, 'cancelled'],
] as const) {
  test(`maps ${failure} without a partial report`, async () => {
    const result = await new CliRunner(
      new FakeProcess(processResult as ProcessResult),
    ).run({ cwd, executable: {} });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, failure);
    assert.equal('report' in result, false);
  });
}

test('distinguishes missing CLI on PATH from other spawn errors', async () => {
  const fake = new FakeProcess({
    kind: 'spawn',
    stderr: '',
    error: 'spawn ENOENT',
    errorCode: 'ENOENT',
  });
  const result = await new CliRunner(fake).run({ cwd, executable: {} });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'missing-cli');
});

test('distinguishes missing dotnet on PATH for an existing DLL', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'crapide-p7-'));
  const cliPath = path.join(root, 'tool.dll');
  writeFileSync(cliPath, '');
  try {
    const fake = new FakeProcess({
      kind: 'spawn',
      stderr: '',
      errorCode: 'ENOENT',
    });
    const result = await new CliRunner(fake).run({
      cwd,
      executable: { cliPath },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.kind, 'missing-runtime');
    assert.deepEqual(fake.calls[0].args, [cliPath, '--format', 'json']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an invalid explicit CLI without falling back to PATH', async () => {
  const fake = new FakeProcess({
    kind: 'exited',
    code: 0,
    signal: null,
    stdout: validJson,
    stderr: '',
  });
  const result = await new CliRunner(fake).run({
    cwd,
    executable: { cliPath: '/missing/tool' },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.kind, 'configuration');
    assert.match(result.detail ?? '', /crapide\.cliPath/);
  }
  assert.equal(fake.calls.length, 0);
});

test('rejects an invalid explicit dotnet executable for a DLL', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'crapide-p7-'));
  const cliPath = path.join(root, 'tool.dll');
  writeFileSync(cliPath, '');
  try {
    const fake = new FakeProcess({
      kind: 'exited',
      code: 0,
      signal: null,
      stdout: validJson,
      stderr: '',
    });
    const result = await new CliRunner(fake).run({
      cwd,
      executable: { cliPath, dotnetPath: '/missing/dotnet' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, 'configuration');
      assert.match(result.detail ?? '', /crapide\.dotnetPath/);
    }
    assert.equal(fake.calls.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an empty explicit path before spawning', async () => {
  const fake = new FakeProcess({
    kind: 'exited',
    code: 0,
    signal: null,
    stdout: validJson,
    stderr: '',
  });
  const result = await new CliRunner(fake).run({
    cwd,
    executable: { cliPath: ' ' },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'configuration');
  assert.equal(fake.calls.length, 0);
});

test('serializes one cwd while allowing another to start', async () => {
  const calls: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const adapter: ProcessAdapter = {
    run: async (invocation) => {
      calls.push(invocation.cwd);
      if (calls.length === 1)
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      return {
        kind: 'exited',
        code: 0,
        signal: null,
        stdout: validJson,
        stderr: '',
      };
    },
  };
  const runner = new CliRunner(adapter);
  const first = runner.run({ cwd, executable: {} });
  const second = runner.run({ cwd, executable: {} });
  const other = runner.run({ cwd: `${cwd}-other`, executable: {} });
  await other;
  assert.deepEqual(calls, [cwd, `${cwd}-other`]);
  assert.ok(releaseFirst);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(calls, [cwd, `${cwd}-other`, cwd]);
});

test('a queued cancelled call never starts a process', async () => {
  let releaseFirst: (() => void) | undefined;
  let launches = 0;
  const adapter: ProcessAdapter = {
    run: async () => {
      launches += 1;
      if (launches === 1)
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      return {
        kind: 'exited',
        code: 0,
        signal: null,
        stdout: validJson,
        stderr: '',
      };
    },
  };
  const runner = new CliRunner(adapter);
  const first = runner.run({ cwd, executable: {} });
  const controller = new AbortController();
  const queued = runner.run({ cwd, executable: {}, signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  assert.ok(releaseFirst);
  releaseFirst();
  await first;
  const result = await queued;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.kind, 'cancelled');
  assert.equal(launches, 1);
});
