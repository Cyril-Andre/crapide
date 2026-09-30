const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CliRunner } = require('../../extensions/vscode/dist/src/cliRunner');

async function main() {
  const cliPath = process.argv[2];
  if (!cliPath || path.extname(cliPath).toLowerCase() !== '.dll') {
    throw new Error('Pass the absolute path to a prebuilt crap4csharp .dll.');
  }
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'crapide-p4-smoke-'));
  try {
    const outcome = await new CliRunner().run({
      cwd,
      executable: { cliPath },
    });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.equal(outcome.exitCode, 0);
    assert.deepEqual(outcome.report.members, []);
    process.stdout.write(
      'CLI runner smoke passed: exit 0, empty JSON report.\n',
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});
