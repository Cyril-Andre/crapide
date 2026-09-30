import { spawn, type ChildProcess } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import * as path from 'node:path';
import {
  parseJsonReport,
  type JsonReport,
  type ParseFailure,
} from './jsonReport';

export interface ExecutableSpec {
  /** A native executable, a prebuilt .dll, or omitted to search PATH. */
  readonly cliPath?: string;
  readonly dotnetPath?: string;
}

export interface AnalysisRequest {
  readonly cwd: string;
  readonly executable: ExecutableSpec;
  readonly signal?: AbortSignal;
}

export interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export type ProcessResult =
  | {
      readonly kind: 'exited';
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
      readonly stdout: string;
      readonly stderr: string;
    }
  | {
      readonly kind: 'spawn' | 'output-limit' | 'cancelled';
      readonly stderr: string;
      readonly error?: string;
      readonly errorCode?: string;
    };

export interface ProcessAdapter {
  run(invocation: Invocation, signal?: AbortSignal): Promise<ProcessResult>;
}

export type AnalysisOutcome =
  | {
      readonly ok: true;
      readonly report: JsonReport;
      readonly thresholdExceeded: boolean;
      readonly exitCode: 0 | 2;
      readonly stderr: string;
    }
  | {
      readonly ok: false;
      readonly kind:
        | 'configuration'
        | 'spawn'
        | 'missing-cli'
        | 'missing-runtime'
        | 'unsupported-format'
        | 'missing-sdk'
        | 'fatal-exit'
        | 'unexpected-exit'
        | 'protocol'
        | 'output-limit'
        | 'cancelled';
      readonly stderr: string;
      readonly detail?: string;
      readonly parseFailure?: ParseFailure;
      readonly exitCode?: number | null;
      readonly signal?: NodeJS.Signals | null;
    };

/** Resolve an explicit path on the extension host; never interpret it as shell text. */
export function buildInvocation(request: AnalysisRequest): Invocation {
  const { cliPath, dotnetPath } = request.executable;
  if (request.cwd.trim() === '')
    throw new Error('Invocation directory is empty.');
  if (cliPath !== undefined && cliPath.trim() === '')
    throw new Error('CLI path is empty.');
  if (dotnetPath !== undefined && dotnetPath.trim() === '')
    throw new Error('dotnet path is empty.');

  const cwd = path.resolve(request.cwd);
  const cli =
    cliPath === undefined ? 'crap4csharp' : path.resolve(cwd, cliPath);
  if (cliPath !== undefined && path.extname(cli).toLowerCase() === '.dll') {
    const dotnet =
      dotnetPath === undefined ? 'dotnet' : path.resolve(cwd, dotnetPath);
    return { command: dotnet, args: [cli, '--format', 'json'], cwd };
  }
  return { command: cli, args: ['--format', 'json'], cwd };
}

/** An explicit setting must name a usable file; it never silently falls back to PATH. */
export function validateExecutable(request: AnalysisRequest): void {
  const { cliPath, dotnetPath } = request.executable;
  const check = (configured: string, setting: string, executable: boolean) => {
    const resolved = path.resolve(request.cwd, configured);
    try {
      if (!statSync(resolved).isFile()) throw new Error('not a file');
      accessSync(
        resolved,
        executable && process.platform !== 'win32'
          ? constants.X_OK
          : constants.R_OK,
      );
    } catch {
      throw new Error(
        `${setting} must point to an existing ${executable ? 'executable' : 'file'}: ${resolved}`,
      );
    }
  };
  if (cliPath !== undefined) {
    check(cliPath, 'crapide.cliPath', !cliPath.toLowerCase().endsWith('.dll'));
    if (cliPath.toLowerCase().endsWith('.dll') && dotnetPath !== undefined)
      check(dotnetPath, 'crapide.dotnetPath', true);
  }
}

function unsupportedFormat(stderr: string): boolean {
  return /(?:unknown|unrecognized|unsupported|invalid|unexpected)\s+(?:option|argument).*?(?:--format|format)|(?:--format|format).*?(?:unknown|unrecognized|unsupported|invalid|unexpected)/i.test(
    stderr,
  );
}

