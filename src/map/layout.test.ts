import { describe, expect, it } from 'vitest';
import type { Episode, Lane, SessionGraph, Step, StepStatus, Trouble } from '../../shared/session/types';
import { sessionSamples } from '../sessions/samples';
import { parseSession } from '../../shared/session/adapter';
import { G, glanceLayout, laneStatus, lineY, verdictOf } from './layout';

interface LaneSpec { ep: number; at: number; back?: number; steps: number; status?: StepStatus; agent?: string }
interface Spec { eps: number[]; answer?: boolean; lanes?: LaneSpec[]; trouble?: { ep?: number; at?: number; lane?: number; resolved?: boolean }[]; gapMin?: Record<number, number> }

/** A synthetic graph: main episodes of `eps[i]` steps, lanes spawned and returned at step indexes, trouble anchors. */
function graph(spec: Spec): SessionGraph {
  const steps: Step[] = [];
  const episodes: Episode[] = [];
  let t = Date.parse('2026-10-01T10:00:00Z');
  const add = (laneId: string, extra: Partial<Step> = {}) => {
    const s: Step = { id: `s${steps.length}`, seq: steps.length, laneId, kind: 'tool-call', t: new Date((t += 1000)).toISOString(), raw: { file: 'x.jsonl', line: steps.length + 1 }, ...extra };
    steps.push(s);
    return s;
  };
  const counts = [...spec.eps, ...(spec.answer ? [1] : [])];
  counts.forEach((n, i) => {
    t += (spec.gapMin?.[i] ?? 0) * 60_000;
    const ids: string[] = [];
    for (let j = 0; j < n; j++) {
      const lane = spec.lanes?.findIndex((l) => l.ep === i && (l.at === j || l.back === j)) ?? -1;
      const l = spec.lanes?.[lane];
      const s = !l ? add('main') : l.at === j ? add('main', { tool: { name: 'Agent', category: 'agent', summary: 'Agent x', files: [], callId: `c${lane}` } })
        : add('main', { kind: 'tool-result', status: l.status ?? 'ok', tool: { name: 'Agent', category: 'agent', summary: '', files: [], callId: `c${lane}` } });
      ids.push(s.id);
    }
    const last = spec.answer && i === counts.length - 1;
    episodes.push({ id: `e${i}`, title: last ? 'Answer' : `Episode ${i}`, kind: last ? 'answer' : 'explore', stepIds: ids, laneId: 'main' });
  });
  const lanes: Lane[] = [{ id: 'main', name: 'Main', file: 'x.jsonl' }];
  spec.lanes?.forEach((l, k) => {
    const spawn = steps.find((s) => s.tool?.callId === `c${k}` && s.kind === 'tool-call') as Step;
    const lane: Lane = { id: `L${k}`, name: `Lane ${k}`, file: `L${k}.jsonl`, spawnedBy: spawn.id, agentType: l.agent ?? 'implementer' };
    if (l.back !== undefined) lane.status = l.status ?? 'ok';
    lanes.push(lane);
    for (let j = 0; j < l.steps; j++) add(`L${k}`);
  });
  const trouble: Trouble[] = (spec.trouble ?? []).map((tr, i) => {
    const stepId = tr.lane !== undefined ? (steps.filter((s) => s.laneId === `L${tr.lane}`)[tr.at ?? 0] as Step).id : (episodes[tr.ep ?? 0]?.stepIds[tr.at ?? 0] as string);
    return { id: `t${i}`, kind: 'error-streak', label: 'detected pattern', stepIds: [stepId], count: 2, resolved: tr.resolved ?? false, summary: 'Error streak: 2 failed runs', raw: { file: 'x.jsonl', line: 1 } };
  });
  return {
    schemaVersion: 1, source: { kind: 'claude-code', sessionId: 'x' }, title: 'Synthetic', lanes, steps, edges: [], episodes, trouble, outcome: { files: [] },
    stats: { steps: steps.length, skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0 },
  };
}

