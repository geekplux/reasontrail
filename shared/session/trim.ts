// Trim a normalized session to a step range (CLI `--trim <from>:<to>`). Pure and deterministic.
import { buildSteps } from './build/steps';
import type { NormalizedSession, Step } from './types';

export interface StepRange {
  /** First step seq of the untrimmed graph, inclusive. */
  from: number;
  /** Last step seq of the untrimmed graph, inclusive. */
  to: number;
}

const key = (file: string, line: number) => `${file}\n${line}`;

/**
 * Keep only the records whose steps fall in `range` (steps `s<from>`…`s<to>` of the untrimmed graph); a record that
 * yields several steps is kept whole. Chained records without content stay when they lie inside a kept stretch of
 * their file, so parent links still resolve. Lanes without kept records are dropped (the first lane always stays).
 * Parse stats are limited to the kept stretches. The title is the custom title when the range starts at 0, else the first kept user request (main lane first, then
 * the earliest in any lane).
 */
export function trimSession(session: NormalizedSession, range: StepRange): NormalizedSession {
  const steps = buildSteps(session).steps.filter((s) => s.seq >= range.from && s.seq <= range.to);
  const keep = new Set<string>();
  const span = new Map<string, [number, number]>();
  for (const s of steps) {
    keep.add(key(s.raw.file, s.raw.line));
    const [lo, hi] = span.get(s.raw.file) ?? [s.raw.line, s.raw.line];
    span.set(s.raw.file, [Math.min(lo, s.raw.line), Math.max(hi, s.raw.line)]);
  }
  const records = session.records.filter((r) => {
    if (keep.has(key(r.file, r.line))) return true;
    const sp = span.get(r.file);
    return r.items.length === 0 && sp !== undefined && r.line >= sp[0] && r.line <= sp[1];
  });
  const used = new Set(records.map((r) => r.laneId));
  const main = session.lanes[0]?.id;
  // Parse counts follow the range, so a trim of a file that is still growing stays byte-identical. Unknown and ignored
  // records carry no position, so a trimmed session reports none.
  const skipped = session.stats.skippedLineNumbers.filter((p) => {
    const sp = span.get(p.file);
    return sp !== undefined && p.line >= sp[0] && p.line <= sp[1];
  });
  const stats = { ...session.stats, skippedLines: skipped.length, partialLines: 0, skippedLineNumbers: skipped, unknownRecords: 0, ignoredRecords: 0 };
  const out: NormalizedSession = { ...session, lanes: session.lanes.filter((l) => l.id === main || used.has(l.id)), records, stats };
  delete out.title;
  const isUser = (s: Step) => s.kind === 'user' && Boolean(s.text?.trim());
  const first = steps.find((s) => isUser(s) && s.laneId === main) ?? steps.find(isUser);
  const title = range.from === 0 && session.title ? session.title : first?.text;
  if (title) out.title = title;
  return out;
}

/** Parse `<from>:<to>` (non-negative integers, from ≤ to). */
export function parseStepRange(text: string): StepRange | undefined {
  const m = /^(\d+):(\d+)$/.exec(text.trim());
  if (!m) return undefined;
  const from = Number(m[1]);
  const to = Number(m[2]);
  return from <= to ? { from, to } : undefined;
}
