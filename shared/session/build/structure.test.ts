// Phase 12: episodes, trouble patterns and outcome on the synthetic fixtures (PLAN §5.11, AC1–AC3).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSession } from '../adapter';
import type { NormalizedRecord, SessionGraph, Trouble } from '../types';
import { MAX_TOP_EPISODES } from './constants';
import { buildGraph } from './graph';

const DIR = 'fixtures/sessions/claude-code';
const NAMES = readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).sort();

function graph(name: string): SessionGraph {
  const files = [{ path: `${DIR}/${name}`, text: readFileSync(`${DIR}/${name}`, 'utf8') }];
  const sub = `${DIR}/${name.replace(/\.jsonl$/, '')}/subagents`;
  if (existsSync(sub)) for (const f of readdirSync(sub).sort()) files.push({ path: `${sub}/${f}`, text: readFileSync(`${sub}/${f}`, 'utf8') });
  const g = parseSession({ files });
  if (!g) throw new Error(name);
  return g;
}

const G = Object.fromEntries(NAMES.map((n) => [n.replace('.jsonl', ''), graph(n)]));
const of = (g: SessionGraph | undefined, kind: Trouble['kind']) => g?.trouble.filter((t) => t.kind === kind) ?? [];
const text = (g: SessionGraph | undefined, id: string | undefined) => g?.steps.find((s) => s.id === id)?.tool?.command ?? g?.steps.find((s) => s.id === id)?.text;

describe('trouble patterns (AC1)', () => {
  const t = G.trouble;
  it('labels every pattern, gives evidence in step order and provenance of the first evidence step', () => {
    for (const g of Object.values(G)) {
      for (const p of g.trouble) {
        expect(p.label).toBe('detected pattern');
        const seqs = p.stepIds.map((id) => Number(id.slice(1)));
        expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
        expect(p.raw).toEqual(g.steps[seqs[0] ?? 0]?.raw);
      }
    }
  });

  it('error-streak: resolved when the same command later passes, unresolved otherwise; not for a single failure', () => {
    expect(of(t, 'error-streak').map((p) => [p.count, p.resolved, p.summary])).toEqual([
      [2, true, 'Error streak: 2 failed runs, then passed'],
      [2, false, 'Error streak: 2 failed runs'],
    ]);
    expect(text(t, of(t, 'error-streak')[0]?.stepIds.at(-1))).toBe('Test Files  3 passed (3)');
    expect(of(G.basic, 'error-streak')).toEqual([]);
    expect(of(G['near-miss'], 'error-streak')).toEqual([]);
  });

  it('retry: the same normalized command after a failure within the window, with retry-of edges', () => {
    const [r] = of(t, 'retry');
    expect(r).toMatchObject({ count: 2, resolved: true, summary: 'Retried Bash ×2, then passed' });
    expect(r?.stepIds.map((id) => text(t, id))).toEqual(['pnpm test', 'pnpm test 2>&1 | tail -20', 'pnpm test']);
    expect(t?.edges.filter((e) => e.kind === 'retry-of')).toHaveLength(2);
    // A different command (basic) and the same command 11 steps later (near-miss) are not retries.
    expect(of(G.basic, 'retry')).toEqual([]);
    expect(of(G['near-miss'], 'retry')).toEqual([]);
  });

  it('revert: an edit restoring earlier text, and git checkout of a touched file; not untouched files or branches', () => {
    expect(of(t, 'revert').map((p) => p.summary)).toEqual(['Revert: edit of title.ts', 'Revert: git checkout of 1 file']);
    expect(t?.edges.filter((e) => e.kind === 'reverts')).toHaveLength(2);
    expect(of(G['near-miss'], 'revert')).toEqual([]);
  });

  it('rewind: the abandoned branch of an edited prompt', () => {
    expect(of(G.rewind, 'rewind')).toMatchObject([{ count: 2, resolved: true, summary: 'Rewound: 2 steps abandoned' }]);
    for (const name of ['basic', 'trouble', 'near-miss', 'subagent']) expect(of(G[name], 'rewind')).toEqual([]);
  });

  it('interrupt: a user interruption, or a correction right after an error; not a message after a success', () => {
    expect(of(G.basic, 'interrupt')).toMatchObject([{ summary: 'Interrupted after 8 calls', resolved: true, stepIds: ['s18', 's19', 's20'] }]);
    expect(of(t, 'interrupt')).toMatchObject([{ summary: 'User corrected course after a failed Bash', resolved: true }]);
    expect(of(G['near-miss'], 'interrupt')).toEqual([]);
  });

  it('churn: 4 edits to one file in one episode; 3 are not churn', () => {
    expect(of(t, 'churn')).toMatchObject([{ count: 4, summary: 'Churn: src/title.ts edited 4× in one episode' }]);
    expect(G['near-miss']?.outcome.files[0]).toMatchObject({ path: 'src/list.css', edits: 3 });
    expect(of(G['near-miss'], 'churn')).toEqual([]);
  });
});

