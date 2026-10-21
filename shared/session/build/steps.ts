// Normalized records -> steps (time order, provenance) + edges (next, result-of, spawned, forks).
import { TEXT_PREVIEW_MAX, type Edge, type NormalizedRecord, type NormalizedSession, type Step } from '../types';
import { describeTool } from './tools';

export interface StepsResult {
  steps: Step[];
  edges: Edge[];
  /** Lane id -> step id of its spawning call, when found. */
  spawnStep: Map<string, string>;
}

function preview(text: string): string {
  return text.length > TEXT_PREVIEW_MAX ? `${text.slice(0, TEXT_PREVIEW_MAX - 1)}…` : text;
}

/** Stable time order: by timestamp (records without one inherit the previous one in their file), then lane, then line. */
function orderRecords(session: NormalizedSession): NormalizedRecord[] {
  const laneIndex = new Map(session.lanes.map((l, i) => [l.id, i]));
  const lastTime = new Map<string, number>();
  const keyed = session.records.map((r, i) => {
    const parsed = r.t ? Date.parse(r.t) : Number.NaN;
    const time = Number.isNaN(parsed) ? (lastTime.get(r.file) ?? Number.NEGATIVE_INFINITY) : parsed;
    lastTime.set(r.file, time);
    return { r, time, lane: laneIndex.get(r.laneId) ?? 0, i };
  });
  keyed.sort((a, b) => a.time - b.time || a.lane - b.lane || a.i - b.i);
  return keyed.map((k) => k.r);
}

/** Build steps and edges from a normalized session. Pure and deterministic. */
export function buildSteps(session: NormalizedSession): StepsResult {
  const steps: Step[] = [];
  const edges: Edge[] = [];
  const calls = new Map<string, Step>();
  const span = new Map<NormalizedRecord, { first: Step; last: Step }>();
  const byUuid = new Map<string, NormalizedRecord>();
  for (const r of session.records) if (r.uuid && !byUuid.has(r.uuid)) byUuid.set(r.uuid, r);
  const lastInLane = new Map<string, Step>();

  for (const r of orderRecords(session)) {
    let first: Step | undefined;
    let prev: Step | undefined;
    for (const item of r.items) {
      const step: Step = { id: `s${steps.length}`, seq: steps.length, laneId: r.laneId, kind: item.kind, raw: { file: r.file, line: r.line } };
      if (r.t) step.t = r.t;
      if (r.uuid) step.raw.uuid = r.uuid;
      if (item.kind === 'tool-call') {
        step.tool = describeTool(item.name, item.input, item.callId);
        if (item.callId) calls.set(item.callId, step);
      } else if (item.kind === 'tool-result') {
        const call = item.callId ? calls.get(item.callId) : undefined;
        step.tool = call?.tool ? { ...call.tool } : { name: 'unknown', category: 'other', summary: 'unknown', files: [] };
        delete step.tool.command;
        if (item.callId) step.tool.callId = item.callId;
        if (item.persistedOutput) step.tool.persistedOutput = item.persistedOutput;
        if (item.text) step.text = preview(item.text);
        step.status = item.status;
        if (call) edges.push({ from: call.id, to: step.id, kind: 'result-of' });
      } else {
        if (item.text) step.text = preview(item.text);
        else if (item.kind === 'thinking') step.textStored = false;
        if (item.kind === 'system' && item.status) step.status = item.status;
      }
      if (prev) edges.push({ from: prev.id, to: step.id, kind: 'next' });
      first ??= step;
      prev = step;
      steps.push(step);
    }
    if (first && prev) span.set(r, { first, last: prev });
  }

  // Cross-record edges, in step order. A parent with several non-result children is a fork (rewind or edited prompt).
  const branches = new Map<string, number>();
  for (const [r, { first, last }] of span) {
    let from: Step | undefined;
    if (r.parentUuid !== undefined || r.uuid !== undefined) {
      const seen = new Set<string>();
      let p = r.parentUuid;
      while (p && !seen.has(p)) {
        seen.add(p);
        const pr = byUuid.get(p);
        if (!pr) break;
        const ps = span.get(pr);
        if (ps) {
          from = ps.last;
          break;
        }
        p = pr.parentUuid;
      }
    } else {
      from = lastInLane.get(r.laneId);
    }
    lastInLane.set(r.laneId, last);
    if (!from || from.seq >= first.seq) continue;
    let kind: Edge['kind'] = 'next';
    if (first.kind !== 'tool-result') {
      const n = branches.get(from.id) ?? 0;
      branches.set(from.id, n + 1);
      if (n > 0) kind = 'forks';
    }
    edges.push({ from: from.id, to: first.id, kind });
  }

  const spawnStep = new Map<string, string>();
  for (const lane of session.lanes) {
    const call = lane.spawnCallId ? calls.get(lane.spawnCallId) : undefined;
    const firstInLane = steps.find((s) => s.laneId === lane.id);
    if (!call) continue;
    spawnStep.set(lane.id, call.id);
    if (firstInLane && call.seq < firstInLane.seq) edges.push({ from: call.id, to: firstInLane.id, kind: 'spawned' });
  }

  return { steps, edges: sortEdges(edges), spawnStep };
}

/** Sort edges by target, then source, then kind (stable output for M7). */
export function sortEdges(edges: Edge[]): Edge[] {
  return edges.sort((a, b) => Number(a.to.slice(1)) - Number(b.to.slice(1)) || Number(a.from.slice(1)) - Number(b.from.slice(1)) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}
