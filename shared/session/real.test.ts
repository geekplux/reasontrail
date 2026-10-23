// Smoke test on real local transcripts. Skipped unless TG_REAL_SESSIONS lists paths (":" or "," separated).
// Logs counts and timings only, never content. Node file access is allowed here (test only), not in shared/session.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSession } from './adapter';
import { MAX_TOP_EPISODES } from './build/constants';
import { redactGraph } from './redact';
import type { SourceFile } from './types';

const PATHS = (process.env.TG_REAL_SESSIONS ?? '').split(/[:,]/).map((p) => p.trim()).filter(Boolean);
/** ≤ 1.5 s for a ~9 MB transcript, scaled for larger inputs. */
const budgetMs = (bytes: number) => 1500 * Math.max(1, bytes / 10_000_000);

function filesFor(path: string): SourceFile[] {
  const files = [{ path, text: readFileSync(path, 'utf8') }];
  if (path.endsWith('/updates.jsonl')) {
    // Grok Build: summary.json, subagents/<id>/meta.json and the child's log (inside subagents/ or next to the parent).
    const dir = path.slice(0, -'/updates.jsonl'.length);
    const add = (p: string) => existsSync(p) && files.push({ path: p, text: readFileSync(p, 'utf8') });
    add(`${dir}/summary.json`);
    for (const id of existsSync(`${dir}/subagents`) ? readdirSync(`${dir}/subagents`).sort() : []) {
      add(`${dir}/subagents/${id}/meta.json`);
      if (!add(`${dir}/subagents/${id}/updates.jsonl`)) add(`${dir}/../${id}/updates.jsonl`);
    }
    return files;
  }
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
    // Structure counts only (phase 12): top-level episodes per lane, trouble by kind, files changed. Never content.
    const top = g.episodes.filter((e) => !e.parentId);
    const topPerLane = Math.max(0, ...g.lanes.map((l) => top.filter((e) => e.laneId === l.id).length));
    const trouble: Record<string, number> = {};
    for (const t of g.trouble) trouble[t.kind] = (trouble[t.kind] ?? 0) + 1;
    const structure = { mainEpisodes: top.filter((e) => e.laneId === g.lanes[0]?.id).length, topPerLane, episodes: g.episodes.length, trouble, filesChanged: g.outcome.files.length, revertedFiles: g.outcome.revertedFiles ?? 0, verified: g.outcome.lastVerification?.ok ?? null };
    const r0 = performance.now();
    const { summary } = redactGraph(g);
    const redact = { redactMs: Math.round(performance.now() - r0), redactedTypes: Object.keys(summary.replaced).length, dropped: summary.dropped };
    console.log(JSON.stringify({ files: files.length, mb: +(bytes / 1e6).toFixed(2), ms: Math.round(ms), lanes: g.lanes.length, kinds, edges, ...g.stats, ...structure, ...redact }));
    expect(g.steps.every((s) => s.raw.file && s.raw.line > 0)).toBe(true);
    expect(topPerLane).toBeLessThanOrEqual(MAX_TOP_EPISODES);
    expect(ms).toBeLessThanOrEqual(budgetMs(bytes));
  });
});
