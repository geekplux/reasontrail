// Smoke test on real local transcripts. Skipped unless TG_REAL_SESSIONS lists paths (":" or "," separated).
// Logs counts and timings only, never content. Node file access is allowed here (test only), not in shared/session.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSession } from './adapter';
import type { SourceFile } from './types';

const PATHS = (process.env.TG_REAL_SESSIONS ?? '').split(/[:,]/).map((p) => p.trim()).filter(Boolean);
/** ≤ 1.5 s for a ~9 MB transcript, scaled for larger inputs. */
const budgetMs = (bytes: number) => 1500 * Math.max(1, bytes / 10_000_000);

function filesFor(path: string): SourceFile[] {
  const files = [{ path, text: readFileSync(path, 'utf8') }];
  const sub = `${path.replace(/\.jsonl$/, '')}/subagents`;
  if (!path.includes('/subagents/') && existsSync(sub)) {
    for (const f of readdirSync(sub).sort()) files.push({ path: `${sub}/${f}`, text: readFileSync(`${sub}/${f}`, 'utf8') });
  }
  return files;
}

describe.skipIf(PATHS.length === 0)('real sessions (TG_REAL_SESSIONS)', () => {
  it.each(PATHS)('parses %s within budget', (path) => {
    expect(statSync(path).isFile()).toBe(true);
    const files = filesFor(path);
    const bytes = files.reduce((n, f) => n + f.text.length, 0);
    const start = performance.now();
    const g = parseSession({ files });
    const ms = performance.now() - start;
    expect(g).toBeDefined();
    if (!g) return;
    const edges: Record<string, number> = {};
    for (const e of g.edges) edges[e.kind] = (edges[e.kind] ?? 0) + 1;
    const kinds: Record<string, number> = {};
    for (const s of g.steps) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
    console.log(JSON.stringify({ files: files.length, mb: +(bytes / 1e6).toFixed(2), ms: Math.round(ms), lanes: g.lanes.length, kinds, edges, ...g.stats }));
    expect(g.steps.every((s) => s.raw.file && s.raw.line > 0)).toBe(true);
    expect(ms).toBeLessThanOrEqual(budgetMs(bytes));
  });
});