describe('route segments (DM8)', () => {
  it('sizes segments by clamp(56, 36 + k·√steps, 240) with k = min(19.5, 204/√maxSteps), in order, then grows them uniformly up to 480 px', () => {
    const L = glanceLayout(graph({ eps: [1, 9, 49, 400], answer: true }), 4000);
    const k = Math.min(19.5, 204 / Math.sqrt(400));
    // The band has room for more than twice the natural lengths: the longest segment stops at 480 (×2).
    const natural = [56, 36 + k * 3, 36 + k * 7, 240];
    expect(L.episodes.map((e) => e.len)).toEqual(natural.map((v) => v * 2));
    expect(L.episodes.map((e) => e.x)).toEqual([24, 24 + 112, 24 + 112 + natural[1]! * 2, 24 + 112 + (natural[1]! + natural[2]!) * 2]);
    expect(L.answer?.x).toBe(L.routeEnd);
    expect(L.routeEnd).toBe(L.episodes.reduce((x, e) => x + e.len, 24));
  });

  it('fills the band with a short route: lengths keep their ratios and end at the band edge', () => {
    const L = glanceLayout(graph({ eps: [4, 16, 36, 36, 36] }), 1216);
    const lens = L.episodes.map((e) => e.len);
    expect(L.routeEnd).toBeCloseTo(1216 - 30);
    expect(Math.max(...lens)).toBeLessThanOrEqual(480);
    const k = Math.min(19.5, 204 / 6);
    expect((lens[0] as number) / (lens[2] as number)).toBeCloseTo((36 + k * 2) / (36 + k * 6));
  });

  it('gives the CLI fixture session segments of at least 96 px', () => {
    const files = import.meta.glob<string>('/fixtures/sessions/claude-code/subagent{.jsonl,/subagents/*}', { query: '?raw', import: 'default', eager: true });
    const g = parseSession({ files: Object.entries(files).sort().map(([path, text]) => ({ path: path.slice(1), text })) });
    if (!g) throw new Error('fixture did not parse');
    const L = glanceLayout(g, 1216);
    expect(Math.min(...L.episodes.map((e) => e.len))).toBeGreaterThanOrEqual(96);
  });

  it('scales all segments down together to fit the band, never under 56 px', () => {
    const L = glanceLayout(graph({ eps: [4, 16, 36, 64, 100, 100, 100] }), 800);
    const lens = L.episodes.map((e) => e.len);
    expect(Math.min(...lens)).toBeGreaterThanOrEqual(56);
    expect(L.routeEnd).toBeLessThanOrEqual(800 - 30 + 1e-9);
    expect(lens[6]).toBeGreaterThan(lens[1] as number);
  });

  it('folds the middle past 12 episodes: first 3 and last 8 drawn, the fold keeps steps and trouble', () => {
    const L = glanceLayout(graph({ eps: Array.from({ length: 16 }, () => 3), answer: true, trouble: [{ ep: 5 }, { ep: 6 }] }), 1216);
    expect(L.episodes.map((e) => e.n)).toEqual([1, 2, 3, 10, 11, 12, 13, 14, 15, 16]);
    expect(L.answer?.n).toBe(17);
    expect(L.fold).toMatchObject({ steps: 18, trouble: 2 });
    expect(L.fold?.episodes).toHaveLength(6);
    expect(L.blazes).toHaveLength(2);
    expect(glanceLayout(graph({ eps: Array.from({ length: 16 }, () => 3) }), 1216, { unfold: true }).episodes).toHaveLength(16);
  });

  it('draws the 3 longest idle gaps over 10 min as breaks at episode boundaries and notes the rest', () => {
    const L = glanceLayout(graph({ eps: [3, 3, 3, 3, 3, 3], gapMin: { 1: 660, 2: 30, 3: 12, 4: 45, 5: 5 } }), 1216);
    expect(L.breaks.map((b) => [b.before, b.label])).toEqual([['e1', '≈11 h idle'], ['e2', '30 min idle'], ['e4', '45 min idle']]);
    expect(L.episodes.map((e) => e.idle)).toEqual(['', '', '', ' · 12 min idle', '', '']);
    expect(L.pieces).toHaveLength(4);
    const e1 = L.episodes[1] as { x: number };
    expect(e1.x - (L.episodes[0] as { x: number; len: number }).x - (L.episodes[0] as { len: number }).len).toBe(44);
  });
});

describe('side trails (DM12)', () => {
  it('leave and rejoin at x(step), at least 96 px; an interrupted lane does not rejoin', () => {
    const L = glanceLayout(graph({ eps: [2, 20, 20], lanes: [{ ep: 1, at: 2, back: 18, steps: 30 }, { ep: 2, at: 1, back: 2, steps: 4, status: 'interrupted' }] }), 1216);
    const [a, b] = L.lanes;
    const e1 = L.episodes[1] as { x: number; len: number };
    expect(a?.x1).toBeCloseTo(e1.x + (e1.len * 2) / 20);
    expect(a?.x2).toBeCloseTo(e1.x + (e1.len * 18) / 20);
    expect(a).toMatchObject({ rejoins: true, track: 0, status: 'ok', word: 'done', calls: 30 });
    expect(b).toMatchObject({ rejoins: false, status: 'interrupted' });
    expect((b?.x2 ?? 0) - (b?.x1 ?? 0)).toBeGreaterThanOrEqual(96);
  });

  it('stacks parallel lanes as tracks and bundles sequential lanes that cannot each get 96 px', () => {
    const par = glanceLayout(graph({ eps: [30], lanes: [{ ep: 0, at: 1, back: 20, steps: 5 }, { ep: 0, at: 2, back: 25, steps: 5 }] }), 1216);
    expect(par.lanes.map((l) => l.track)).toEqual([0, 1]);
    expect(par.tracks).toBe(2);
    const seq = { eps: [6, 6], lanes: [{ ep: 0, at: 0, back: 1, steps: 3 }, { ep: 0, at: 2, back: 3, steps: 3, status: 'error' as const }] };
    const L = glanceLayout(graph(seq), 300);
    expect(L.lanes).toHaveLength(1);
    expect(L.lanes[0]).toMatchObject({ id: 'bundle:e0', status: 'error', failed: 1, calls: 6 });
    expect(L.lanes[0]?.lanes).toHaveLength(2);
    expect(glanceLayout(graph(seq), 300, { unbundle: new Set(['bundle:e0']) }).lanes).toHaveLength(2);
  });
});

