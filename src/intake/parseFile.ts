// Read a dropped session file and build its map, in the parse worker (or on the main thread as a fallback). Pure: no
// DOM, no network. Two streaming passes over `file.stream()`: count lines (for "n of N"), then decode and read.
import { parseSession } from '../../shared/session/adapter';
import { attachRaw } from '../../shared/session/raw';
import type { IntakeResult } from './messages';

const NL = 10;
const PROGRESS_EVERY_MS = 100;

export interface ParseOptions {
  /** Called while reading: `lines` of `total` lines read so far (throttled), and once at the end. */
  onProgress?(lines: number, total: number): void;
  /** Checked between chunks; when it returns true the read stops and the result is `null`. */
  cancelled?(): boolean;
}

async function eachChunk(blob: Blob, fn: (bytes: Uint8Array) => void, cancelled: () => boolean): Promise<boolean> {
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      if (cancelled()) return false;
      const { done, value } = await reader.read();
      if (done) return true;
      fn(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

const countNewlines = (bytes: Uint8Array) => {
  let n = 0;
  for (let i = bytes.indexOf(NL); i >= 0; i = bytes.indexOf(NL, i + 1)) n++;
  return n;
};

/** The file's lines: newlines, plus one for a last line without a newline. */
export async function countLines(blob: Blob, cancelled: () => boolean = () => false): Promise<number | null> {
  let n = 0;
  let last = NL;
  const ok = await eachChunk(blob, (b) => {
    n += countNewlines(b);
    if (b.length) last = b[b.length - 1] as number;
  }, cancelled);
  return ok ? n + (last === NL ? 0 : 1) : null;
}

/** Maps one session file. Returns `null` when cancelled. Never throws for bad content. */
export async function parseFile(file: Blob, name: string, opts: ParseOptions = {}): Promise<IntakeResult | null> {
  const cancelled = opts.cancelled ?? (() => false);
  const total = await countLines(file, cancelled);
  if (total === null) return null;
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let lines = 0;
  let said = 0;
  const ok = await eachChunk(file, (b) => {
    parts.push(decoder.decode(b, { stream: true }));
    lines += countNewlines(b);
    const now = Date.now();
    if (now - said >= PROGRESS_EVERY_MS) {
      said = now;
      opts.onProgress?.(Math.min(lines, total), total);
    }
  }, cancelled);
  if (!ok) return null;
  parts.push(decoder.decode());
  opts.onProgress?.(total, total);
  const text = parts.join('');
  if (text.trim() === '') return { ok: false, error: 'empty' };
  const files = [{ path: name, text }];
  const graph = parseSession({ files });
  if (!graph) return { ok: false, error: 'unsupported' };
  if (graph.steps.length === 0) return { ok: false, error: 'empty' };
  try {
    return { ok: true, graph: attachRaw(graph, files) };
  } catch {
    return { ok: true, graph }; // "Show raw" is a nicety; the map stands without it
  }
}
