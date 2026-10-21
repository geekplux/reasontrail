// The route (DESIGN §8.1–8.5, §9, §10.3): one application widget with one tab stop and a roving tabindex. Horizontal
// at 768 px and up (an SVG of the route and side trails, with HTML items over it), a vertical rail below 768 px.
// Geometry is always solid; the draw-in sets a dash pattern only while its animation runs.
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { KindMark, KindGlyph } from './Glyph';
import { blazeName, countText, episodeName, epId, jumpPattern, laneAvailPx, laneName, lepId, move, navItems } from './keyboard';
import { G, idleAtEnd, lepBox, lepCountOnly, lineY, type Blaze, type IdleBreak, type GlanceLayout, type LaneItem, type RouteEpisode } from './layout';
import { LaneLabel, LanePath } from './LaneView';
import { BlazeMark, blazeData } from './TroubleMarker';

const KEYS = {
  horizontal: 'Use Left and Right arrows to move along the route or a side trail, Down to go into the side trail of a delegate episode or the next track, Up to go back. Home and End go to the first and last item. Right bracket and left bracket jump to the next and previous detected pattern. Enter opens the details of an episode or pattern; on a side trail or bundle it expands it, and Escape closes the details, then collapses it again.',
  vertical: 'Use Up and Down arrows to move along the route, Right to go into the side trail of a delegate episode, Left to go back to the route. Home and End go to the first and last item. Right bracket and left bracket jump to the next and previous detected pattern. Enter opens the details of an episode or pattern; on a side trail or bundle it expands it, and Escape closes the details, then collapses it again.',
};

