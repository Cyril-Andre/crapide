/** Values supplied by the CLI. Invocation context and editor locations live elsewhere. */
export interface JsonMember {
  readonly name: string;
  readonly file: string | null;
  readonly startLine: number | null;
  readonly endLine: number | null;
  readonly complexity: number;
  readonly coveragePercent: number | null;
  readonly crap: number | null;
}

export interface JsonReport {
  readonly members: readonly JsonMember[];
}

export interface ParseFailure {
  readonly kind: 'syntax' | 'shape';
  readonly path: string;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly report: JsonReport }
  | { readonly ok: false; readonly error: ParseFailure };

class ShapeError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

function invalid(path: string, message: string): never {
  throw new ShapeError(path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, 'Expected an object.');
  }
  return value as Record<string, unknown>;
}

function field(
  value: Record<string, unknown>,
  key: string,
  path: string,
): unknown {
  if (!Object.hasOwn(value, key)) {
    invalid(path, 'Missing required field.');
  }
  return value[key];
}

function nonemptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(path, 'Expected a nonempty string.');
  }
  return value as string;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : nonemptyString(value, path);
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    invalid(path, 'Expected a positive safe integer.');
  }
  return value as number;
}

function nullableLine(value: unknown, path: string): number | null {
  return value === null ? null : positiveInteger(value, path);
}

function nullableNumberInRange(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) {
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalid(
      path,
      `Expected a finite number in [${minimum}, ${maximum}] or null.`,
    );
  }
  return value as number;
}

function nullableCrap(value: unknown, path: string): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    invalid(path, 'Expected a finite number of at least 1 or null.');
  }
  return value as number;
}

function member(value: unknown, path: string): JsonMember {
  const input = record(value, path);
  const startLine = nullableLine(
    field(input, 'startLine', `${path}.startLine`),
    `${path}.startLine`,
  );
  const endLine = nullableLine(
    field(input, 'endLine', `${path}.endLine`),
    `${path}.endLine`,
  );
  if (startLine !== null && endLine !== null && endLine < startLine) {
    invalid(`${path}.endLine`, 'End line must not precede start line.');
  }

  return {
    name: nonemptyString(field(input, 'name', `${path}.name`), `${path}.name`),
    file: nullableString(field(input, 'file', `${path}.file`), `${path}.file`),
    startLine,
    endLine,
    complexity: positiveInteger(
      field(input, 'complexity', `${path}.complexity`),
      `${path}.complexity`,
    ),
    coveragePercent: nullableNumberInRange(
      field(input, 'coveragePercent', `${path}.coveragePercent`),
      `${path}.coveragePercent`,
      0,
      100,
    ),
    crap: nullableCrap(field(input, 'crap', `${path}.crap`), `${path}.crap`),
  };
}

/** Parse CLI stdout without VS Code APIs, filesystem access, or metric calculation. */
export function parseJsonReport(document: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(document) as unknown;
  } catch {
    return {
      ok: false,
      error: { kind: 'syntax', path: '$', message: 'Invalid JSON document.' },
    };
  }

  try {
    const input = record(parsed, '$');
    const members = field(input, 'members', '$.members');
    if (!Array.isArray(members)) {
      invalid('$.members', 'Expected an array.');
    }
    return {
      ok: true,
      report: {
        members: members.map((value: unknown, index: number) =>
          member(value, `$.members[${index}]`),
        ),
      },
    };
  } catch (error) {
    if (error instanceof ShapeError) {
      return {
        ok: false,
        error: { kind: 'shape', path: error.path, message: error.message },
      };
    }
    throw error;
  }
}
