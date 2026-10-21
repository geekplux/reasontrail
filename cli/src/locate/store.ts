// What every session store (Claude Code, Grok Build, Codex) offers the locator. Only Node built-ins.
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import type { SourceName } from '../args';

export interface SessionRef {
  source: SourceName;
  id: string;
  /** Absolute path of the main transcript. */
  file: string;
  /** Last activity (file mtime, or Grok's `last_active_at`); "newest" compares this across stores. */
  mtimeMs: number;
  size: number;
}

export interface LocateContext {
  home: string;
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
}

export interface Store {
  source: SourceName;
  label: string;
  /** The variable the agent sets for the processes it runs, naming its current session. */
  envVar: string;
  /** Sessions of the current directory, newest first. */
  listForCwd(ctx: LocateContext): SessionRef[];
  findById(ctx: LocateContext, id: string): SessionRef | undefined;
  /** A ref for a session file given by path, when the file has this store's shape. */
  claims(file: string): SessionRef | undefined;
  /** Every file of the session, with paths relative to the store folder (the graph never holds absolute paths). */
  files(ref: SessionRef): { abs: string; rel: string }[];
  /** Title and start time for `--list`, from the session's head. */
  describe(ref: SessionRef): { title: string; startedAt?: string };
}

/** A ref for a regular file, else undefined. */
export function statRef(source: SourceName, id: string, file: string, mtimeMs?: number): SessionRef | undefined {
  try {
    const st = statSync(file);
    return st.isFile() ? { source, id, file, mtimeMs: mtimeMs ?? st.mtimeMs, size: st.size } : undefined;
  } catch {
    return undefined;
  }
}

/** The first `bytes` of a file, as text ('' when unreadable). */
export function readHead(file: string, bytes = 256 * 1024): string {
  let fd: number | undefined;
  try {
    fd = openSync(file, 'r');
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export const firstLine = (text: string, max = 120): string => {
  const line = text.trim().split('\n', 1)[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
