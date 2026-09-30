const assert = require('node:assert/strict');
const {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CliRunner } = require('../../extensions/vscode/dist/src/cliRunner');

async function main() {
  const cliPath = process.argv[2];
  if (!cliPath || !path.isAbsolute(cliPath)) {
    throw new Error(
      'Pass an absolute path to a prebuilt CLI executable or .dll.',
    );
  }
  const root = mkdtempSync(path.join(os.tmpdir(), 'crapide-p7-real-'));
  const runner = new CliRunner();
  const fixture = path.join(__dirname, 'fixture');
  const create = (name) => {
    const cwd = path.join(root, name);
    cpSync(fixture, cwd, { recursive: true });
    return cwd;
  };

  try {
    const good = create('exit-0');
    const normal = await runner.run({ cwd: good, executable: { cliPath } });
    assert.equal(normal.ok, true, JSON.stringify(normal));
    assert.equal(normal.exitCode, 0);
    assert.ok(normal.report.members.length > 0);

    const threshold = create('exit-2');
    const source = path.join(threshold, 'src/Demo/Calculator.cs');
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
    const exceeded = await runner.run({
      cwd: threshold,
      executable: { cliPath },
    });
    assert.equal(exceeded.ok, true, JSON.stringify(exceeded));
    assert.equal(exceeded.exitCode, 2);
    assert.ok(
      exceeded.report.members.some(
        (member) => member.name.includes('Risky') && (member.crap ?? 0) > 8,
      ),
    );

    const fatal = create('exit-1');
    rmSync(path.join(fatal, 'tests'), { recursive: true });
    const failed = await runner.run({ cwd: fatal, executable: { cliPath } });
    assert.equal(failed.ok, false);
    assert.equal(failed.kind, 'fatal-exit');
    assert.match(failed.stderr, /No test project was found/);
    process.stdout.write(
      'Real CLI: exit 0, exit 2 and fatal exit 1 passed in disposable projects.\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});
