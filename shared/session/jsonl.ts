// Tolerant JSONL reader: never throws, counts what it cannot read.
import { SKIPPED_LINES_MAX, type SessionStats } from './types';

/** One parsed line. */
export interface JsonlRecord {
  /** 1-based line number. */
  line: number;
  value: unknown;
}

export interface JsonlResult {
  records: JsonlRecord[];
  /** Lines that are not valid JSON (excluding a partial last line). */
  malformed: number;
  /** 1 when the file does not end in a newline and its last line does not parse (still being written). */
  partial: number;
  /** 1-based numbers of the lines counted in `malformed` and `partial`, in file order. */
  skipped: number[];
}

/** Parse JSONL text. Blank lines are skipped; `\r\n` is accepted. */
export function readJsonl(text: string): JsonlResult {
  const lines = text.split('\n');
  const endsComplete = text.endsWith('\n');
  const records: JsonlRecord[] = [];
  let malformed = 0;
  let partial = 0;
  const skipped: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') continue;
    try {
      records.push({ line: i + 1, value: JSON.parse(line) as unknown });
    } catch {
      skipped.push(i + 1);
      if (i === lines.length - 1 && !endsComplete) partial++;
      else malformed++;
    }
  }
  return { records, malformed, partial, skipped };
}

/** The first `n` non-blank lines, for adapter sniffing. */
export function firstLines(text: string, n = 5): string[] {
  const out: string[] = [];
  let start = 0;
  while (out.length < n && start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end).trim();
    if (line) out.push(line);
    start = end + 1;
  }
  return out;
}

/** Add one file's unreadable lines to adapter stats (shared by the adapters). */
export function countSkipped(stats: Omit<SessionStats, 'steps' | 'durationMs'>, file: string, r: JsonlResult): void {
  stats.skippedLines += r.malformed + r.partial;
  stats.partialLines += r.partial;
  for (const line of r.skipped) if (stats.skippedLineNumbers.length < SKIPPED_LINES_MAX) stats.skippedLineNumbers.push({ file, line });
}
