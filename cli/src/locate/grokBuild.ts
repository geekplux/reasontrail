// Grok Build session store (PLAN §5.12): ${GROK_HOME:-~/.grok}/sessions/<url-encoded cwd>/<id>/updates.jsonl with
// summary.json and subagents/<child id>/meta.json; child sessions sit next to the parent (or inside subagents/).
// A cwd whose encoding is over 255 bytes uses a slug + hash folder holding a `.cwd` file. Only Node built-ins.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { firstLine, statRef, type LocateContext, type SessionRef, type Store } from './store';

export function sessionsDir(ctx: LocateContext): string {
  return join(ctx.env.GROK_HOME || join(ctx.home, '.grok'), 'sessions');
}

/** Percent-encode everything except letters, digits and `-_.~`, as Grok names the per-folder directory. */
export function encodeCwd(cwd: string): string {
  return encodeURIComponent(cwd).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const ls = (dir: string): string[] => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};

function readJson(file: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The folder of the current cwd: the encoded name, else a folder whose `.cwd` file names it. */
function groupDir(ctx: LocateContext): string {
  const root = sessionsDir(ctx);
  const enc = encodeCwd(ctx.cwd);
  if (Buffer.byteLength(enc) <= 255 || existsSync(join(root, enc))) return join(root, enc);
  const hit = ls(root).find((d) => {
    try {
      return readFileSync(join(root, d, '.cwd'), 'utf8').trim() === ctx.cwd;
    } catch {
      return false;
    }
  });
  return join(root, hit ?? enc);
}

function refIn(sessionDir: string): SessionRef | undefined {
  const active = Date.parse(String(readJson(join(sessionDir, 'summary.json')).last_active_at ?? ''));
  return statRef('grok-build', basename(sessionDir), join(sessionDir, 'updates.jsonl'), Number.isNaN(active) ? undefined : active);
}

/** Sessions of the current directory, newest `last_active_at` first. Subagent child sessions are left out. */
function listForCwd(ctx: LocateContext): SessionRef[] {
  const dir = groupDir(ctx);
  const ids = ls(dir);
  const children = new Set(ids.flatMap((id) => ls(join(dir, id, 'subagents'))));
  return ids.filter((id) => !children.has(id)).flatMap((id) => refIn(join(dir, id)) ?? []).sort((a, b) => b.mtimeMs - a.mtimeMs || (a.id < b.id ? 1 : -1));
}

function findById(ctx: LocateContext, id: string): SessionRef | undefined {
  if (!/^[\w.-]+$/.test(id)) return undefined;
  const here = refIn(join(groupDir(ctx), id));
  if (here) return here;
  for (const d of ls(sessionsDir(ctx))) {
    const ref = refIn(join(sessionsDir(ctx), d, id));
    if (ref) return ref;
  }
  return undefined;
}

/** updates.jsonl, summary.json, then each subagent's meta.json and log, relative to the per-folder directory. */
export function sessionFiles(mainFile: string): { abs: string; rel: string }[] {
  const dir = dirname(mainFile);
  const group = dirname(dir);
  const id = basename(dir);
  const out = [{ abs: mainFile, rel: `${id}/updates.jsonl` }];
  if (existsSync(join(dir, 'summary.json'))) out.push({ abs: join(dir, 'summary.json'), rel: `${id}/summary.json` });
  for (const child of ls(join(dir, 'subagents'))) {
    const sub = join(dir, 'subagents', child);
    if (existsSync(join(sub, 'meta.json'))) out.push({ abs: join(sub, 'meta.json'), rel: `${id}/subagents/${child}/meta.json` });
    if (existsSync(join(sub, 'updates.jsonl'))) out.push({ abs: join(sub, 'updates.jsonl'), rel: `${id}/subagents/${child}/updates.jsonl` });
    else if (existsSync(join(group, child, 'updates.jsonl'))) out.push({ abs: join(group, child, 'updates.jsonl'), rel: `${child}/updates.jsonl` });
  }
  return out;
}

export const grokBuildStore: Store = {
  source: 'grok-build',
  label: 'Grok Build',
  envVar: 'GROK_SESSION_ID',
  listForCwd,
  findById,
  claims: (file) => (basename(file) === 'updates.jsonl' ? refIn(dirname(file)) : undefined),
  files: (ref) => sessionFiles(ref.file),
  describe(ref) {
    const s = readJson(join(dirname(ref.file), 'summary.json'));
    const title = typeof s.generated_title === 'string' ? s.generated_title : typeof s.session_summary === 'string' ? firstLine(s.session_summary) : '(untitled)';
    return { title, ...(typeof s.created_at === 'string' ? { startedAt: s.created_at } : {}) };
  },
};
