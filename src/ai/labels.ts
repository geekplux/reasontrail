// The AI overlay read for the map (PLAN phase 21, X3, DESIGN §13.6): step labels summed up per top-level episode,
// and claim → support pairs that name only steps of this graph. Pure; the overlay never changes the graph (D22).
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';

/** Most conclusive first: an episode's tag is its most conclusive label. */
const ORDER = ['answer', 'decision', 'dead end', 'hypothesis', 'evidence', 'sub-question'];

export interface EpisodeTag {
  /** The most conclusive label in the episode. */
  label: string;
  /** How many other labels it also has. */
  others: number;
  /** "decision (3 steps), evidence (1 step)". */
  text: string;
}

const plural = (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`;

/** Step id → the top-level main-route episode it belongs to; a subagent's steps belong to the episode that spawned it. */
export function episodeOfStep(g: SessionGraph): (stepId: string) => string | undefined {
  const main = g.lanes[0]?.id;
  const top = new Map<string, string>();
  for (const e of g.episodes) if (e.laneId === main && !e.parentId) for (const id of e.stepIds) top.set(id, e.id);
  const steps = new Map(g.steps.map((s) => [s.id, s]));
  const lanes = new Map(g.lanes.map((l) => [l.id, l]));
  const find = (id: string, depth = 0): string | undefined => {
    const hit = top.get(id);
    if (hit || depth > 8) return hit;
    const spawn = lanes.get(steps.get(id)?.laneId ?? '')?.spawnedBy;
    return spawn ? find(spawn, depth + 1) : undefined;
  };
  return (id) => find(id);
}

/** One tag per labelled top-level episode, keyed by episode id. `of` maps a step to its episode: by default the
 * main-route episode (a subagent's steps count for the episode that spawned it). */
export function episodeTags(g: SessionGraph, overlay: LabelOverlay, of: (stepId: string) => string | undefined = episodeOfStep(g)): Map<string, EpisodeTag> {
  const counts = new Map<string, Map<string, number>>();
  for (const l of overlay.labels) {
    const ep = of(l.stepId);
    if (!ep) continue;
    const c = counts.get(ep) ?? new Map<string, number>();
    c.set(l.label, (c.get(l.label) ?? 0) + 1);
    counts.set(ep, c);
  }
  const tags = new Map<string, EpisodeTag>();
  for (const [ep, c] of counts) {
    const sorted = [...c].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]) || b[1] - a[1]);
    const [label] = sorted[0] as [string, number];
    tags.set(ep, { label, others: sorted.length - 1, text: sorted.map(([l, n]) => `${l} (${plural(n)})`).join(', ') });
  }
  return tags;
}

/** The accessible text of an episode's tag; every label says which model suggested it (X3). */
export const tagName = (tag: EpisodeTag, model: string) => `AI labels, suggested by ${model}: ${tag.text}`;

/** The label the model suggested for one step, if any. */
export const stepLabel = (overlay: LabelOverlay, stepId: string) => overlay.labels.find((l) => l.stepId === stepId);

/** The supporting steps of a claim step that exist in the graph, in step order. */
export function supportsOf(g: SessionGraph, overlay: LabelOverlay, claimStepId: string): string[] {
  const ids = new Set(overlay.links.find((l) => l.claimStepId === claimStepId)?.supportStepIds ?? []);
  return g.steps.filter((s) => ids.has(s.id) && s.id !== claimStepId).map((s) => s.id);
}

/** Claim episode → supporting episodes, for the claims inside `episodeIds` (existing, other episodes only). */
export function supportPairs(g: SessionGraph, overlay: LabelOverlay, episodeIds: ReadonlySet<string>): { from: string; to: string[] }[] {
  const of = episodeOfStep(g);
  const out = new Map<string, Set<string>>();
  for (const l of overlay.links) {
    const from = of(l.claimStepId);
    if (!from || !episodeIds.has(from)) continue;
    const to = out.get(from) ?? new Set<string>();
    for (const s of supportsOf(g, overlay, l.claimStepId)) {
      const ep = of(s);
      if (ep && ep !== from) to.add(ep);
    }
    out.set(from, to);
  }
  return [...out].filter(([, to]) => to.size > 0).map(([from, to]) => ({ from, to: [...to] }));
}
