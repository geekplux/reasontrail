// Tolerant JSONL reader: never throws, counts what it cannot read.

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
}

/** Parse JSONL text. Blank lines are skipped; `\r\n` is accepted. */
export function readJsonl(text: string): JsonlResult {
  const lines = text.split('\n');
  const endsComplete = text.endsWith('\n');
  const records: JsonlRecord[] = [];
  let malformed = 0;
  let partial = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') continue;
    try {
      records.push({ line: i + 1, value: JSON.parse(line) as unknown });
    } catch {
      if (i === lines.length - 1 && !endsComplete) partial++;
      else malformed++;
    }
  }
  return { records, malformed, partial };
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