describe('episodes (AC2)', () => {
  it.each(NAMES)('%s has at most 12 top-level episodes per lane covering every step once', (name) => {
    const g = graph(name);
    const top = g.episodes.filter((e) => !e.parentId);
    for (const lane of g.lanes) expect(top.filter((e) => e.laneId === lane.id).length).toBeLessThanOrEqual(MAX_TOP_EPISODES);
    expect(top.flatMap((e) => e.stepIds).sort()).toEqual(g.steps.map((s) => s.id).sort());
  });

  it('starts episodes at user turns, spawns, kind changes and the final answer, with deterministic titles', () => {
    expect(G.basic?.episodes.map((e) => [e.kind, e.title])).toEqual([
      ['discuss', 'Fix slugify in src/slug.ts so titles with spaces become dashes'],
      ['explore', 'Explore src/slug.ts +2 more'],
      ['change', 'Edit src/slug.ts +1 more'],
      ['verify', 'Run pnpm test ×2'],
      ['discuss', 'The full suite is slow; run only the slug test file with --run'],
      ['answer', 'Answer'],
    ]);
    expect(G.subagent?.episodes.map((e) => `${e.laneId}:${e.kind}`)).toEqual(['main:discuss', 'main:delegate', 'main:answer', 'agent-a1:discuss', 'agent-a1:answer']);
  });

  it('groups a long lane into 12 top-level episodes, keeping the answer last and children linked', () => {
    const records: NormalizedRecord[] = [];
    for (let i = 0; i < 40; i++) {
      records.push({ laneId: 'main', file: 'x.jsonl', line: 2 * i + 1, items: [{ kind: 'user', text: `Turn ${i}` }] });
      records.push({ laneId: 'main', file: 'x.jsonl', line: 2 * i + 2, items: [{ kind: 'tool-call', name: 'Read', input: { file_path: `/w/f${i}.ts` } }] });
    }
    records.push({ laneId: 'main', file: 'x.jsonl', line: 99, items: [{ kind: 'assistant', text: 'Done.' }] });
    const session = { source: { kind: 'claude-code' as const, sessionId: 'x' }, lanes: [{ id: 'main', name: 'Main', file: 'x.jsonl' }], records, stats: { skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0 } };
    const g = buildGraph(session);
    const top = g.episodes.filter((e) => !e.parentId);
    expect(top).toHaveLength(12);
    expect(top.at(-1)).toMatchObject({ kind: 'answer', stepIds: ['s80'] });
    expect(top.every((e) => e.kind === 'answer' || e.title.startsWith('Turn '))).toBe(true);
    const children = g.episodes.filter((e) => e.parentId);
    expect(children).toHaveLength(40);
    expect(JSON.stringify(buildGraph(session))).toBe(JSON.stringify(g));
  });
});

describe('outcome (AC3)', () => {
  it('counts tool and shell writes, excludes net-reverted files and finds the last verification and answer', () => {
    const o = G.trouble?.outcome;
    expect(o?.files).toEqual([
      { path: 'src/title.ts', edits: 4, created: false },
      { path: 'src/config.json', edits: 1, created: false },
      { path: 'src/legacy-title.ts', edits: 1, created: false },
      { path: 'src/old-title.ts', edits: 1, created: false },
      { path: 'src/unique.ts', edits: 1, created: false },
    ]);
    expect(o?.revertedFiles).toBe(1);
    expect(o?.lastVerification).toMatchObject({ command: 'pnpm typecheck', ok: false });
    expect(text(G.trouble, o?.answerStepId)).toMatch(/^Titles are unique now/);
  });

  it('marks created files and uses the last main-lane answer', () => {
    expect(G.basic?.outcome).toMatchObject({
      files: [{ path: 'src/slug.ts', edits: 2, created: false }, { path: 'src/slug.test.ts', edits: 1, created: true }],
      lastVerification: { command: 'pnpm vitest --run src/slug.test.ts', ok: true },
    });
    expect(text(G.subagent, G.subagent?.outcome.answerStepId)).toBe('Notes are saved by src/store.ts in localStorage.');
    expect(G.rewind?.outcome.lastVerification).toBeUndefined();
  });
});
