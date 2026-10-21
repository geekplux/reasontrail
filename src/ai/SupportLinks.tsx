// The AI `supports` curves (DESIGN §8.4 [21]): dashed 1 px muted arcs, low over the route, from a selected claim's episode
// to the episodes of its supporting steps, with a dashed ring on each. Only while a claim is selected, never on the
// glance; the only dashed lines on the map. A separate aria-hidden layer: the detail panel lists the same links.
import { G, type GlanceLayout } from '../map/layout';

/** Where each top-level episode's waypoint is on the horizontal route (folded ones sit on the fold chip). */
export function waypointX(L: GlanceLayout): Map<string, number> {
  const x = new Map<string, number>();
  for (const e of L.fold?.episodes ?? []) x.set(e.id, (L.fold?.x ?? 0) + G.foldW / 2);
  for (const r of L.episodes) x.set(r.episode.id, r.x);
  if (L.answer) x.set(L.answer.episode.id, L.routeEnd);
  return x;
}

export function SupportLinks({ L, pairs }: { L: GlanceLayout; pairs: { from: string; to: string[] }[] }) {
  const x = waypointX(L);
  const Y = G.routeY - 7; // just above the waypoints; the arcs stay below the titles' count lines
  const curves = pairs.flatMap(({ from, to }) => {
    const x1 = x.get(from);
    return x1 === undefined ? [] : to.flatMap((id) => {
      const x2 = x.get(id);
      return x2 === undefined || x2 === x1 ? [] : [{ id: `${from}>${id}`, x1, x2, h: Math.min(11, 5 + Math.abs(x2 - x1) / 60) }];
    });
  });
  if (curves.length === 0) return null;
  return (
    <svg className="ai-links" width={L.width} height={L.height} aria-hidden="true" focusable="false" data-ai-links={curves.length}>
      {curves.map((c) => (
        <g key={c.id}>
          <path className="ai-link" d={`M${c.x1} ${Y} Q${(c.x1 + c.x2) / 2} ${Y - c.h * 2} ${c.x2} ${Y}`} />
          <circle className="ai-link" cx={c.x2} cy={G.routeY} r={11} />
        </g>
      ))}
    </svg>
  );
}
