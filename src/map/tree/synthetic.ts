// Synthetic sessions for the tree engine's tests and the dev-only debug render (scripts/design/render-tree.mjs): any
// number of subagent lanes, sequential or spawned together, and long one-lane sessions. Not used by the app.
import type { Episode, Lane, SessionGraph, Step, StepStatus } from '../../../shared/session/types';

export interface SynthEpisode { kind: Episode['kind']; calls: number; thinking?: number; reads?: number; failed?: number }
export interface SynthLane { name: string; agentType?: string; status?: StepStatus; report?: string; episodes: SynthEpisode[] }
/** Main-lane episodes, and groups of lanes spawned by one delegate episode, in session order. */
export type SynthPart = { main: SynthEpisode } | { spawn: SynthLane[] };

export function synthGraph(parts: SynthPart[], answer = true): SessionGraph {
  const steps: Step[] = [];
  const episodes: Episode[] = [];
  const lanes: Lane[] = [{ id: 'main', name: 'Main', file: 'main.jsonl' }];
  const t0 = Date.parse('2026-10-01T10:00:00Z');
  let call = 0;
  const step = (laneId: string, kind: Step['kind'], extra: Partial<Step> = {}) => {
    const seq = steps.length;
    const s: Step = { id: `s${seq}`, seq, t: new Date(t0 + seq * 20_000).toISOString(), laneId, kind, raw: { file: `${laneId}.jsonl`, line: seq + 1 }, ...extra };
    steps.push(s);
    return s.id;
  };
  const toolCall = (laneId: string, category: 'read' | 'run' | 'edit' | 'agent', status: StepStatus, summary: string) => {
    const callId = `c${++call}`;
    const id = step(laneId, 'tool-call', { tool: { name: category, category, summary, files: [], callId } });
    return [id, step(laneId, 'tool-result', { status, text: status === 'error' ? 'Exit code 1' : 'ok', tool: { name: category, category, summary, files: [], callId } })];
  };
  const episode = (laneId: string, kind: Episode['kind'], title: string, stepIds: string[]) => {
    episodes.push({ id: `e${episodes.length}`, title, kind, laneId, stepIds });
  };
  const grow = (laneId: string, e: SynthEpisode, title: string) => {
    const ids: string[] = [];
    for (let i = 0; i < e.calls; i++) {
      if (i < (e.thinking ?? 0)) ids.push(step(laneId, 'thinking', { text: 'Thinking it over' }));
      const failed = i >= e.calls - (e.failed ?? 0);
      ids.push(...toolCall(laneId, i < (e.reads ?? 0) ? 'read' : e.kind === 'change' ? 'edit' : 'run', failed ? 'error' : 'ok', `${title} ${i + 1}`));
    }
    episode(laneId, e.kind, title, ids);
  };
  episode('main', 'discuss', 'Synthetic task', [step('main', 'user', { text: 'Synthetic task' })]);
  for (const p of parts) {
    if ('main' in p) {
      grow('main', p.main, `Main work ${episodes.length}`);
      continue;
    }
    const spawnIds = p.spawn.map((l) => toolCall('main', 'agent', 'ok', `Agent ${l.name}`));
    for (const [i, l] of p.spawn.entries()) {
      const id = `agent-${lanes.length}`;
      lanes.push({ id, name: l.name, file: `${id}.jsonl`, spawnedBy: spawnIds[i]?.[0] as string, status: l.status ?? 'ok', ...(l.agentType ? { agentType: l.agentType } : {}) });
      episode(id, 'discuss', l.name, [step(id, 'user', { text: l.name })]);
      l.episodes.forEach((e, j) => grow(id, e, `${l.name} step ${j + 1}`));
      episode(id, 'answer', 'Answer', [step(id, 'assistant', { text: l.report ?? 'Done.' })]);
    }
    // The spawn calls' results come back after the lanes ran.
    const ids = spawnIds.flatMap(([c]) => [c as string]);
    episode('main', 'delegate', `Delegate ${p.spawn.map((l) => l.name).join(', ')}`, [...ids, ...spawnIds.map(([, r]) => r as string)]);
    spawnIds.forEach(([, r], k) => {
      const s = steps.find((x) => x.id === r) as Step;
      Object.assign(s, { seq: steps.length - 0.5 + k / 100, t: new Date(t0 + steps.length * 20_000 - 10_000).toISOString() });
    });
  }
  if (answer) episode('main', 'answer', 'Answer', [step('main', 'assistant', { text: 'All done.' })]);
  steps.sort((a, b) => a.seq - b.seq).forEach((s, i) => { s.seq = i; });
  return {
    schemaVersion: 1,
    source: { kind: 'claude-code', sessionId: 'synthetic', startedAt: new Date(t0).toISOString() },
    title: 'Synthetic session',
    lanes, steps, edges: [], episodes, trouble: [], outcome: { files: [] },
    stats: { steps: steps.length, skippedLines: 0, partialLines: 0, skippedLineNumbers: [], unknownRecords: 0, ignoredRecords: 0, durationMs: steps.length * 20_000 },
  };
}

/** Eight subagents: sequential and spawned together, one errored, main-lane work between them. */
export const eightLanes = () => synthGraph([
  { main: { kind: 'explore', calls: 4, reads: 3 } },
  { spawn: [{ name: 'Plan the change', agentType: 'planner', episodes: [{ kind: 'explore', calls: 6, reads: 4, thinking: 2 }, { kind: 'change', calls: 3 }] }] },
  { spawn: [{ name: 'Build part one', agentType: 'implementer', episodes: [{ kind: 'explore', calls: 5, reads: 5 }, { kind: 'change', calls: 8, thinking: 3 }, { kind: 'verify', calls: 4, failed: 1 }] }] },
  { spawn: [{ name: 'Review part one', agentType: 'reviewer', status: 'error', episodes: [{ kind: 'explore', calls: 3 }] },
    { name: 'Build part two', agentType: 'implementer', episodes: [{ kind: 'change', calls: 7 }, { kind: 'verify', calls: 3 }] }] },
  { main: { kind: 'change', calls: 2 } },
  { spawn: [{ name: 'Verify both parts', agentType: 'verifier', episodes: [{ kind: 'verify', calls: 6, failed: 2 }, { kind: 'explore', calls: 4, reads: 2 }] }] },
  { spawn: [{ name: 'Fix the failures', agentType: 'implementer', episodes: [{ kind: 'change', calls: 5, thinking: 2 }, { kind: 'verify', calls: 3 }] }] },
  { spawn: [{ name: 'Write the docs', agentType: 'writer', episodes: [{ kind: 'change', calls: 4 }] }, { name: 'Re-verify', agentType: 'verifier', episodes: [{ kind: 'verify', calls: 5 }] }] },
  { main: { kind: 'explore', calls: 2, reads: 2 } },
]);

/** One lane, 12 episodes and about 1,000 records: dense enough to pack the along-axis. */
export const longSession = () => synthGraph(
  Array.from({ length: 10 }, (_, i) => ({ main: { kind: i % 3 === 0 ? 'explore' : i % 3 === 1 ? 'change' : 'verify', calls: 30 + ((i * 17) % 40), thinking: 12, reads: i % 3 === 0 ? 20 : 2, failed: i % 4 === 2 ? 2 : 0 } })),
);
