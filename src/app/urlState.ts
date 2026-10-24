/** What a share link carries (PLAN D12). Other params (e.g. `prompt`) belong to later phases and pass through. */
export interface UrlState {
  /** Sample id, or null for the default garden. */
  sample: string | null;
  /** Rank indices from the root to the selected branch. */
  path: number[];
  /** Temperature in [0, 2], one decimal (default 1). */
  t: number;
  /** Sampled-path seed, an integer 1–9999, or null when no path is sampled. */
  seed: number | null;
}

/** `t` clamped to [0, 2] and rounded to 0.1; anything unreadable is 1. */
export function readT(raw: string | null): number {
  const t = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(t) ? Math.round(Math.min(2, Math.max(0, t)) * 10) / 10 : 1;
}

/** Reads `?sample=&path=&t=&seed=`. A path is kept up to its first malformed part; `valid` is false when anything was dropped. */
export function readUrlState(search: string): UrlState & { valid: boolean } {
  const q = new URLSearchParams(search);
  const raw = q.get('path');
  const parts = raw ? raw.split('.') : [];
  const bad = parts.findIndex((p) => !/^\d{1,2}$/.test(p));
  const path = (bad < 0 ? parts : parts.slice(0, bad)).map(Number);
  const seed = /^\d{1,4}$/.test(q.get('seed') ?? '') ? Number(q.get('seed')) : 0;
  return { sample: q.get('sample') || null, path, t: readT(q.get('t')), seed: seed >= 1 ? seed : null, valid: bad < 0 };
}

/** Writes the state into `search`, keeping unknown params; defaults are omitted. Returns "" or "?…". */
export function writeUrlState(search: string, s: UrlState): string {
  const q = new URLSearchParams(search);
  const params = [['sample', s.sample ?? ''], ['path', s.path.join('.')], ['t', s.t === 1 ? '' : String(s.t)], ['seed', s.seed === null ? '' : String(s.seed)]] as const;
  for (const [name, value] of params) {
    if (value) q.set(name, value);
    else q.delete(name);
  }
  const out = q.toString();
  return out ? `?${out}` : '';
}

/** The website's pages (PLAN phases 16, 19, 23; v7 §4): home with a sample (`outline` is an old link to it), the drop
 * zone, the chat paste page, install, and how to read a map. */
export type SiteView = 'map' | 'outline' | 'open' | 'chat' | 'install' | 'how';
const SITE_VIEWS: readonly SiteView[] = ['outline', 'open', 'chat', 'install', 'how'];

const GARDEN_PARAMS = ['sample', 'path', 't', 'seed'];

/** Which page the website shows: the garden lens when any garden param is set (`?sample=` links keep working), else
 * `?view=open|chat|install`, or the showcase with `?session=<sample id>` (the default when absent) and `?view=outline`.
 * `lens`: `?lens=live`, a sentence that grows only live (phase 22); it lives in memory, so a reload drops it. */
export function readSiteState(search: string): { garden: boolean; lens: boolean; session: string | null; view: SiteView } {
  const q = new URLSearchParams(search);
  const view = q.get('view') as SiteView;
  return {
    garden: GARDEN_PARAMS.some((p) => q.has(p)),
    lens: q.has('lens'),
    session: q.get('session') || null,
    view: SITE_VIEWS.includes(view) ? view : 'map',
  };
}

/** `search` back on the map: the lens and garden params dropped, the map's own (`session`, `step`, `view`) kept. */
export function mapSearch(search: string): string {
  const q = new URLSearchParams(search);
  for (const p of [...GARDEN_PARAMS, 'lens']) q.delete(p);
  const out = q.toString();
  return out ? `?${out}` : '';
}

/** `search` in the lens: a recorded lens garden is `sample=<id>` (a link that reopens it), a live-only one `lens=live`. */
export function lensSearch(search: string, gardenId: string | null): string {
  const q = new URLSearchParams(mapSearch(search));
  if (gardenId) q.set('sample', gardenId);
  else q.set('lens', 'live');
  return `?${q.toString()}`;
}

/** `search` with the view written (`view=…`, or dropped for the default map), other params kept. */
export function writeView(search: string, view: SiteView): string {
  const q = new URLSearchParams(search);
  if (view !== 'map') q.set('view', view);
  else q.delete('view');
  const out = q.toString();
  return out ? `?${out}` : '';
}
