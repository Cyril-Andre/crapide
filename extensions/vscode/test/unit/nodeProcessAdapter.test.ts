import * as assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { NodeProcessAdapter, type Invocation } from '../../src/cliRunner';

function standIn(source: string): {
  invocation: Invocation;
  dispose: () => void;
} {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'crapide-runner-'));
  const script = path.join(cwd, 'stand in café.cjs');
  writeFileSync(script, source);
  return {
    invocation: {
      command: process.execPath,
      args: [script, '--format', 'json'],
      cwd,
    },
    dispose: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

test('drains stderr while retaining valid stdout and exit 2', async () => {
  const fixture = standIn(`
    process.stderr.write('progress '.repeat(500));
    process.stdout.write(JSON.stringify({members: []}));
    process.exitCode = 2;
  `);
  try {
    const result = await new NodeProcessAdapter().run(fixture.invocation);
    assert.equal(result.kind, 'exited');
    if (result.kind !== 'exited') return;
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '{"members":[]}');
    assert.match(result.stderr, /progress/);
  } finally {
    fixture.dispose();
  }
});

test('missing executable is a spawn failure', async () => {
  const fixture = standIn('');
  try {
    const result = await new NodeProcessAdapter().run({
      ...fixture.invocation,
      command: path.join(fixture.invocation.cwd, 'missing executable'),
    });
    assert.equal(result.kind, 'spawn');
  } finally {
    fixture.dispose();
  }
});

test('bounds stdout and stderr independently', async () => {
  for (const stream of ['stdout', 'stderr'] as const) {
    const fixture = standIn(`process.${stream}.write('x'.repeat(4096));`);
    try {
      const result = await new NodeProcessAdapter({
        maxStdoutBytes: 100,
        maxStderrBytes: 100,
      }).run(fixture.invocation);
      assert.equal(result.kind, 'output-limit');
      assert.ok(Buffer.byteLength(result.stderr) <= 100);
    } finally {
      fixture.dispose();
    }
  }
});

test('cancels a live process without publishing stdout', async () => {
  const fixture = standIn(`
    process.stderr.write('ready\\n');
    setInterval(() => process.stdout.write('{"members":[]}'), 100);
  `);
  try {
    const controller = new AbortController();
    const run = new NodeProcessAdapter().run(
      fixture.invocation,
      controller.signal,
    );
    // Abort after launch; the adapter closes its pipes before resolving.
    setTimeout(() => controller.abort(), 100);
    const result = await run;
    assert.equal(result.kind, 'cancelled');
  } finally {
    fixture.dispose();
  }
});

test(
  'cancellation terminates a child process group on POSIX',
  {
    skip: process.platform === 'win32',
  },
  async () => {
    const fixture = standIn(`
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const marker = process.argv[3];
    const grandchild = spawn(process.execPath, ['-e',
      'setTimeout(() => require("node:fs").writeFileSync(process.argv[1], "survived"), 600)',
      marker], { stdio: 'ignore' });
    writeFileSync('grandchild.pid', String(grandchild.pid));
    process.stderr.write('ready\\n');
    setInterval(() => {}, 1000);
  `);
    try {
      const marker = path.join(fixture.invocation.cwd, 'survived');
      const controller = new AbortController();
      const invocation = {
        ...fixture.invocation,
        args: [...fixture.invocation.args, marker],
      };
      const run = new NodeProcessAdapter().run(invocation, controller.signal);
      // Wait for the direct child to confirm the grandchild was started.
      const pidFile = path.join(fixture.invocation.cwd, 'grandchild.pid');
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          readFileSync(pidFile);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      assert.ok(readFileSync(pidFile, 'utf8'));
      controller.abort();
      const result = await run;
      assert.equal(result.kind, 'cancelled');
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert.throws(() => readFileSync(marker));
    } finally {
      fixture.dispose();
    }
  },
);
