// The viewer's data contract: the CLI embeds a ViewerPayload as JSON in the page; the viewer validates it here.
import { SCHEMA_VERSION, type SessionGraph } from '../../shared/session/types';

/** What the CLI embeds in `<script id="reasontrail-data" type="application/json">`. */
export interface ViewerPayload {
  graph: SessionGraph;
  meta: {
    version: string;
    /** Set on `--share` copies: how many items redaction replaced. */
    shared?: { replaced: number };
  };
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
  return { ok: true, payload: { graph: g, meta: { version: String(p.meta?.version ?? ''), ...(p.meta?.shared ? { shared: p.meta.shared } : {}) } } };
}
