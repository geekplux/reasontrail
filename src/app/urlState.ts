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

/** Which page the website shows (PLAN phase 16): the garden lens when any garden param is set (`?sample=` links keep
 * working), else a session map: `?session=<sample id>` (the default sample when absent) and `?view=outline`. */
export function readSiteState(search: string): { garden: boolean; session: string | null; view: 'map' | 'outline' } {
  const q = new URLSearchParams(search);
  return {
    garden: ['sample', 'path', 't', 'seed'].some((p) => q.has(p)),
    session: q.get('session') || null,
    view: q.get('view') === 'outline' ? 'outline' : 'map',
  };
}

/** `search` with the map view written (`view=outline`, or dropped for the default map), other params kept. */
export function writeView(search: string, view: 'map' | 'outline'): string {
  const q = new URLSearchParams(search);
  if (view === 'outline') q.set('view', 'outline');
  else q.delete('view');
  const out = q.toString();
  return out ? `?${out}` : '';
}
