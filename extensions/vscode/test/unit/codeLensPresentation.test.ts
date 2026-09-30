import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { presentCodeLenses } from '../../src/codeLensPresentation';
import type { ResolvedMember } from '../../src/reportLocations';

function located(
  name: string,
  line: number,
  overrides: Partial<ResolvedMember['member']> = {},
): ResolvedMember {
  return {
    member: {
      name,
      file: 'src/Sample.cs',
      startLine: line + 1,
      endLine: line + 1,
      complexity: 3,
      coveragePercent: 0,
      crap: 12.25,
      ...overrides,
    },
    location: {
      filePath: '/tmp/Sample.cs',
      startLine: line,
      endLine: line,
      endColumn: 10,
    },
    unlocatedReason: null,
  };
}

test('formats supplied values and anchors at zero-based start line', () => {
  assert.deepEqual(presentCodeLenses([located('Demo.Check', 0)]), [
    {
      line: 0,
      title: 'CRAP 12.25 · CC 3 · Coverage 0%',
      tooltip: 'Open Demo.Check at line 1',
    },
  ]);
});

test('uses N/A for nulls without adding a percent sign', () => {
  assert.deepEqual(
    presentCodeLenses([
      located('Demo.Uncovered', 4, { crap: null, coveragePercent: null }),
    ])[0],
    {
      line: 4,
      title: 'CRAP N/A · CC 3 · Coverage N/A',
      tooltip: 'Open Demo.Uncovered at line 5',
    },
  );
});

test('keeps same-line overloads distinct and omits unlocated records', () => {
  const first = located('Demo.Check', 2);
  const second = located('Demo.Check', 2, { crap: 15 });
  const missing: ResolvedMember = {
    ...located('Demo.Missing', 2),
    location: null,
    unlocatedReason: 'missing-file',
  };
  assert.deepEqual(presentCodeLenses([first, missing, second]), [
    {
      line: 2,
      title: 'CRAP 12.25 · CC 3 · Coverage 0% · Demo.Check (1/2)',
      tooltip: 'Open Demo.Check (1/2) at line 3',
    },
    {
      line: 2,
      title: 'CRAP 15 · CC 3 · Coverage 0% · Demo.Check (2/2)',
      tooltip: 'Open Demo.Check (2/2) at line 3',
    },
  ]);
});
