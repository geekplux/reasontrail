// Show raw (PLAN M3, DESIGN §8.10): attach each record's verbatim text to the first step it produced, capped. Pure.
import { RAW_TEXT_MAX, type SessionGraph, type SourceFile } from './types';

/** `text` cut to `max` chars with a note saying how much was left out. */
export function clipRaw(text: string, max = RAW_TEXT_MAX): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} more characters at this line of the file]`;
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
    return { ...s, rawText: clipRaw(opts.redact ? opts.redact(line) : line, opts.max) };
  });
  return { ...graph, steps };
}
