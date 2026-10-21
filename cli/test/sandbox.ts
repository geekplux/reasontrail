// A sandboxed HOME with fixture sessions in a Claude Code store, for CLI tests. Never touches the real home.
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { encodeCwd } from '../src/locate/claudeCode';
import type { RunContext } from '../src/main';

export const FIXTURES = resolve(import.meta.dirname, '../../fixtures/sessions/claude-code');
export const TEMPLATE = '<!doctype html><title>__REASONTRAIL_TITLE__</title><script id="reasontrail-data" type="application/json">__REASONTRAIL_DATA__</script>';

export function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'reasontrail-test-'));
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
  const lines = { out: [] as string[], err: [] as string[] };
  const ctx = (env: Record<string, string> = {}): RunContext => ({
    home, cwd, env, template, out: (l) => lines.out.push(l), err: (l) => lines.err.push(l), open: () => false,
  });
  return { root, home, cwd, store, add, ctx, lines };
}
