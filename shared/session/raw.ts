// Show raw (PLAN M3, DESIGN §8.10): attach each record's verbatim text to the first step it produced, capped. Pure.
import { RAW_TEXT_MAX, type Provenance, type SessionGraph, type SourceFile } from './types';

/** The note that ends a cut raw record, inside its `<pre>`: "[cut 120 characters; full record at x.jsonl:12]". */
export const cutNote = (n: number, at: Pick<Provenance, 'file' | 'line'>) => `[cut ${n} characters; full record at ${at.file}:${at.line}]`;

/** `text` cut to `max` chars, followed on its own line by a {@link cutNote} saying how much was left out and where. */
export function clipRaw(text: string, at: Pick<Provenance, 'file' | 'line'>, max = RAW_TEXT_MAX): string {
  return text.length <= max ? text : `${text.slice(0, max)}…\n${cutNote(text.length - max, at)}`;
}

/**
 * A copy of `graph` whose first step of each record carries `rawText`: the record's line from `files`, passed through
 * `redact` (shared copies) before it is clipped, so a clip never ends in a cut-off secret no rule matches.
 */
export function attachRaw(graph: SessionGraph, files: readonly SourceFile[], opts: { max?: number; redact?: (text: string) => string } = {}): SessionGraph {
  const lines = new Map(files.map((f) => [f.path, f.text.split('\n')]));
  const seen = new Set<string>();
  const steps = graph.steps.map((s) => {
    const key = `${s.raw.file}\n${s.raw.line}`;
    if (seen.has(key)) return s;
    seen.add(key);
    const line = lines.get(s.raw.file)?.[s.raw.line - 1]?.replace(/\r$/, '');
    if (line === undefined || line.trim() === '') return s;
    return { ...s, rawText: clipRaw(opts.redact ? opts.redact(line) : line, s.raw, opts.max) };
  });
  return { ...graph, steps };
}