interface Props {
  L: GlanceLayout;
  title: string;
  vertical: boolean;
  expanded: ReadonlySet<string>;
  unfolded: boolean;
  onExpand(id: string, open: boolean): void;
  onUnfold(): void;
  announce(text: string): void;
  /** The selected item (its details are open), shown inverted with aria-current. */
  current: string | undefined;
  onSelect(id: string): void;
  /** The side trail expanded in place, and its layout. */
  open?: { lane: string; L: GlanceLayout; name: string } | undefined;
  onToggleLane(id: string, open: boolean): void;
  panelOpen: boolean;
  onClose(): void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RouteView({ L, title, vertical, expanded, unfolded, onExpand, onUnfold, announce, current, onSelect, open, onToggleLane, panelOpen, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const keysId = useId();
  const items = useMemo(() => navItems(L, open), [L, open]);
  const [focus, setFocus] = useState<string>();
  const pending = useRef<string | null>(null);
  const tab = items.some((i) => i.id === focus) ? focus : items.some((i) => i.id === current) ? current : items[0]?.id;
  const total = L.episodes.length + (L.answer ? 1 : 0) + (L.fold?.episodes.length ?? 0);
  const all = [...L.episodes, ...(L.answer ? [L.answer] : [])];
  const breakBefore = (r: RouteEpisode) => L.breaks.find((b) => b.before === r.episode.id);

  const el = (id: string) => ref.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(id)}"]`);
  const go = (id: string | undefined) => {
    if (!id) return;
    setFocus(id);
    el(id)?.focus();
  };
  // After an expand, collapse or unfold re-renders the items, focus goes to the item that was asked for.
  useLayoutEffect(() => {
    const target = pending.current ? el(pending.current) : null;
    if (!target) return;
    pending.current = null;
    target.focus();
  });
  const later = (id: string | null) => {
    pending.current = id;
    if (id) setFocus(id);
  };

  const activate = (id: string) => {
    setFocus(id);
    if (id.startsWith('bundle:')) {
      const lane = L.lanes.find((l) => l.id === id);
      onExpand(id, true);
      later(lane?.lanes[0] ? `lane:${lane.lanes[0].id}` : null);
      announce(`Lane expanded, ${plural(lane?.lanes.length ?? 0, 'subagent')}`);
    } else if (id === 'fold') {
      onUnfold();
      later(epId(L.episodes[G.keepFirst] as RouteEpisode));
      announce(`Route unfolded, ${plural(total, 'episode')}`);
    } else if (id.startsWith('lane:')) {
      onToggleLane(id, open?.lane !== id);
      later(id);
    } else onSelect(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, pre, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return;
    const from = target.getAttribute('data-nav') ?? tab ?? '';
    if (e.key === ']' || e.key === '[') {
      const hit = jumpPattern(L, from, e.key === ']' ? 1 : -1);
      if (!hit) return;
      e.preventDefault();
      go(hit.id);
      announce(hit.say);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(from);
    } else if (e.key === 'Escape') {
      const bundle = [...expanded][0];
      if (panelOpen) onClose();
      else if (open) {
        onToggleLane(open.lane, false);
        later(open.lane);
      } else if (bundle) {
        onExpand(bundle, false);
        later(bundle);
        announce('Lane collapsed');
      }
    } else if (/^Arrow|^Home$|^End$/.test(e.key)) {
      e.preventDefault();
      go(move(items, from, e.key, vertical));
    }
  };

  const item = (id: string, label: string) => ({
    role: 'button' as const,
    tabIndex: id === tab ? 0 : -1,
    'data-nav': id,
    'aria-label': label,
    'aria-current': current === id ? ('true' as const) : undefined,
    onClick: () => activate(id),
    onFocus: () => setFocus(id),
  });
  const epProps = (r: RouteEpisode) => {
    const idle = breakBefore(r);
    return {
      ...item(epId(r), `${idle ? `After ${idle.label}. ` : ''}${episodeName(L, r, total)}`),
      'data-episode-id': r.episode.id, 'data-episode-kind': r.episode.kind, 'data-kind': r.episode.kind, 'data-lane': r.episode.laneId,
    };
  };
  const laneProps = (l: LaneItem, opts: LabelOpts) => {
    const bundle = l.id.startsWith('bundle:');
    const ids = l.lanes.map((x) => x.id).join(' ');
    return {
      ...item(l.id, laneName(l, opts)),
      'data-lane': ids, 'data-lane-status': l.status,
      ...(bundle ? { 'aria-expanded': false, 'data-expanded': 'false' } : { 'aria-expanded': open?.lane === l.id, 'data-expanded': String(open?.lane === l.id) }),
    };
  };
  const lepTotal = open ? open.L.episodes.length + (open.L.answer ? 1 : 0) : 0;
  const lepProps = (r: RouteEpisode) => ({ ...item(lepId(r), `In the ${open?.name ?? ''} side trail. ${episodeName(open?.L ?? L, r, lepTotal)}`), 'data-episode-id': r.episode.id, 'data-episode-kind': r.episode.kind, 'data-lane': r.episode.laneId });
  const blazeProps = (b: Blaze) => ({ ...item(b.id, blazeName(L, b)), ...blazeData(b) });
  const foldProps = () => ({ ...item('fold', `${plural(L.fold?.episodes.length ?? 0, 'more episode')}, ${plural(L.fold?.steps ?? 0, 'step')}, ${plural(L.fold?.trouble ?? 0, 'detected pattern')}. Folded.`), 'aria-expanded': unfolded });

  useDrawIn(ref);

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- role="application" is the map widget (DESIGN §10.3); its items are buttons
    <div ref={ref} className={`route-app${vertical ? ' is-vertical' : ''}${open ? ' has-open-lane' : ''}`} role="application" aria-roledescription="reasoning map" aria-label={`Reasoning map: ${title}`} aria-describedby={keysId} onKeyDown={onKeyDown}>
      <p id={keysId} className="visually-hidden">{vertical ? KEYS.vertical : KEYS.horizontal} The Outline view lists the same content as text.</p>
      {vertical ? <Vertical L={L} all={all} epProps={epProps} laneProps={laneProps} blazeProps={blazeProps} foldProps={foldProps} open={open} lepProps={lepProps} /> : <Horizontal L={L} epProps={epProps} laneProps={laneProps} blazeProps={blazeProps} foldProps={foldProps} open={open} lepProps={lepProps} />}
    </div>
  );
}

type P<T> = (x: T) => Record<string, unknown>;
/** How a lane label is drawn: the same options give its visible text and its accessible name. */
interface LabelOpts { availPx?: number; duration?: boolean }
interface ViewProps { L: GlanceLayout; open?: { lane: string; L: GlanceLayout; name: string } | undefined; lepProps: P<RouteEpisode>; epProps: P<RouteEpisode>; laneProps: (l: LaneItem, opts: LabelOpts) => Record<string, unknown>; blazeProps: P<Blaze>; foldProps: () => Record<string, unknown> }

function EpisodeText({ r, width, countOnly }: { r: RouteEpisode; width?: number; countOnly?: boolean }) {
  const full = countText(r);
  const shown = countText(r, width);
  return (
    <>
      {!countOnly && <><span className="ep-title">{r.episode.title}</span>{' '}</>}
      <span className="ep-count mono" title={shown === full ? undefined : full}>{shown}</span>
    </>
  );
}

/** The idle label under a break: centred in its gap, or right-aligned 6 px short of the terminus connector. */
function idleStyle(L: GlanceLayout, b: IdleBreak) {
  const x = b.x;
  const top = G.routeY + 14;
  return idleAtEnd(b, L.routeEnd) ? { right: L.width - (L.routeEnd - 6), top, textAlign: 'right' as const } : { left: x + G.breakW / 2, top, transform: 'translateX(-50%)' };
}

const inner = (L: GlanceLayout) => [...L.episodes, ...(L.answer ? [L.answer] : [])];
const LANE_Y = 30;

/** An expanded side trail (DESIGN §8.3 [17]): its own route, 3 px lane colour on the lane band, 14 px glyphs, labels below. */
function OpenLane({ open, word, lepProps }: { open: NonNullable<ViewProps['open']>; word: string | undefined; lepProps: P<RouteEpisode> }) {
  const x = (r: RouteEpisode) => (r === open.L.answer ? open.L.routeEnd : r.x);
  const eps = inner(open.L);
  return (
    <div className="lane-route" style={{ width: open.L.width }} data-lane-route={open.lane}>
      <p className="mono lane-route-head" aria-hidden="true">{[open.name, word, eps.length === 1 ? '1 episode' : `${eps.length} episodes`, 'expanded below'].filter(Boolean).join(' · ')}</p>
      <svg className="route-svg" width={open.L.width} height={96} aria-hidden="true" focusable="false">
        <rect className="lane-band" x={0} y={LANE_Y - 12} width={open.L.width} height={24} />
        {eps[0] && <path className="lane-route-line" d={`M${x(eps[0])} ${LANE_Y} H${x(eps[eps.length - 1] as RouteEpisode)}`} />}
        {eps.map((r) => <KindMark key={r.episode.id} kind={r.episode.kind} x={x(r)} y={LANE_Y} size={14} />)}
      </svg>
      {eps.map((r) => {
        const box = lepBox(open.L, r);
        const countOnly = r !== open.L.answer && lepCountOnly(box);
        return (
          <div key={r.episode.id} className={r === open.L.answer ? 'map-item ep lep ep-answer' : 'map-item ep lep'} style={r === open.L.answer ? { left: x(r) - 52, top: LANE_Y - 12, width: 70, height: 72 } : { left: x(r) - 12, top: LANE_Y - 12, width: box.width, height: 72 }} {...lepProps(r)} {...(countOnly ? { title: r.episode.title } : {})}>
            {countOnly ? (
              <span className="ep-text ep-count-only" style={{ width: box.width }}><EpisodeText r={r} width={box.width} countOnly /></span>
            ) : (
              <span className="ep-text" style={{ width: box.text }}><EpisodeText r={r} width={box.text} /></span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Horizontal({ L, epProps, laneProps, blazeProps, foldProps, open, lepProps }: ViewProps) {
  const Y = G.routeY;
  // The terminus (◉, 20 px) always ends the route with 44 px of room; it is labelled only when the last episode is an answer.
  const answerRoom = 44;
  return (
    <div className="route-scroll">
      <div className="route-canvas" style={{ width: L.width, height: L.height }}>
        <svg className="route-svg" width={L.width} height={L.height} aria-hidden="true" focusable="false">
          {L.lanes.map((l) => <LanePath key={l.id} l={l} expanded={open?.lane === l.id} />)}
          {L.pieces.map(([a, b]) => <path key={a} className="route-line draw" d={`M${a} ${Y} H${b}`} pathLength={1} />)}
          {L.breaks.map((b) => (
            <g key={b.before} className="idle-break" data-idle-ms={b.ms}>
              <path className="slash" d={`M${b.x + 12} ${Y + 9} L${b.x + 20} ${Y - 9} M${b.x + 24} ${Y + 9} L${b.x + 32} ${Y - 9}`} />
            </g>
          ))}
          {L.episodes.map((r) => <KindMark key={r.episode.id} kind={r.episode.kind} x={r.x} y={Y} />)}
          <KindMark kind="answer" x={L.routeEnd} y={Y} size={20} />
          {/* The destination card starts at the canvas bottom: the tick stops 5 px short of it. */}
          {L.routeEnd > L.width * 0.45 && <path className="connector" d={`M${L.routeEnd} ${Y + 11} V${L.height - 5}`} />}
        </svg>
        {L.breaks.map((b) => <span key={b.before} className="idle-label mono" style={idleStyle(L, b)} aria-hidden="true">{b.label.replace(' idle', '')}<br />idle</span>)}
        {L.episodes.map((r, i) => {
          const last = i === L.episodes.length - 1;
          const w = Math.max(32, r.len - 14 - (last ? answerRoom : 0));
          return (
            <div key={r.episode.id} className="map-item ep" style={{ left: r.x - 12, width: r.len, height: Y + 12 }} {...epProps(r)}>
              <span className="ep-text" style={{ width: w }}><EpisodeText r={r} width={w} /></span>
            </div>
          );
        })}
        {L.answer && (
          <div className="map-item ep ep-answer" style={{ left: L.routeEnd - 52, width: 70, height: Y + 14 }} {...epProps(L.answer)}>
            <span className="ep-text"><EpisodeText r={L.answer} /></span>
          </div>
        )}
        {L.fold && (
          <div className="map-item fold-chip mono" style={{ left: L.fold.x - 4, top: Y - 12 }} {...foldProps()}>
            ··· {L.fold.episodes.length} episodes · {L.fold.steps} steps
          </div>
        )}
        {L.lanes.map((l) => (
          <div key={l.id} className="map-item lane-item" style={{ left: l.x1 + 6, top: lineY(l.track) - 10, width: laneAvailPx(l) + 10 }} {...laneProps(l, { availPx: laneAvailPx(l) })}>
            <LaneLabel l={l} availPx={laneAvailPx(l)} />
          </div>
        ))}
        {L.blazes.map((b) => (
          <div key={b.id} className="map-item blaze" style={{ left: b.x - 12, top: lineY(b.track) - 12 }} {...blazeProps(b)}>
            <BlazeMark b={b} />
          </div>
        ))}
      </div>
      {open && <OpenLane open={open} word={L.lanes.find((l) => l.id === open.lane)?.word} lepProps={lepProps} />}
    </div>
  );
}

function Vertical({ L, all, epProps, laneProps, blazeProps, foldProps, open, lepProps }: ViewProps & { all: RouteEpisode[] }) {
  const rows: ReactNode[] = [];
  // Blazes sit in their own right-hand column, as wide as the busiest row, so the counts line up beside it.
  const per = new Map<string, number>();
  for (const b of L.blazes) per.set(b.laneItem ?? b.episodeId, (per.get(b.laneItem ?? b.episodeId) ?? 0) + 1);
  const cols = Math.max(0, ...per.values());
  const blazes = (pred: (b: Blaze) => boolean) => cols > 0 && (
    <div className="vblazes" style={{ width: cols * 44 }}>
      {L.blazes.filter(pred).map((b) => <div key={b.id} className="map-item blaze" {...blazeProps(b)}><BlazeMark b={b} /></div>)}
    </div>
  );
  all.forEach((r, i) => {
    if (L.fold && i === G.keepFirst) {
      rows.push(<div key="fold" className="vrow"><div className="map-item vitem fold-chip mono" {...foldProps()}>··· {L.fold.episodes.length} episodes · {L.fold.steps} steps</div></div>);
    }
    const br = L.breaks.find((b) => b.before === r.episode.id);
    if (br) rows.push(<div key={`idle-${r.episode.id}`} className="vbreak mono" data-idle-ms={br.ms} aria-hidden="true"><span className="vslash" />{br.label}</div>);
    rows.push(
      <div key={r.episode.id} className={r === L.answer ? 'vrow is-end' : 'vrow'}>
        <div className="map-item vitem ep" {...epProps(r)}>
          <KindGlyph kind={r.episode.kind} />
          <span className="ep-title">{r.episode.title}</span>{' '}
          <span className="ep-count mono" title={countText(r)}>{countText(r, 9 * G.monoPx)}</span>
        </div>
        {blazes((b) => b.track < 0 && b.episodeId === r.episode.id)}
      </div>,
    );
    for (const l of L.lanes.filter((x) => x.episodeId === r.episode.id)) {
      rows.push(
        <div key={l.id} className="vrow vsub">
          <svg className={open?.lane === l.id ? 'siding is-expanded' : 'siding'} width="24" height="44" aria-hidden="true" focusable="false">
            <path d={l.rejoins ? 'M0 0 L14 14 V30 L0 44' : l.status === 'interrupted' ? 'M0 0 L14 14 V30 M8 30 H20' : l.status === 'unknown' ? 'M0 0 L14 14 V30' : 'M0 0 L14 14 V44'} />
            {!l.rejoins && l.status === 'unknown' && <circle className="lane-end" cx={14} cy={34} r={4} />}
          </svg>
          <div className="map-item vitem vlane" {...laneProps(l, { duration: false })}>
            <span><LaneLabel l={l} duration={false} /></span>
          </div>
          {blazes((b) => b.laneItem === l.id)}
        </div>,
      );
      if (open?.lane === l.id) {
        for (const e of inner(open.L)) {
          rows.push(
            <div key={`lep-${e.episode.id}`} className="vrow vsub vlep">
              <div className="map-item vitem ep" {...lepProps(e)}>
                <KindGlyph kind={e.episode.kind} />
                <span className="ep-title">{e.episode.title}</span>{' '}
                <span className="ep-count mono" title={countText(e)}>{countText(e, 9 * G.monoPx)}</span>
              </div>
            </div>,
          );
        }
      }
    }
  });
  return <div className="vroute">{rows}</div>;
}

/** Draw-in on the page's first map render only (DESIGN §11; a sample switch or Outline round trip does not replay it): route and lanes stroke in over --tg-dur-route, items fade in, all done by
 * 400 ms. Web Animations with no fill, so the dash pattern exists only while it runs; nothing waits for it to end. */
let drawn = false;
function useDrawIn(ref: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (drawn || !root) return;
    drawn = true;
    const ms = parseFloat(getComputedStyle(root).getPropertyValue('--tg-dur-route')) || 0;
    if (ms <= 0 || typeof root.animate !== 'function') return;
    const ease = getComputedStyle(root).getPropertyValue('--tg-ease-grow').trim() || 'ease-out';
    root.querySelectorAll('.draw').forEach((p) => p.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: ms, easing: ease }));
    root.querySelectorAll('.map-item, .idle-label, .mark').forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: Math.min(280, 120 + i * 6), fill: 'backwards' }));
  }, [ref]);
}
