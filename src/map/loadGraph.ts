// The viewer's data contract: the CLI embeds a ViewerPayload as JSON in the page; the viewer validates it here.
import { STRUCTURE_LABELS, type StructureLabel } from '../../shared/session/structure';
import { SCHEMA_VERSION, type LabelOverlay, type SessionGraph } from '../../shared/session/types';

/** What the CLI embeds in `<script id="reasontrail-data" type="application/json">`. */
export interface ViewerPayload {
  graph: SessionGraph;
  meta: {
    version: string;
    /** Set on `--share` copies: how many items redaction replaced. */
    shared?: { replaced: number };
  };
  /** `--ai` only: the model's suggested labels, kept apart from the graph (D22, X3). */
  labels?: LabelOverlay;
}

/** The overlay's labels and links that name steps of `graph` with a known label; undefined if it is not an overlay. */
function checkOverlay(v: unknown, graph: SessionGraph): LabelOverlay | undefined {
  const o = v as Partial<LabelOverlay> | null | undefined;
  if (!o || typeof o.model !== 'string' || !o.model || !Array.isArray(o.labels) || !Array.isArray(o.links)) return undefined;
  const ids = new Set(graph.steps.map((s) => s.id));
  const labels = o.labels.filter(
    (l) => ids.has(l?.stepId) && STRUCTURE_LABELS.includes(l.label as StructureLabel) && typeof l.confidence === 'number' && l.confidence >= 0 && l.confidence <= 1,
  );
  const links = o.links
    .filter((l) => ids.has(l?.claimStepId) && Array.isArray(l.supportStepIds))
    .map((l) => ({ claimStepId: l.claimStepId, supportStepIds: l.supportStepIds.filter((s) => ids.has(s) && s !== l.claimStepId) }))
    .filter((l) => l.supportStepIds.length > 0);
  return { model: o.model, createdAt: String(o.createdAt ?? ''), labels, links };
}

export type Loaded = { ok: true; payload: ViewerPayload } | { ok: false; reason: string };

/** Parse and sanity-check the embedded JSON. Never throws. */
export function loadGraph(text: string | null | undefined): Loaded {
  if (!text?.trim()) return { ok: false, reason: 'This page has no session data.' };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The session data in this page could not be read.' };
  }
  const p = v as Partial<ViewerPayload> | null;
  const g = p?.graph;
  if (!g || typeof g !== 'object' || !Array.isArray(g.steps) || !Array.isArray(g.episodes) || !Array.isArray(g.lanes)) {
    return { ok: false, reason: 'The session data in this page is not a Reasontrail map.' };
  }
  if (g.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: `This page was made by a different Reasontrail version (schema ${String(g.schemaVersion)}).` };
  const labels = checkOverlay(p?.labels, g);
  const meta = { version: String(p?.meta?.version ?? ''), ...(p?.meta?.shared ? { shared: p.meta.shared } : {}) };
  return { ok: true, payload: { graph: g, meta, ...(labels ? { labels } : {}) } };
}
