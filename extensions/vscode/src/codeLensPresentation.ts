import type { ResolvedMember } from './reportLocations';

export interface CodeLensPresentation {
  readonly line: number;
  readonly title: string;
  readonly tooltip: string;
}

function value(metric: number | null): string {
  return metric === null ? 'N/A' : String(metric);
}

/** Keep each CLI record separate, including overloads at the same line. */
export function presentCodeLenses(
  members: readonly ResolvedMember[],
): readonly CodeLensPresentation[] {
  const located = members.filter(
    (
      item,
    ): item is ResolvedMember & {
      location: NonNullable<ResolvedMember['location']>;
    } => item.location !== null,
  );
  const lineCounts = new Map<number, number>();
  for (const item of located) {
    const line = item.location.startLine;
    lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);
  }
  const lineOrdinals = new Map<number, number>();
  return located.map(({ member, location }) => {
    const line = location.startLine;
    const count = lineCounts.get(line) ?? 1;
    const ordinal = (lineOrdinals.get(line) ?? 0) + 1;
    lineOrdinals.set(line, ordinal);
    const name =
      count > 1 ? `${member.name} (${ordinal}/${count})` : member.name;
    const coverage =
      member.coveragePercent === null ? 'N/A' : `${member.coveragePercent}%`;
    const metrics = `CRAP ${value(member.crap)} · CC ${value(member.complexity)} · Coverage ${coverage}`;
    return {
      line,
      title: count > 1 ? `${metrics} · ${name}` : metrics,
      tooltip: `Open ${name} at line ${line + 1}`,
    };
  });
}