describe('lane status (DESIGN §8.3)', () => {
  const lane = (status?: StepStatus): Lane => ({ id: 'L', name: 'L', file: 'L.jsonl', ...(status ? { status } : {}) });
  const st = (kind: Step['kind'], text?: string): Step => ({ id: `s${text ?? kind}`, seq: 0, laneId: 'L', kind, raw: { file: 'L.jsonl', line: 1 }, ...(text ? { text } : {}) });
  const g = graph({ eps: [1] });

  it('reads the verdict from the first line or a LABEL: VERDICT line, else only an unambiguous one', () => {
    expect(verdictOf('**PASS** with notes.\nNo FAIL left.')).toBe('PASS');
    expect(verdictOf('Checked lint and tests.\nVerdict: PASS\nNo FAIL remains.')).toBe('PASS');
    expect(verdictOf('Earlier FAIL is gone; now PASS.')).toBeUndefined();
    expect(verdictOf('All good, APPROVED.')).toBe('APPROVED');
  });

  it('takes a lane that ended on its own report as done when its hand-back is missing; a cut-off lane has no result', () => {
    expect(laneStatus(g, lane(), [st('tool-call'), st('assistant', 'Verdict: PASS')])).toEqual({ status: 'ok', word: 'PASS', handBack: false });
    expect(laneStatus(g, lane(), [st('tool-call'), st('assistant', 'APPROVED')])).toMatchObject({ status: 'ok', word: 'approved' });
    expect(laneStatus(g, lane(), [st('assistant', 'Finished the change.')])).toMatchObject({ status: 'ok', word: 'done', handBack: false });
    expect(laneStatus(g, lane(), [st('assistant', 'Now running tests.'), st('tool-call')])).toMatchObject({ status: 'unknown', word: 'no result recorded' });
    expect(laneStatus(g, lane('ok'), [st('assistant', 'Done.')])).toMatchObject({ status: 'ok', word: 'done', handBack: true });
  });
});

describe('blazes (DM13)', () => {
  it('numbers patterns in route order, keeps a 24 px pitch and folds more than 3 in a segment into one "+n" plate', () => {
    const L = glanceLayout(graph({ eps: [10, 10], lanes: [{ ep: 0, at: 1, back: 8, steps: 10 }], trouble: [{ ep: 1, at: 0 }, { ep: 0, at: 5 }, { ep: 0, at: 5, resolved: true }, { lane: 0, at: 0 }] }), 1216);
    expect([...L.numbers.entries()]).toEqual([['t3', 1], ['t1', 2], ['t2', 3], ['t0', 4]]);
    const route = L.blazes.filter((b) => b.track === -1);
    expect(route.map((b) => b.badge)).toEqual(['2', '3', '4']);
    expect((route[1]?.x ?? 0) - (route[0]?.x ?? 0)).toBeGreaterThanOrEqual(24);
    const many = glanceLayout(graph({ eps: [20], trouble: [0, 3, 6, 9, 12].map((at) => ({ ep: 0, at, resolved: at !== 6 })) }), 1216);
    expect(many.blazes).toEqual([expect.objectContaining({ badge: '1–5', resolved: false })]);
  });
});

describe('samples and performance (G2)', () => {
  it.each(sessionSamples.map((s) => [s.id, s] as const))('%s lays out deterministically within 12 episodes', async (_, sample) => {
    const g = await sample.load();
    const L = glanceLayout(g, 1216);
    expect(JSON.stringify(glanceLayout(g, 1216), (_k, v) => (v instanceof Map ? [...v] : v))).toBe(JSON.stringify(L, (_k, v) => (v instanceof Map ? [...v] : v)));
    expect(L.episodes.length + (L.answer ? 1 : 0) + (L.fold ? 1 : 0)).toBeLessThanOrEqual(12);
    expect([...L.numbers.values()].sort((a, b) => a - b)).toEqual(g.trouble.map((_t, i) => i + 1));
    expect(L.blazes.every((b) => b.x >= 0 && b.x <= L.width)).toBe(true);
    expect(lineY(-1)).toBe(G.routeY);
  });

  it('lays out a 5,000-step session in 300 ms or less', () => {
    const eps = Array.from({ length: 12 }, () => 400);
    const lanes = Array.from({ length: 10 }, (_, i) => ({ ep: i, at: 10, back: 300, steps: 60 }));
    const g = graph({ eps, lanes, trouble: Array.from({ length: 40 }, (_, i) => ({ ep: i % 12, at: i * 7 })) });
    expect(g.steps.length).toBeGreaterThanOrEqual(5000);
    glanceLayout(g, 1216);
    const t0 = performance.now();
    glanceLayout(g, 1216);
    expect(performance.now() - t0).toBeLessThanOrEqual(300);
  });
});
