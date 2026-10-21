// Show raw (PLAN M3, DESIGN §8.10): attach each record's verbatim text to the first step it produced, capped. Pure.
import { RAW_TEXT_MAX, type Provenance, type SessionGraph, type SourceFile } from './types';

/** Smallest per-record cap the total budget may push {@link RAW_TEXT_MAX} down to. */
export const RAW_TEXT_MIN = 256;
/** Budget for all raw records of one map, in chars, cut notes included. */
export const RAW_TOTAL_MAX = 6_000_000;
/** Extra chars redacted past the cap so a secret that straddles the cap is still seen whole by the rules. */
export const RAW_REDACT_MARGIN = 512;

/** The note that ends a cut raw record, inside its `<pre>`: "[cut 120 characters; full record at x.jsonl:12]". */
export const cutNote = (n: number, at: Pick<Provenance, 'file' | 'line'>) => `[cut ${n} characters; full record at ${at.file}:${at.line}]`;

/**
 * `text` cut to `max` chars, followed on its own line by a {@link cutNote} saying how much was left out and where.
 * `length` is the whole record's length when `text` is only its head.
 */
export function clipRaw(text: string, at: Pick<Provenance, 'file' | 'line'>, max = RAW_TEXT_MAX, length = text.length): string {
  return length <= max ? text : `${text.slice(0, max)}…\n${cutNote(length - max, at)}`;
}

/** A raw record for {@link rawCap}: its full length and the length of its cut note ("…\n[cut …]") if it is cut. */
export interface RawSize {
  length: number;
  note: number;
}

/**
 * The per-record cap for these records: `max`, or lowered uniformly (but not below `min`) until every record's kept
 * text plus the cut notes fits in `total`. Deterministic (a binary search that only settles on a cap it checked).
 */
export function rawCap(records: readonly RawSize[], opts: { max?: number; min?: number; total?: number } = {}): number {
  const { max = RAW_TEXT_MAX, min = Math.min(RAW_TEXT_MIN, max), total = RAW_TOTAL_MAX } = opts;
  const cost = (cap: number) => records.reduce((sum, r) => sum + (r.length <= cap ? r.length : cap + r.note), 0);
  if (cost(max) <= total) return max;
  let lo = min;
  let hi = max - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cost(mid) <= total) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const TOKEN = /[A-Za-z0-9+/=_.~%-]/;
const PLACEHOLDER = /^\[(?:secret:[a-z-]+|email)\]/;

/**
 * `line` redacted and cut to `max`, without redacting all of a long line: only the first `max` +
 * {@link RAW_REDACT_MARGIN} chars go through `redact`, then the result is cut. A placeholder split by the cut is kept
 * whole; a token that runs from the cut to the end of the redacted window (a secret too long for the rules to see whole)
 * is left out entirely; and the kept part is redacted once more, since a fragment can match a rule its whole did not
 * (a cut base64 blob). So a cut never shows part of a secret. `length` is the whole record's when `line` is its head.
 */
export function clipRedacted(line: string, at: Pick<Provenance, 'file' | 'line'>, max: number, redact: (text: string) => string, length = line.length): string {
  const windowLen = max + RAW_REDACT_MARGIN;
  const windowed = length > windowLen;
  const r = redact(windowed ? line.slice(0, windowLen) : line);
  if (!windowed && r.length <= max) return r;
  let kept = Math.min(max, r.length);
  const open = r.lastIndexOf('[', kept - 1);
  const placeholder = open >= 0 && open > r.lastIndexOf(']', kept - 1) ? PLACEHOLDER.exec(r.slice(open, open + 40)) : null;
  if (placeholder) kept = Math.max(kept, open + placeholder[0].length);
  else if (windowed && TOKEN.test(r[kept - 1] ?? '') && TOKEN.test(r[kept] ?? '')) {
    let end = kept;
    while (end < r.length && TOKEN.test(r[end] ?? '')) end++;
    if (end === r.length) while (kept > 0 && TOKEN.test(r[kept - 1] ?? '')) kept--;
  }
  const left = r.length - kept + (windowed ? length - windowLen : 0);
  return `${redact(r.slice(0, kept))}…\n${cutNote(left, at)}`;
}

/** An exact copy of `s` that does not keep a large parent string (a whole file) alive, as a slice of it would. */
const detach = (s: string): string => (s.length > 64 ? (JSON.parse(JSON.stringify(s)) as string) : s);

/**
 * A copy of `graph` whose first step of each record carries `rawText`: the record's line from `files`, cut to a cap
 * chosen by {@link rawCap} (at most `max`), and in shared copies passed through `redact` by {@link clipRedacted}.
 * Files are read one at a time and only each record's head is kept, so `text` may be a getter that reads from disk.
 */
export function attachRaw(graph: SessionGraph, files: readonly SourceFile[], opts: { max?: number; total?: number; redact?: (text: string) => string } = {}): SessionGraph {
  const { max = RAW_TEXT_MAX, total = RAW_TOTAL_MAX, redact } = opts;
  const keep = max + (redact ? RAW_REDACT_MARGIN : 0);
  const wanted = new Map<string, Map<number, number>>(); // file → line → first step index
  graph.steps.forEach((s, i) => {
    const byLine = wanted.get(s.raw.file) ?? new Map<number, number>();
    wanted.set(s.raw.file, byLine);
    if (!byLine.has(s.raw.line)) byLine.set(s.raw.line, i);
  });
  const found = new Map<number, { head: string; length: number }>();
  for (const f of files) {
    const byLine = wanted.get(f.path);
    if (!byLine) continue;
    const lines = f.text.split('\n');
    for (const [n, i] of byLine) {
      const line = lines[n - 1]?.replace(/\r$/, '');
      if (line !== undefined && line.trim() !== '') found.set(i, { head: detach(line.slice(0, keep)), length: line.length });
    }
    wanted.delete(f.path);
  }
  const sizes = [...found].map(([i, r]) => ({ length: r.length, note: 2 + cutNote(r.length, graph.steps[i]!.raw).length }));
  const cap = rawCap(sizes, { max, total });
  const steps = graph.steps.map((s, i) => {
    const r = found.get(i);
    if (r === undefined) return s;
    return { ...s, rawText: redact ? clipRedacted(r.head, s.raw, cap, redact, r.length) : clipRaw(r.head, s.raw, cap, r.length) };
  });
  return { ...graph, steps };
}
