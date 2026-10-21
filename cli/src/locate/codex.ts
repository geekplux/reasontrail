// Codex CLI session store (PLAN §5.12): ${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl, whose
// first line is the `session_meta` record (id, cwd). Codex sets CODEX_THREAD_ID (the session id) for the commands it
// runs (codex-rs/core/src/exec_env.rs). Not verified against a real Codex install. Only Node built-ins.
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { firstLine, readHead, statRef, type LocateContext, type SessionRef, type Store } from './store';

const ROLLOUT = /^rollout-.+\.jsonl$/;
/** Rollout heads read per search, newest first, before giving up (keeps `--latest` fast on a big store). */
const SCAN_MAX = 500;

export function sessionsDir(ctx: LocateContext): string {
  return join(ctx.env.CODEX_HOME || join(ctx.home, '.codex'), 'sessions');
}

const lsDesc = (dir: string): string[] => {
  try {
    return readdirSync(dir).sort().reverse();
  } catch {
    return [];
  }
};

/** Every rollout file, newest folder and name first (names start with the start time). */
function* rollouts(ctx: LocateContext): Generator<string> {
  const root = sessionsDir(ctx);
  for (const y of lsDesc(root)) for (const m of lsDesc(join(root, y))) for (const d of lsDesc(join(root, y, m))) {
    for (const n of lsDesc(join(root, y, m, d))) if (ROLLOUT.test(n)) yield join(root, y, m, d, n);
  }
}

/** The `session_meta` payload from a rollout's head. */
function meta(file: string, head = readHead(file)): Record<string, unknown> {
  for (const line of head.split('\n', 3)) {
    try {
      const v = JSON.parse(line) as { type?: unknown; payload?: unknown };
      if (v.type === 'session_meta' && typeof v.payload === 'object' && v.payload !== null) return v.payload as Record<string, unknown>;
    } catch {
      // partial or not JSON
    }
  }
  return {};
}

const idOf = (file: string, m: Record<string, unknown>) =>
  typeof m.id === 'string' ? m.id : (/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i.exec(file)?.[1] ?? basename(file, '.jsonl'));

function refFor(file: string): SessionRef | undefined {
  return statRef('codex', idOf(file, meta(file)), file);
}

/** Rollouts whose session_meta `cwd` is the current directory, newest (by mtime) first. */
function listForCwd(ctx: LocateContext): SessionRef[] {
  const out: SessionRef[] = [];
  let scanned = 0;
  for (const file of rollouts(ctx)) {
    if (++scanned > SCAN_MAX || out.length >= 50) break;
    const m = meta(file);
    if (m.cwd !== ctx.cwd) continue;
    const ref = statRef('codex', idOf(file, m), file);
    if (ref) out.push(ref);
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function findById(ctx: LocateContext, id: string): SessionRef | undefined {
  if (!/^[\w.-]+$/.test(id)) return undefined;
  for (const file of rollouts(ctx)) if (basename(file).endsWith(`${id}.jsonl`)) return refFor(file);
  return undefined;
}

/** The first plain user request (not the injected instructions or environment context). */
function titleOf(head: string): string {
  for (const line of head.split('\n')) {
    if (!line.includes('"role":"user"')) continue;
    try {
      const p = (JSON.parse(line) as { payload?: { type?: string; role?: string; content?: { text?: unknown }[] } }).payload;
      const text = p?.type === 'message' && p.role === 'user' ? p.content?.find((c) => typeof c.text === 'string')?.text : undefined;
      if (typeof text === 'string' && text.trim() && !/^\s*(?:<|# AGENTS\.md)/.test(text)) return firstLine(text);
    } catch {
      // partial or not JSON
    }
  }
  return '(untitled)';
}

export const codexStore: Store = {
  source: 'codex',
  label: 'Codex',
  envVar: 'CODEX_THREAD_ID',
  listForCwd,
  findById,
  claims: (file) => (ROLLOUT.test(basename(file)) ? refFor(file) : undefined),
  files: (ref) => [{ abs: ref.file, rel: basename(ref.file) }],
  describe(ref) {
    const head = readHead(ref.file);
    const m = meta(ref.file, head);
    return { title: titleOf(head), ...(typeof m.timestamp === 'string' ? { startedAt: m.timestamp } : {}) };
  },
};
