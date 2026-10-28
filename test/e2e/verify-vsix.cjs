const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const archive = process.argv[2];
if (!archive) throw new Error('Pass the path to a built VSIX.');

const file = path.resolve(archive);
const entries = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' })
  .trim()
  .split('\n');
const required = [
  'extension/package.json',
  'extension/LICENSE.txt',
  'extension/readme.md',
  'extension/changelog.md',
  'extension/dist/src/extension.js',
];
for (const entry of required)
  assert.ok(entries.includes(entry), `Missing ${entry}`);

const allowed =
  /^(?:\[Content_Types\]\.xml|extension\.vsixmanifest|extension\/(?:package\.json|LICENSE\.txt|readme\.md|changelog\.md|dist\/src\/[A-Za-z]+\.js))$/;
for (const entry of entries) {
  assert.match(entry, allowed, `Unexpected package entry: ${entry}`);
}

const manifest = JSON.parse(
  execFileSync('unzip', ['-p', file, 'extension/package.json'], {
    encoding: 'utf8',
  }),
);
assert.equal(path.basename(file), `${manifest.name}-${manifest.version}.vsix`);
assert.equal(manifest.main, './dist/src/extension.js');
process.stdout.write(
  `Verified ${file}: ${entries.length} approved entries, no CLI or source files.\n`,
);
