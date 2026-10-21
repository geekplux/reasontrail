// buildGraph: the one entry point from a normalized session to a SessionGraph. No AI, no clock, no randomness.
import { SCHEMA_VERSION, type Lane, type NormalizedSession, type SessionGraph } from '../types';
import { buildSteps } from './steps';

const TITLE_MAX = 120;

function firstLine(text: string): string {
  const line = text.trim().split('\n', 1)[0]?.trim() ?? '';
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

/** Turn an adapter's normalized session into the step graph. Episodes, trouble and outcome are filled in phase 12. */
export function buildGraph(session: NormalizedSession): SessionGraph {
  const { steps, edges, spawnStep } = buildSteps(session);
  const resultStatus = new Map<string, Lane['status']>();
  const callIdOf = new Map(steps.filter((s) => s.kind === 'tool-call').map((s) => [s.id, s.tool?.callId]));
  for (const s of steps) if (s.kind === 'tool-result' && s.tool?.callId) resultStatus.set(s.tool.callId, s.status);

  const lanes: Lane[] = session.lanes.map((l) => {
    const lane: Lane = { id: l.id, name: l.name, file: l.file };
    if (l.agentType) lane.agentType = l.agentType;
    const spawnedBy = spawnStep.get(l.id);
    if (spawnedBy) {
      lane.spawnedBy = spawnedBy;
      const status = resultStatus.get(callIdOf.get(spawnedBy) ?? '');
      if (status) lane.status = status;
    }
    return lane;
  });

  const timed = steps.filter((s) => s.t);
  const source: SessionGraph['source'] = { ...session.source };
  const startedAt = timed[0]?.t;
  const endedAt = timed[timed.length - 1]?.t;
  if (startedAt) source.startedAt = startedAt;
  if (endedAt) source.endedAt = endedAt;
  const firstUser = steps.find((s) => s.kind === 'user' && s.laneId === (lanes[0]?.id ?? 'main') && s.text);

  const graph: SessionGraph = {
    schemaVersion: SCHEMA_VERSION,
    source,
    title: firstLine(session.title ?? '') || firstLine(firstUser?.text ?? '') || 'Untitled session',
    lanes,
    steps,
    edges,
    episodes: [],
    trouble: [],
    outcome: { files: [] },
    stats: { steps: steps.length, ...session.stats },
  };
  const duration = startedAt && endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : Number.NaN;
  if (Number.isFinite(duration)) graph.stats.durationMs = duration;
  return graph;
}