export class CliRunner {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly processAdapter: ProcessAdapter = new NodeProcessAdapter(),
  ) {}

  run(request: AnalysisRequest): Promise<AnalysisOutcome> {
    const key = path.resolve(request.cwd);
    const predecessor = this.pending.get(key) ?? Promise.resolve();
    const result = predecessor.then(() => this.runOnce(request));
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.pending.set(key, settled);
    void settled.then(() => {
      if (this.pending.get(key) === settled) this.pending.delete(key);
    });
    return result;
  }

  private async runOnce(request: AnalysisRequest): Promise<AnalysisOutcome> {
    if (request.signal?.aborted)
      return { ok: false, kind: 'cancelled', stderr: '' };

    let invocation: Invocation;
    try {
      invocation = buildInvocation(request);
      validateExecutable(request);
    } catch (error) {
      return {
        ok: false,
        kind: 'configuration',
        stderr: '',
        detail: String(error),
      };
    }

    let process: ProcessResult;
    try {
      process = await this.processAdapter.run(invocation, request.signal);
    } catch (error) {
      return {
        ok: false,
        kind: 'spawn',
        stderr: '',
        detail: String(error),
      };
    }
    if (request.signal?.aborted || process.kind === 'cancelled')
      return { ok: false, kind: 'cancelled', stderr: process.stderr };
    if (process.kind !== 'exited') {
      const missing =
        process.kind === 'spawn' && process.errorCode === 'ENOENT';
      return {
        ok: false,
        kind: missing
          ? request.executable.cliPath?.toLowerCase().endsWith('.dll')
            ? 'missing-runtime'
            : 'missing-cli'
          : process.kind,
        stderr: process.stderr,
        detail: process.error,
      };
    }
    if (process.code === 1 && unsupportedFormat(process.stderr))
      return {
        ok: false,
        kind: 'unsupported-format',
        stderr: process.stderr,
        exitCode: process.code,
      };
    if (
      process.code === 1 &&
      /compatible \.NET SDK was not found|requested SDK version|SDK specified in global\.json/i.test(
        process.stderr,
      )
    )
      return {
        ok: false,
        kind: 'missing-sdk',
        stderr: process.stderr,
        exitCode: process.code,
      };
    if (process.code === 1)
      return {
        ok: false,
        kind: 'fatal-exit',
        stderr: process.stderr,
        exitCode: process.code,
      };
    if (process.code !== 0 && process.code !== 2)
      return {
        ok: false,
        kind: 'unexpected-exit',
        stderr: process.stderr,
        exitCode: process.code,
        signal: process.signal,
      };
    const parsed = parseJsonReport(process.stdout);
    if (!parsed.ok)
      return {
        ok: false,
        kind: 'protocol',
        stderr: process.stderr,
        parseFailure: parsed.error,
        exitCode: process.code,
      };
    return {
      ok: true,
      report: parsed.report,
      thresholdExceeded: process.code === 2,
      exitCode: process.code,
      stderr: process.stderr,
    };
  }
}

export interface NodeProcessAdapterOptions {
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
}

/** The process group is the cleanup unit on POSIX; taskkill /T covers Windows descendants. */
export class NodeProcessAdapter implements ProcessAdapter {
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;

  constructor(options: NodeProcessAdapterOptions = {}) {
    this.maxStdoutBytes = options.maxStdoutBytes ?? 8 * 1024 * 1024;
    this.maxStderrBytes = options.maxStderrBytes ?? 1024 * 1024;
    if (this.maxStdoutBytes < 1 || this.maxStderrBytes < 1)
      throw new Error('Output limits must be positive.');
  }

  run(invocation: Invocation, signal?: AbortSignal): Promise<ProcessResult> {
    if (signal?.aborted)
      return Promise.resolve({ kind: 'cancelled', stderr: '' });

    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(invocation.command, [...invocation.args], {
          cwd: invocation.cwd,
          shell: false,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (error) {
        resolve({ kind: 'spawn', stderr: '', error: String(error) });
        return;
      }

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stopped: 'cancelled' | 'output-limit' | undefined;
      let spawnError: NodeJS.ErrnoException | undefined;

      const stop = (reason: 'cancelled' | 'output-limit'): void => {
        if (stopped !== undefined) return;
        stopped = reason;
        terminateTree(child);
      };
      const onAbort = (): void => stop('cancelled');
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) stop('cancelled');

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stopped !== undefined) return;
        stdoutBytes += chunk.length;
        if (stdoutBytes > this.maxStdoutBytes) stop('output-limit');
        else stdout.push(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stopped !== undefined) return;
        stderrBytes += chunk.length;
        if (stderrBytes > this.maxStderrBytes) stop('output-limit');
        else stderr.push(chunk);
      });
      child.on('error', (error) => {
        spawnError = error;
      });
      child.on('close', (code, exitSignal) => {
        signal?.removeEventListener('abort', onAbort);
        const boundedStderr = Buffer.concat(stderr).toString('utf8');
        if (stopped !== undefined) {
          resolve({ kind: stopped, stderr: boundedStderr });
        } else if (spawnError !== undefined) {
          resolve({
            kind: 'spawn',
            stderr: boundedStderr,
            error: String(spawnError),
            errorCode: spawnError.code,
          });
        } else {
          resolve({
            kind: 'exited',
            code,
            signal: exitSignal,
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: boundedStderr,
          });
        }
      });
    });
  }
}

function terminateTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    const cleanup = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    cleanup.on('error', () => child.kill());
    cleanup.on('close', (code) => {
      if (code !== 0) child.kill();
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}
