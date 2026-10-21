// Session location across sources (PLAN §5.12, D27): Claude Code, Grok Build and Codex, side by side.
import { accessSync, constants, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { SessionInput } from '../../../shared/session/types';
import type { Options } from '../args';
import { claudeCodeStore } from './claudeCode';
import { codexStore } from './codex';
import { grokBuildStore } from './grokBuild';
import type { LocateContext, SessionRef, Store } from './store';

export type { LocateContext, SessionRef };

export type Located = { ref: SessionRef; how: string } | { error: string };

export const STORES: readonly Store[] = [claudeCodeStore, grokBuildStore, codexStore];

const storesFor = (opts: Options) => STORES.filter((s) => !opts.source || s.source === opts.source);
const storeOf = (ref: SessionRef) => STORES.find((s) => s.source === ref.source) as Store;
const names = (stores: readonly Store[]) => stores.map((s) => s.label).join(', ').replace(/, ([^,]+)$/, ' or $1');

/** Newest session for the cwd across the given stores. */
function newest(stores: readonly Store[], ctx: LocateContext): SessionRef | undefined {
  return stores.flatMap((s) => s.listForCwd(ctx).slice(0, 1)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

/** Find the session the options ask for. `how` says which rule picked it (printed, D27). */
export function locate(opts: Options, ctx: LocateContext): Located {
  const stores = storesFor(opts);
  if (opts.target) {
    const path = isAbsolute(opts.target) ? opts.target : resolve(ctx.cwd, opts.target);
    for (const s of [...stores].reverse()) { // Claude Code accepts any .jsonl, so it goes last
      const ref = s.claims(path);
      if (ref) return { ref, how: 'given' };
    }
    for (const s of stores) {
      const ref = s.findById(ctx, opts.target);
      if (ref) return { ref, how: 'given' };
    }
    return { error: `No session file or id "${opts.target}" was found.` };
  }
  const missing: string[] = [];
  if (opts.mode === 'current') {
    // The calling agent's variable; another agent's may be inherited (Grok started from Claude Code), so try each.
    for (const s of stores) {
      const id = ctx.env[s.envVar];
      if (!id) continue;
      const ref = s.findById(ctx, id);
      if (ref) return { ref, how: `current (${s.envVar})` };
      missing.push(id);
    }
  }
  const latest = newest(stores, ctx);
  const why = missing.length ? `session ${missing.join(', ')} was not found; using the newest for this folder` : 'newest for this folder (no current session id)';
  if (latest) return { ref: latest, how: opts.mode === 'current' ? why : 'newest for this folder' };
  return { error: `No ${names(stores)} session was found for ${ctx.cwd}. Run it from the folder the session started in, or pass a session file.` };
}

export interface ListedSession extends SessionRef {
  title: string;
  startedAt?: string;
}

/** The 10 most recent sessions for the current folder across stores, with a title and start time. */
export function listSessions(opts: Options, ctx: LocateContext): ListedSession[] {
  return storesFor(opts)
    .flatMap((s) => s.listForCwd(ctx).slice(0, 10))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 10)
    .map((ref) => ({ ...ref, ...storeOf(ref).describe(ref) }));
}

/**
 * Every file of the session. Throws when a file cannot be read. Each `text` is read from disk when it is used and not
 * kept, so a large session (100+ MB of subagent transcripts) is never held in memory all at once.
 */
export function readSession(ref: SessionRef): SessionInput {
  return {
    files: storeOf(ref).files(ref).map(({ abs, rel }) => {
      accessSync(abs, constants.R_OK);
      return { path: rel, get text() { return readFileSync(abs, 'utf8'); } };
    }),
  };
}
