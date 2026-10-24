// The tree layout engine's public API (docs/design/v7/PROMPT.md §5): `layoutTree` for the geometry, `highlight` for
// the root-to-episode or root-to-step path, `nearest` for hit testing (within 12px; twigs are smaller than 24px).
import { ribbonPath } from './layout';
import type { HitTarget, Pt, TreeLayout } from './types';

export { layoutTree, MIN_BOX, ribbonPath } from './layout';
export { textWidth } from './text';
export type * from './types';
export type { GlyphKind, VerdictTone } from '../gitlist/rows';

/** Fill paths for the stretch of trunk, limb and branch from the root to an episode or step (empty when unknown). */
export function highlight(t: TreeLayout, id: string): string[] {
  return (t.paths[id] ?? []).flatMap(({ part, to }) => {
    const r = t.ribbons.find((x) => x.id === part);
    return r ? [ribbonPath(r.line.slice(0, to + 1), r.widths.slice(0, to + 1))] : [];
  });
}

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const s = l ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - s * dx, p.y - a.y - s * dy);
};

/**
 * The hit target closest to `p` within `max`, in layout px (the box given to `layoutTree`); steps win ties over the
 * episode they belong to. A renderer drawn at another scale passes 12 / renderScale to keep 12 screen px.
 */
export function nearest(t: TreeLayout, p: Pt, max = 12): HitTarget | undefined {
  let best: HitTarget | undefined;
  let bestD = max;
  for (const h of t.hits) {
    const pts = h.points;
    let d = pts.length === 1 ? Math.hypot(p.x - (pts[0] as Pt).x, p.y - (pts[0] as Pt).y) : Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(p, pts[i - 1] as Pt, pts[i] as Pt));
    if (d < bestD || (d === bestD && best?.kind === 'episode' && h.kind === 'step')) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
