// Structural check of a SessionGraph (§5.10) for committed samples. Returns problems; empty means valid.
import { SCHEMA_VERSION, type SessionGraph } from '../../../shared/session/types';

const STEP_KINDS = new Set(['user', 'assistant', 'thinking', 'tool-call', 'tool-result', 'system', 'compaction']);
const EDGE_KINDS = new Set(['next', 'result-of', 'spawned', 'retry-of', 'reverts', 'forks', 'supports']);
const EPISODE_KINDS = new Set(['explore', 'change', 'verify', 'delegate', 'answer', 'discuss']);
const TROUBLE_KINDS = new Set(['error-streak', 'retry', 'revert', 'rewind', 'interrupt', 'churn']);
const FINALS = new Set(['ok', 'error', 'unknown']);

export function validateSessionGraph(g: SessionGraph): string[] {
  const out: string[] = [];
  const bad = (msg: string) => out.length < 20 && out.push(msg);
  if (g.schemaVersion !== SCHEMA_VERSION) bad(`schemaVersion ${String(g.schemaVersion)}`);
  if (!g.source?.kind || typeof g.source.sessionId !== 'string') bad('source.kind/sessionId missing');
  if (typeof g.title !== 'string' || !g.title) bad('title missing');
  const lanes = new Set(g.lanes.map((l) => l.id));
  if (g.lanes[0]?.id !== 'main') bad('first lane is not main');
  const steps = new Set<string>();
  g.steps.forEach((s, i) => {
    if (s.id !== `s${i}` || s.seq !== i) bad(`step ${i}: id/seq ${s.id}/${s.seq}`);
    if (!lanes.has(s.laneId)) bad(`${s.id}: unknown lane ${s.laneId}`);
    if (!STEP_KINDS.has(s.kind)) bad(`${s.id}: kind ${s.kind}`);
    if (typeof s.raw?.file !== 'string' || !Number.isInteger(s.raw.line) || s.raw.line < 1) bad(`${s.id}: provenance`);
    steps.add(s.id);
  });
  if (g.stats.steps !== g.steps.length) bad('stats.steps differs from steps.length');
  for (const l of g.lanes) if (l.spawnedBy && !steps.has(l.spawnedBy)) bad(`lane ${l.id}: spawnedBy ${l.spawnedBy}`);
  for (const e of g.edges) {
    if (!EDGE_KINDS.has(e.kind) || !steps.has(e.from) || !steps.has(e.to) || Number(e.from.slice(1)) >= Number(e.to.slice(1))) bad(`edge ${e.from}->${e.to} ${e.kind}`);
  }
  for (const ep of g.episodes) {
    if (!EPISODE_KINDS.has(ep.kind) || !lanes.has(ep.laneId) || ep.stepIds.some((id) => !steps.has(id))) bad(`episode ${ep.id}`);
  }
  for (const t of g.trouble) {
    if (!TROUBLE_KINDS.has(t.kind) || t.label !== 'detected pattern' || t.stepIds.length === 0 || t.stepIds.some((id) => !steps.has(id))) bad(`trouble ${t.id}`);
  }
  const v = g.outcome.lastVerification;
  if (v && !steps.has(v.stepId)) bad(`lastVerification ${v.stepId}`);
  if (g.outcome.answerStepId && !steps.has(g.outcome.answerStepId)) bad(`answerStepId ${g.outcome.answerStepId}`);
  const x = g.expect;
  if (x) {
    if (!x.task || !g.title.startsWith(x.task)) bad('expect.task is not the start of the title');
    const files = new Set(g.outcome.files.map((f) => f.path));
    if (!Array.isArray(x.files) || x.files.some((f) => !files.has(f))) bad('expect.files not in outcome.files');
    if (x.trouble !== g.trouble.length) bad('expect.trouble differs from trouble.length');
    if (!FINALS.has(x.final) || x.final !== (v ? (v.ok ? 'ok' : 'error') : 'unknown')) bad('expect.final differs from outcome');
  }
  return out;
}
