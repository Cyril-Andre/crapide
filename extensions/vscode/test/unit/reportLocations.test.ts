import * as assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { JsonMember } from '../../src/jsonReport';
import { resolveReport } from '../../src/reportLocations';

function member(overrides: Partial<JsonMember> = {}): JsonMember {
  return {
    name: 'Demo.Sample.Check',
    file: 'src/Sample.cs',
    startLine: 1,
    endLine: 3,
    complexity: 3,
    coveragePercent: 0,
    crap: 12,
    ...overrides,
  };
}

function fixture(): { root: string; file: string; dispose: () => void } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'crapide-locations-'));
  mkdirSync(path.join(root, 'src'));
  const file = path.join(root, 'src', 'Sample.cs');
  writeFileSync(file, 'first\nsecond\nthird\n');
  return {
    root,
    file,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('resolves relative, alternate-separator, and absolute local paths', () => {
  const testFolder = fixture();
  try {
    const snapshot = resolveReport(
      {
        members: [
          member(),
          member({ file: 'src\\Sample.cs', name: 'Demo.Sample.Other' }),
          member({ file: testFolder.file, name: 'Demo.Sample.Absolute' }),
        ],
      },
      testFolder.root,
      true,
    );
    assert.equal(snapshot.thresholdExceeded, true);
    assert.equal(snapshot.members.length, 3);
    for (const resolved of snapshot.members) {
      assert.equal(resolved.location?.filePath, testFolder.file);
      assert.equal(resolved.location?.startLine, 0);
      assert.equal(resolved.location?.endLine, 2);
      assert.equal(resolved.location?.endColumn, 5);
    }
    assert.equal(Object.isFrozen(snapshot), true);
    assert.equal(Object.isFrozen(snapshot.members), true);
    assert.equal(Object.isFrozen(snapshot.members[0].member), true);
  } finally {
    testFolder.dispose();
  }
});

test('keeps threshold, nullable and duplicate records without inventing locations', () => {
  const testFolder = fixture();
  try {
    const snapshot = resolveReport(
      {
        members: [
          member({ crap: 8, coveragePercent: 0 }),
          member({ crap: 12, coveragePercent: null }),
          member({ crap: null, file: null }),
          member({ crap: 12, startLine: null }),
        ],
      },
      testFolder.root,
      false,
    );
    assert.equal(snapshot.members.length, 4);
    assert.equal(snapshot.members[0].member.crap, 8);
    assert.equal(snapshot.members[1].member.coveragePercent, null);
    assert.equal(snapshot.members[2].location, null);
    assert.equal(snapshot.members[2].unlocatedReason, 'missing-location');
    assert.equal(snapshot.members[3].location, null);
    assert.equal(snapshot.members[3].unlocatedReason, 'missing-location');
  } finally {
    testFolder.dispose();
  }
});

test('rejects traversal, files outside the folder, and non-C# files', () => {
  const testFolder = fixture();
  const outside = mkdtempSync(path.join(os.tmpdir(), 'crapide-outside-'));
  try {
    const outsideFile = path.join(outside, 'Other.cs');
    writeFileSync(outsideFile, 'one\ntwo\nthree');
    const snapshot = resolveReport(
      {
        members: [
          member({ file: '../outside.cs' }),
          member({ file: outsideFile }),
          member({ file: 'src/Sample.txt' }),
        ],
      },
      testFolder.root,
      false,
    );
    assert.deepEqual(
      snapshot.members.map((item) => item.unlocatedReason),
      ['invalid-path', 'outside-workspace', 'invalid-path'],
    );
  } finally {
    testFolder.dispose();
    rmSync(outside, { recursive: true, force: true });
  }
});

test('rejects symlinks escaping the folder', () => {
  const testFolder = fixture();
  const outside = mkdtempSync(path.join(os.tmpdir(), 'crapide-outside-'));
  try {
    const outsideFile = path.join(outside, 'Other.cs');
    writeFileSync(outsideFile, 'one\ntwo\nthree');
    symlinkSync(outsideFile, path.join(testFolder.root, 'src', 'Escaped.cs'));
    const snapshot = resolveReport(
      { members: [member({ file: 'src/Escaped.cs' })] },
      testFolder.root,
      false,
    );
    assert.equal(snapshot.members[0].unlocatedReason, 'outside-workspace');
  } finally {
    testFolder.dispose();
    rmSync(outside, { recursive: true, force: true });
  }
});

test('rejects missing, moved and shortened files', () => {
  const testFolder = fixture();
  try {
    const missing = resolveReport(
      { members: [member({ file: 'src/Missing.cs' })] },
      testFolder.root,
      false,
    );
    assert.equal(missing.members[0].unlocatedReason, 'missing-file');

    writeFileSync(testFolder.file, 'only one line');
    const edited = resolveReport(
      { members: [member()] },
      testFolder.root,
      false,
    );
    assert.equal(edited.members[0].unlocatedReason, 'invalid-lines');

    renameSync(testFolder.file, path.join(testFolder.root, 'src', 'Moved.cs'));
    const moved = resolveReport(
      { members: [member()] },
      testFolder.root,
      false,
    );
    assert.equal(moved.members[0].unlocatedReason, 'missing-file');
  } finally {
    testFolder.dispose();
  }
});

test(
  'rejects foreign Windows absolute paths on POSIX',
  {
    skip: process.platform === 'win32',
  },
  () => {
    const testFolder = fixture();
    try {
      const snapshot = resolveReport(
        { members: [member({ file: 'C:\\other\\Sample.cs' })] },
        testFolder.root,
        false,
      );
      assert.equal(snapshot.members[0].unlocatedReason, 'invalid-path');
    } finally {
      testFolder.dispose();
    }
  },
);
