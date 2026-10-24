// Side trails (DESIGN §8.3): a collapsed subagent lane leaves the route at 45°, runs below it, and rejoins at 45°; an
// interrupted lane ends in a perpendicular bar instead. Its label is the agent type in ink, then a status glyph and
// "<n> calls, <duration>, <status word>". The lane colour is a stroke only, never text.
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

/** `expanded`: this side trail is open below the route; it keeps its lane colour at 3 px while the others mute. */
export function LanePath({ l, expanded = false }: { l: LaneItem; expanded?: boolean }) {
  const y = lineY(l.track);
  return (
    <g className={expanded ? 'lane-mark is-expanded' : 'lane-mark'}>
      <path className="lane-line draw" d={lanePath(l)} />
      {l.status === 'interrupted' && <path className="lane-line" d={`M${l.x2} ${y - 8} V${y + 8}`} />}
      {/* No recorded result and no rejoin: the trail ends in an 8 px hollow status circle. */}
      {l.status === 'unknown' && !l.rejoins && <circle className="lane-end" cx={l.x2 + 4} cy={y} r={4} />}
    </g>
  );
}

/** Agent type, then status glyph, "<n> calls, <duration>," (gives way first) and the whole status word. */
export function LaneLabel({ l, availPx, duration = true }: { l: LaneItem; availPx?: number; duration?: boolean }) {
  const { name, count, word } = laneLines(l, { ...(availPx !== undefined ? { availPx } : {}), duration });
  const full = laneLines(l);
  return (
    <>
      <span className="lane-name mono">{name}</span>{' '}
      <span className="lane-facts mono muted" title={`${full.count} ${full.word}`}>
        <StatusGlyph status={l.status} /> <span className="lane-count">{count}</span> <span className="lane-word">{word}</span>
      </span>
    </>
  );
}
