/** What a share link carries (PLAN D12). Other params (`t`, `seed`, `prompt`) belong to later phases and pass through. */
export interface UrlState {
  /** Sample id, or null for the default garden. */
  sample: string | null;
  /** Rank indices from the root to the selected branch. */
  path: number[];
}

/** Reads `?sample=&path=`. A path is kept up to its first malformed part; `valid` is false when anything was dropped. */
export function readUrlState(search: string): UrlState & { valid: boolean } {
  const q = new URLSearchParams(search);
  const raw = q.get('path');
  const parts = raw ? raw.split('.') : [];
  const bad = parts.findIndex((p) => !/^\d{1,2}$/.test(p));
  const path = (bad < 0 ? parts : parts.slice(0, bad)).map(Number);
  return { sample: q.get('sample') || null, path, valid: bad < 0 };
}

/** Writes the state into `search`, keeping unknown params; defaults are omitted. Returns "" or "?…". */
export function writeUrlState(search: string, s: UrlState): string {
  const q = new URLSearchParams(search);
  for (const [name, value] of [['sample', s.sample ?? ''], ['path', s.path.join('.')]] as const) {
    if (value) q.set(name, value);
    else q.delete(name);
  }
  const out = q.toString();
  return out ? `?${out}` : '';
}
