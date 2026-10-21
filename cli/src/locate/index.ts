// Session location across sources (PLAN §5.12, D27). Claude Code now; Codex and Grok Build join in phase 18.
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { SessionInput } from '../../../shared/session/types';
import type { Options } from '../args';
import { findById, listForCwd, readHead, refFor, sessionFiles, titleFromHead, type LocateContext, type SessionRef } from './claudeCode';

export type { LocateContext, SessionRef };

export type Located = { ref: SessionRef; how: string } | { error: string };

function unsupported(source: Options['source']): string | undefined {
  return source && source !== 'claude-code' ? `${source} sessions are not supported yet (Claude Code only for now).` : undefined;
}

/** Find the session the options ask for. `how` says which rule picked it (printed, D27). */
export function locate(opts: Options, ctx: LocateContext): Located {
  const notYet = unsupported(opts.source);
  if (notYet) return { error: notYet };
  if (opts.target) {
    const path = isAbsolute(opts.target) ? opts.target : resolve(ctx.cwd, opts.target);
    const ref = refFor(path) ?? findById(ctx, opts.target);
    return ref ? { ref, how: 'given' } : { error: `No session file or id "${opts.target}" was found.` };
  }
  const id = ctx.env.CLAUDE_CODE_SESSION_ID;
  if (opts.mode === 'current') {
    const ref = id ? findById(ctx, id) : undefined;
    if (ref) return { ref, how: 'current (CLAUDE_CODE_SESSION_ID)' };
  }
  const latest = listForCwd(ctx)[0];
  const why = !id ? 'newest for this folder (no current session id)' : `session ${id} was not found; using the newest for this folder`;
  if (latest) return { ref: latest, how: opts.mode === 'current' ? why : 'newest for this folder' };
  return { error: `No Claude Code session was found for ${ctx.cwd}. Run it from the folder the session started in, or pass a session file.` };
}

export interface ListedSession extends SessionRef {
  title: string;
  startedAt?: string;
}

/** The 10 most recent sessions for the current folder, with a title and start time from each file's head. */
export function listSessions(opts: Options, ctx: LocateContext): ListedSession[] {
  if (unsupported(opts.source)) return [];
  return listForCwd(ctx).slice(0, 10).map((ref) => {
    let head = '';
    try {
      head = readHead(ref.file);
    } catch {
      // unreadable: listed without a title
    }
    const started = /"timestamp":"([^"]+)"/.exec(head)?.[1];
    return { ...ref, title: titleFromHead(head), ...(started ? { startedAt: started } : {}) };
  });
}

/** Read every file of the session. Throws when a file cannot be read. */
export function readSession(ref: SessionRef): SessionInput {
  return { files: sessionFiles(ref.file).map(({ abs, rel }) => ({ path: rel, text: readFileSync(abs, 'utf8') })) };
}
