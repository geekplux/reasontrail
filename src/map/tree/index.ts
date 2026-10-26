// The tree layout engine's public API (docs/design/v7/PROMPT.md §5): `layoutTree` for the geometry, `highlight` for
// the root-to-episode or root-to-step path, `nearest` for hit testing (within 12px; twigs are smaller than 24px).
import { ribbonPath } from './layout';
import type { HitTarget, Pt, TreeLayout } from './types';

export { layoutTree, MIN_BOX, ribbonPath } from './layout';
export { textWidth } from './text';
export type * from './types';
export type { GlyphKind, VerdictTone } from '../gitlist/rows';

/** Fill paths for the stretch of trunk, limb and branch from the root to an episode or step (empty when unknown).
 * `flare`: keep the trunk's root flare, as the hover does (tree.mjs), so the root stays ink while the rest fades. */
export function highlight(t: TreeLayout, id: string, flare = false): string[] {
  return (t.paths[id] ?? []).flatMap(({ part, to }) => {
    const r = t.ribbons.find((x) => x.id === part);
    if (!r) return [];
    // The selection draws it without the flare (the core widths, tree.mjs): an 11px stub at the root, and as wide as
    // its branch further on, so no grey fringe shows along the path.
    return [ribbonPath(r.line.slice(0, to + 1), (flare ? r.widths : (r.core ?? r.widths)).slice(0, to + 1))];
  });
}

/** Distance from `p` to the segment `a`–`b`. */
export const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const s = l ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - s * dx, p.y - a.y - s * dy);
};

/**
 * The hit target closest to `p` within `max`, in layout px (the box given to `layoutTree`), measured from a target's
 * edge where it has a `pad`; steps win ties over the episode they belong to. A renderer drawn at another scale passes 12 / renderScale to keep 12 screen px.
 */
export function nearest(t: TreeLayout, p: Pt, max = 12): HitTarget | undefined {
  let best: HitTarget | undefined;
  let bestD = max;
  for (const h of t.hits) {
    const pts = h.points;
    let d = pts.length === 1 ? Math.hypot(p.x - (pts[0] as Pt).x, p.y - (pts[0] as Pt).y) : Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1] as Pt, pts[i] as Pt));
    // Measured from the mark's edge (a glyph's ring, a number's text box): the distance less the pad, so anywhere
    // inside a mark is 0 or below and the deepest inside (the most negative) wins over a mark merely nearby.
    d -= h.pad ?? 0;
    if (d < bestD || (d === bestD && best?.kind === 'episode' && h.kind === 'step')) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
