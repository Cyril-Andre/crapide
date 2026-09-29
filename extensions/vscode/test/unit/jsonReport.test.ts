import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseJsonReport } from '../../src/jsonReport';

const fixtures = path.resolve(
  __dirname,
  '../../../../..',
  'contracts/fixtures/json',
);

function fixture(group: 'valid' | 'invalid', name: string): string {
  return readFileSync(path.join(fixtures, group, name), 'utf8');
}

for (const name of readdirSync(path.join(fixtures, 'valid')).filter((name) =>
  name.endsWith('.json'),
)) {
  test(`accepts valid fixture ${name}`, () => {
    const result = parseJsonReport(fixture('valid', name));
    assert.equal(result.ok, true, result.ok ? '' : result.error.message);
    if (!result.ok) return;

    const input = JSON.parse(fixture('valid', name)) as {
      members: Record<string, unknown>[];
    };
    assert.equal(result.report.members.length, input.members.length);
    for (const [index, member] of result.report.members.entries()) {
      for (const key of [
        'name',
        'file',
        'startLine',
        'endLine',
        'complexity',
        'coveragePercent',
        'crap',
      ]) {
        assert.deepEqual(
          member[key as keyof typeof member],
          input.members[index][key],
        );
      }
    }
  });
}

const invalidFixtures: Record<
  string,
  { kind: 'syntax' | 'shape'; path: string }
> = {
  'malformed.json': { kind: 'syntax', path: '$' },
  'missing-members.json': { kind: 'shape', path: '$.members' },
  'members-object.json': { kind: 'shape', path: '$.members' },
  'missing-field.json': { kind: 'shape', path: '$.members[0].crap' },
  'wrong-type.json': { kind: 'shape', path: '$.members[0].complexity' },
  'invalid-line.json': { kind: 'shape', path: '$.members[0].startLine' },
  'invalid-range.json': { kind: 'shape', path: '$.members[0].endLine' },
  'invalid-coverage.json': {
    kind: 'shape',
    path: '$.members[0].coveragePercent',
  },
  'invalid-crap.json': { kind: 'shape', path: '$.members[0].crap' },
};

test('every invalid fixture has an expected failure', () => {
  const actual = readdirSync(path.join(fixtures, 'invalid')).filter((name) =>
    name.endsWith('.json'),
  );
  assert.deepEqual(actual.sort(), Object.keys(invalidFixtures).sort());
});

for (const [name, expected] of Object.entries(invalidFixtures)) {
  test(`rejects invalid fixture ${name}`, () => {
    const result = parseJsonReport(fixture('invalid', name));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.kind, expected.kind);
    assert.equal(result.error.path, expected.path);
    assert.ok(result.error.message.length > 0);
  });
}

test('preserves null separately from measured zero and exact threshold', () => {
  const nullable = parseJsonReport(fixture('valid', 'nullable.json'));
  const exact = parseJsonReport(fixture('valid', 'exact-threshold.json'));
  assert.equal(nullable.ok, true);
  assert.equal(exact.ok, true);
  if (!nullable.ok || !exact.ok) return;

  assert.equal(nullable.report.members[0].coveragePercent, 0);
  assert.equal(nullable.report.members[1].coveragePercent, null);
  assert.equal(nullable.report.members[1].crap, null);
  assert.equal(nullable.report.members[2].endLine, null);
  assert.equal(exact.report.members[0].crap, 8);
});

test('preserves duplicates, escaped names, and unrounded numbers', () => {
  const names = parseJsonReport(fixture('valid', 'names.json'));
  const additive = parseJsonReport(fixture('valid', 'additive-fields.json'));
  assert.equal(names.ok, true);
  assert.equal(additive.ok, true);
  if (!names.ok || !additive.ok) return;

  assert.equal(
    names.report.members.filter((member) => member.name === 'Demo.Calc.Add')
      .length,
    2,
  );
  assert.equal(
    names.report.members.filter(
      (member) => member.name === 'Demo.Money.op_Implicit',
    ).length,
    2,
  );
  assert.equal(names.report.members[1].name, 'Demo.Container`1.Read"Value');
  assert.equal(names.report.members[1].file, 'src/a # % café.cs');
  assert.equal(additive.report.members[0].coveragePercent, 99.99999999999999);
  assert.equal(additive.report.members[0].crap, 1.000000000000001);
  assert.deepEqual(Object.keys(additive.report), ['members']);
  assert.equal('futureMemberField' in additive.report.members[0], false);
});

test('validates path strings without resolving them', () => {
  const input = JSON.parse(fixture('valid', 'normal.json')) as {
    members: { file: string }[];
  };
  input.members[0].file = '../outside\\Sample.cs';
  const result = parseJsonReport(JSON.stringify(input));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.report.members[0].file, '../outside\\Sample.cs');
});

test('rejects non-finite numbers, unsafe integers, and empty paths', () => {
  const valid = fixture('valid', 'normal.json');
  const base = JSON.parse(valid) as { members: Record<string, unknown>[] };
  for (const [field, value] of [
    ['complexity', Number.MAX_SAFE_INTEGER + 1],
    ['startLine', 1.5],
    ['file', ''],
    ['name', '  '],
    ['crap', 0],
  ] as const) {
    const copy = structuredClone(base);
    copy.members[0][field] = value;
    const result = parseJsonReport(JSON.stringify(copy));
    assert.equal(result.ok, false, field);
    if (!result.ok) assert.equal(result.error.path, `$.members[0].${field}`);
  }
  const overflow = parseJsonReport(
    valid.replace('"coveragePercent": 75', '"coveragePercent": 1e999'),
  );
  assert.equal(overflow.ok, false);
  if (!overflow.ok)
    assert.equal(overflow.error.path, '$.members[0].coveragePercent');
  assert.equal(parseJsonReport('').ok, false);
  assert.equal(parseJsonReport('[]').ok, false);
});

test('rejects incompatible types for every known member field', () => {
  const base = JSON.parse(fixture('valid', 'normal.json')) as {
    members: Record<string, unknown>[];
  };
  for (const [field, value] of [
    ['name', 7],
    ['file', {}],
    ['startLine', '4'],
    ['endLine', false],
    ['complexity', 2.5],
    ['coveragePercent', '75'],
    ['crap', '2.0625'],
  ] as const) {
    const copy = structuredClone(base);
    copy.members[0][field] = value;
    const result = parseJsonReport(JSON.stringify(copy));
    assert.equal(result.ok, false, field);
    if (!result.ok) assert.equal(result.error.path, `$.members[0].${field}`);
  }
});
