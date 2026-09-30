import { readFileSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { JsonMember, JsonReport } from './jsonReport';

export interface SourceLocation {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export type UnlocatedReason =
  | 'missing-location'
  | 'invalid-path'
  | 'outside-workspace'
  | 'missing-file'
  | 'invalid-lines';

export interface ResolvedMember {
  readonly member: JsonMember;
  readonly location: SourceLocation | null;
  readonly unlocatedReason: UnlocatedReason | null;
}

export interface FolderSnapshot {
  readonly folderPath: string;
  readonly members: readonly ResolvedMember[];
  readonly thresholdExceeded: boolean;
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function unlocated(
  member: JsonMember,
  reason: UnlocatedReason,
): ResolvedMember {
  return Object.freeze({
    member: Object.freeze({ ...member }),
    location: null,
    unlocatedReason: reason,
  });
}

function locateMember(
  member: JsonMember,
  folderPath: string,
  realFolderPath: string,
): ResolvedMember {
  if (member.file === null || member.startLine === null)
    return unlocated(member, 'missing-location');

  // The CLI uses '/' separators. Also tolerate relative '\\' separators when
  // consuming a report produced on another host; reject foreign absolute paths.
  const file = member.file.replace(/[\\/]/g, path.sep);
  if (
    (process.platform !== 'win32' &&
      (/^[A-Za-z]:[\\/]/.test(member.file) ||
        member.file.startsWith('\\\\'))) ||
    file.split(path.sep).includes('..') ||
    path.extname(file).toLowerCase() !== '.cs'
  )
    return unlocated(member, 'invalid-path');

  const candidate = path.resolve(folderPath, file);
  if (!within(folderPath, candidate))
    return unlocated(member, 'outside-workspace');

  let realFile: string;
  try {
    realFile = realpathSync.native(candidate);
    if (!statSync(realFile).isFile()) return unlocated(member, 'missing-file');
  } catch {
    return unlocated(member, 'missing-file');
  }
  if (!within(realFolderPath, realFile))
    return unlocated(member, 'outside-workspace');

  let lines: string[];
  try {
    lines = readFileSync(realFile, 'utf8').split(/\r\n|\n|\r/);
  } catch {
    return unlocated(member, 'missing-file');
  }
  const endLine = member.endLine ?? member.startLine;
  if (
    member.startLine < 1 ||
    endLine < member.startLine ||
    endLine > lines.length
  )
    return unlocated(member, 'invalid-lines');

  return Object.freeze({
    member: Object.freeze({ ...member }),
    location: Object.freeze({
      filePath: candidate,
      startLine: member.startLine - 1,
      endLine: endLine - 1,
      endColumn: lines[endLine - 1].length,
    }),
    unlocatedReason: null,
  });
}

/** Resolve saved source locations without VS Code APIs or guessed syntax spans. */
export function resolveReport(
  report: JsonReport,
  folderPath: string,
  thresholdExceeded: boolean,
): FolderSnapshot {
  const absoluteFolder = path.resolve(folderPath);
  const realFolder = realpathSync.native(absoluteFolder);
  return Object.freeze({
    folderPath: absoluteFolder,
    thresholdExceeded,
    members: Object.freeze(
      report.members.map((member) =>
        locateMember(member, absoluteFolder, realFolder),
      ),
    ),
  });
}
