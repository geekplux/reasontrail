// Claude Code session store (PLAN §5.12): ~/.claude/projects/<cwd, every non-alphanumeric char → "-">/<id>.jsonl,
// plus <id>/subagents/agent-*.jsonl with .meta.json files. Only Node built-ins.
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readHead, statRef, type LocateContext, type SessionRef, type Store } from './store';

/** The projects directory, honouring CLAUDE_CONFIG_DIR. */
export function projectsDir(ctx: LocateContext): string {
  return join(ctx.env.CLAUDE_CONFIG_DIR || join(ctx.home, '.claude'), 'projects');
}

export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

export function refFor(file: string): SessionRef | undefined {
  return statRef('claude-code', basename(file).replace(/\.jsonl$/, ''), file);
}

function sessionsIn(dir: string): SessionRef[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith('.jsonl')).flatMap((n) => refFor(join(dir, n)) ?? []);
}

/** Sessions of the current directory, newest first (by mtime). */
export function listForCwd(ctx: LocateContext): SessionRef[] {
  return sessionsIn(join(projectsDir(ctx), encodeCwd(ctx.cwd))).sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** A session by id: the current directory's store first, then every project. */
export function findById(ctx: LocateContext, id: string): SessionRef | undefined {
  if (!/^[\w.-]+$/.test(id)) return undefined;
  const root = projectsDir(ctx);
  const here = refFor(join(root, encodeCwd(ctx.cwd), `${id}.jsonl`));
  if (here) return here;
  let dirs: string[] = [];
  try {
    dirs = readdirSync(root);
  } catch {
    return undefined;
  }
  for (const d of dirs) {
    const ref = refFor(join(root, d, `${id}.jsonl`));
    if (ref) return ref;
  }
  return undefined;
}

/**
 * Every file of a session, with paths relative to the main transcript's folder (so the graph never holds the
 * user's absolute paths): the main `.jsonl`, then `<id>/subagents/agent-*.jsonl` and their `.meta.json`.
 */
export function sessionFiles(mainFile: string): { abs: string; rel: string }[] {
  const id = basename(mainFile).replace(/\.jsonl$/, '');
  const files = [{ abs: mainFile, rel: basename(mainFile) }];
  const subDir = join(dirname(mainFile), id, 'subagents');
  if (!existsSync(subDir)) return files;
  for (const n of readdirSync(subDir).sort()) {
    if (/^agent-[^/]+\.(jsonl|meta\.json)$/.test(n)) files.push({ abs: join(subDir, n), rel: `${id}/subagents/${n}` });
  }
  return files;
}

/** A short title from the head of a transcript: the custom title, else the first user request's first line. */
export function titleFromHead(text: string): string {
  let firstUser: string | undefined;
  for (const line of text.split('\n')) {
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof v !== 'object' || v === null) continue;
    const r = v as { type?: unknown; customTitle?: unknown; message?: { content?: unknown } };
    if (r.type === 'custom-title' && typeof r.customTitle === 'string') return r.customTitle;
    if (r.type === 'user' && firstUser === undefined) {
      const c = r.message?.content;
      const t = typeof c === 'string' ? c : Array.isArray(c) ? (c.find((p) => p?.type === 'text')?.text as unknown) : undefined;
      if (typeof t === 'string' && t.trim() && !t.trimStart().startsWith('<')) firstUser = t.trim().split('\n', 1)[0];
    }
  }
  return firstUser ?? '(untitled)';
}

export const claudeCodeStore: Store = {
  source: 'claude-code',
  label: 'Claude Code',
  envVar: 'CLAUDE_CODE_SESSION_ID',
  listForCwd,
  findById,
  claims: (file) => (file.endsWith('.jsonl') ? refFor(file) : undefined),
  files: (ref) => sessionFiles(ref.file),
  describe(ref) {
    const head = readHead(ref.file);
    const started = /"timestamp":"([^"]+)"/.exec(head)?.[1];
    return { title: titleFromHead(head), ...(started ? { startedAt: started } : {}) };
  },
};
