const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { cpSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cliArgument = process.argv[2];
if (!cliArgument || !path.isAbsolute(cliArgument)) {
  console.error(
    'Usage: node test/e2e/json-contract-smoke.cjs /absolute/path/to/CLI-or-DLL',
  );
  process.exitCode = 2;
} else {
  const {
    parseJsonReport,
  } = require('../../extensions/vscode/dist/src/jsonReport.js');
  const expectedPath = path.resolve(
    __dirname,
    '../../contracts/fixtures/json/valid/real-analysis.json',
  );
  const expected = parseJsonReport(readFileSync(expectedPath, 'utf8'));
  assert.equal(expected.ok, true, 'The checked-in fixture must parse');

  const temporaryRoot = mkdtempSync(
    path.join(os.tmpdir(), 'crapide-json-smoke-'),
  );
  try {
    cpSync(path.join(__dirname, 'fixture'), temporaryRoot, { recursive: true });
    const isDll = cliArgument.toLowerCase().endsWith('.dll');
    const result = spawnSync(
      isDll ? 'dotnet' : cliArgument,
      isDll ? [cliArgument, '--format', 'json'] : ['--format', 'json'],
      {
        cwd: temporaryRoot,
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      `CLI exit ${result.status}: ${result.stderr}`,
    );

    const actual = parseJsonReport(result.stdout);
    assert.equal(
      actual.ok,
      true,
      actual.ok ? '' : `${actual.error.path}: ${actual.error.message}`,
    );
    assert.deepEqual(actual.report.members, expected.report.members);
    console.log(
      'CLI JSON matches the real-analysis fixture by semantic member fields.',
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
