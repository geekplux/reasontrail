// Side trails (DESIGN §8.3): a collapsed subagent lane leaves the route at 45°, runs below it, and rejoins at 45°; an
// interrupted lane ends in a perpendicular bar instead. Its label is the agent type in ink, then a status glyph and
// "<n> calls · <duration> · <status word>". The lane colour is a stroke only, never text.
import { StatusGlyph } from './Glyph';
import { laneLines } from './keyboard';
import { G, lineY, type LaneItem } from './layout';

/** Octilinear path of a lane: 45° leave, a vertical siding drop with 16 px chamfers for lower tracks, 45° rejoin. */
export function lanePath(l: LaneItem): string {
  const y0 = G.routeY;
  const y = lineY(l.track);
  const d = G.laneDrop;
  const down = l.track === 0 ? `L${l.x1 + d} ${y}` : `L${l.x1 + d} ${y0 + d} V${y - 16} L${l.x1 + d + 16} ${y}`;
  if (!l.rejoins) return `M${l.x1} ${y0} ${down} H${l.x2}`;
  const end = Math.max(l.x2, l.x1 + 2 * d + (l.track === 0 ? 0 : 32));
  const up = l.track === 0 ? `H${end - d} L${end} ${y0}` : `H${end - d - 16} L${end - d} ${y - 16} V${y0 + d} L${end} ${y0}`;
  return `M${l.x1} ${y0} ${down} ${up}`;
}

export function LanePath({ l }: { l: LaneItem }) {
  const y = lineY(l.track);
  return (
    <g className="lane-mark">
      <path className="lane-line draw" d={lanePath(l)} pathLength={1} />
      {l.status === 'interrupted' && <path className="lane-line" d={`M${l.x2} ${y - 8} V${y + 8}`} />}
    </g>
  );
}

export function LaneLabel({ l }: { l: LaneItem }) {
  const [a, b] = laneLines(l);
  return (
    <>
      <span className="lane-name mono">{a}</span>{' '}
      <span className="lane-facts mono muted"><StatusGlyph status={l.status} /> {b}</span>
    </>
  );
}
