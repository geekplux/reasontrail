// A sandboxed HOME with fixture sessions in Claude Code, Grok Build and Codex stores, for CLI tests. Never touches the real home.
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { onTestFinished } from 'vitest';
import { encodeCwd } from '../src/locate/claudeCode';
import { encodeCwd as encodeGrokCwd } from '../src/locate/grokBuild';
import type { RunContext } from '../src/main';

export const FIXTURES = resolve(import.meta.dirname, '../../fixtures/sessions/claude-code');
const GROK = resolve(import.meta.dirname, '../../fixtures/sessions/grok-build/notes');
const CODEX = resolve(import.meta.dirname, '../../fixtures/sessions/codex');
export const GROK_ID = '019a2c10-5e00-7a00-8000-000000000001';
export const CODEX_ID = '019a2c20-7c00-7c00-8000-000000000003';
export const TEMPLATE = '<!doctype html><title>__REASONTRAIL_TITLE__</title><script id="reasontrail-data" type="application/json">__REASONTRAIL_DATA__</script>';

/** Call inside a test: the sandbox is removed when that test finishes, pass or fail. */
export function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'reasontrail-test-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const cwd = join(root, 'work', 'notes-app');
  const store = join(home, '.claude', 'projects', encodeCwd(cwd));
  mkdirSync(store, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const template = join(root, 'viewer.html');
  writeFileSync(template, TEMPLATE);
  /** Copy a fixture into the store as `<id>.jsonl` with the given mtime (seconds), plus its subagent folder. */
  const add = (fixture: string, id: string, mtime: number) => {
    const file = join(store, `${id}.jsonl`);
    copyFileSync(join(FIXTURES, `${fixture}.jsonl`), file);
    try {
      cpSync(join(FIXTURES, fixture), join(store, id), { recursive: true });
    } catch {
      // no subagents
    }
    utimesSync(file, mtime, mtime);
    return file;
  };
  /** Copy the Grok fixture sessions into ~/.grok/sessions/<cwd>/; the main session was last active at `active` (s). */
  const addGrok = (active: number) => {
    const dir = join(home, '.grok', 'sessions', encodeGrokCwd(cwd));
    cpSync(GROK, dir, { recursive: true });
    const summary = join(dir, GROK_ID, 'summary.json');
    writeFileSync(summary, readFileSync(summary, 'utf8').replace(/"last_active_at": "[^"]+"/, `"last_active_at": "${new Date(active * 1000).toISOString()}"`));
    return join(dir, GROK_ID, 'updates.jsonl');
  };
  /** Copy the Codex rollout into ~/.codex/sessions/2026/10/16/ for this cwd (or `forCwd`), with the given mtime (s). */
  const addCodex = (mtime: number, forCwd = cwd) => {
    const name = readdirSync(CODEX).find((n) => n.endsWith('.jsonl')) as string;
    const dir = join(home, '.codex', 'sessions', '2026', '10', '16');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    writeFileSync(file, readFileSync(join(CODEX, name), 'utf8').replaceAll('"/work/notes-app"', JSON.stringify(forCwd)));
    utimesSync(file, mtime, mtime);
    return file;
  };
  const lines = { out: [] as string[], err: [] as string[] };
  const ctx = (env: Record<string, string> = {}): RunContext => ({
    home, cwd, env, template, out: (l) => lines.out.push(l), err: (l) => lines.err.push(l), open: () => false,
  });
  return { root, home, cwd, store, add, addGrok, addCodex, ctx, lines };
}
