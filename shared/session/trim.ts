// Trim a normalized session to a step range (CLI `--trim <from>:<to>`, PLAN phase 15). Pure and deterministic.
import { buildSteps } from './build/steps';
import type { NormalizedRecord, NormalizedSession } from './types';

export interface StepRange {
  /** First step seq of the untrimmed graph, inclusive. */
  from: number;
  /** Last step seq of the untrimmed graph, inclusive. */
  to: number;
}

const key = (file: string, line: number) => `${file}\n${line}`;

function firstUserText(records: NormalizedRecord[], laneId?: string): string | undefined {
  for (const r of records) {
    if (laneId !== undefined && r.laneId !== laneId) continue;
    for (const it of r.items) if (it.kind === 'user' && it.text.trim()) return it.text;
  }
  return undefined;
}

/**
 * Keep only the records whose steps fall in `range` (steps `s<from>`…`s<to>` of the untrimmed graph); a record that
 * yields several steps is kept whole. Chained records without content stay when they lie inside a kept stretch of
 * their file, so parent links still resolve. Lanes without kept records are dropped (the first lane always stays).
 * The title is the custom title when the range starts at 0, else the first kept user request (main lane first).
 */
export function trimSession(session: NormalizedSession, range: StepRange): NormalizedSession {
  const { steps } = buildSteps(session);
  const keep = new Set<string>();
  const span = new Map<string, [number, number]>();
  for (const s of steps) {
    if (s.seq < range.from || s.seq > range.to) continue;
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
  const out: NormalizedSession = { ...session, lanes: session.lanes.filter((l) => l.id === main || used.has(l.id)), records };
  delete out.title;
  const title = range.from === 0 && session.title ? session.title : (firstUserText(records, main) ?? firstUserText(records));
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
