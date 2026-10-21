// The route (DESIGN §8.1–8.5, §9, §10.3): one application widget with one tab stop and a roving tabindex. Horizontal
// at 768 px and up (an SVG of the route and side trails, with HTML items over it), a vertical rail below 768 px.
// Geometry is always solid; the draw-in sets a dash pattern only while its animation runs.
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { KindMark, KindGlyph, StatusGlyph } from './Glyph';
import { blazeName, countText, episodeName, epId, jumpPattern, laneLines, laneName, move, navItems } from './keyboard';
import { G, lineY, type Blaze, type GlanceLayout, type LaneItem, type RouteEpisode } from './layout';
import { LaneLabel, LanePath } from './LaneView';
import { BlazeMark, blazeData } from './TroubleMarker';

const KEYS = {
  horizontal: 'Use Left and Right arrows to move along the route or a side trail, Down to go into the side trail of a delegate episode or the next track, Up to go back. Home and End go to the first and last item. Right bracket and left bracket jump to the next and previous detected pattern. Enter selects; on a bundle it expands it, and Escape collapses it again.',
  vertical: 'Use Up and Down arrows to move along the route, Right to go into the side trail of a delegate episode, Left to go back to the route. Home and End go to the first and last item. Right bracket and left bracket jump to the next and previous detected pattern. Enter selects; on a bundle it expands it, and Escape collapses it again.',
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
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RouteView({ L, title, vertical, expanded, unfolded, onExpand, onUnfold, announce }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const keysId = useId();
  const items = useMemo(() => navItems(L), [L]);
  const [focus, setFocus] = useState<string>();
  const [current, setCurrent] = useState<string>();
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
    } else setCurrent(id);
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
      const open = [...expanded][0];
      if (open) {
        onExpand(open, false);
        later(open);
        announce('Lane collapsed');
      } else setCurrent(undefined);
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
  const laneProps = (l: LaneItem) => {
    const bundle = l.id.startsWith('bundle:');
    const ids = l.lanes.map((x) => x.id).join(' ');
    return {
      ...item(l.id, laneName(l)),
      'data-lane': ids, 'data-lane-status': l.status,
      ...(bundle ? { 'aria-expanded': false, 'data-expanded': 'false' } : {}),
    };
  };
  const blazeProps = (b: Blaze) => ({ ...item(b.id, blazeName(L, b)), ...blazeData(b) });
  const foldProps = () => ({ ...item('fold', `${plural(L.fold?.episodes.length ?? 0, 'more episode')}, ${plural(L.fold?.steps ?? 0, 'step')}, ${plural(L.fold?.trouble ?? 0, 'detected pattern')}. Folded.`), 'aria-expanded': unfolded });

  useDrawIn(ref);

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- role="application" is the map widget (DESIGN §10.3); its items are buttons
    <div ref={ref} className={vertical ? 'route-app is-vertical' : 'route-app'} role="application" aria-roledescription="reasoning map" aria-label={`Reasoning map: ${title}`} aria-describedby={keysId} onKeyDown={onKeyDown}>
      <p id={keysId} className="visually-hidden">{vertical ? KEYS.vertical : KEYS.horizontal} The Outline view lists the same content as text.</p>
      {vertical ? <Vertical L={L} all={all} epProps={epProps} laneProps={laneProps} blazeProps={blazeProps} foldProps={foldProps} /> : <Horizontal L={L} epProps={epProps} laneProps={laneProps} blazeProps={blazeProps} foldProps={foldProps} />}
    </div>
  );
}

type P<T> = (x: T) => Record<string, unknown>;
interface ViewProps { L: GlanceLayout; epProps: P<RouteEpisode>; laneProps: P<LaneItem>; blazeProps: P<Blaze>; foldProps: () => Record<string, unknown> }

function EpisodeText({ r }: { r: RouteEpisode }) {
  return (
    <>
      <span className="ep-title">{r.episode.title}</span>{' '}
      <span className="ep-count mono">{countText(r)}</span>
    </>
  );
}

function Horizontal({ L, epProps, laneProps, blazeProps, foldProps }: ViewProps) {
  const Y = G.routeY;
  const answerRoom = L.answer ? 44 : 0;
  return (
    <div className="route-scroll">
      <div className="route-canvas" style={{ width: L.width, height: L.height }}>
        <svg className="route-svg" width={L.width} height={L.height} aria-hidden="true" focusable="false">
          {L.lanes.map((l) => <LanePath key={l.id} l={l} />)}
          {L.pieces.map(([a, b]) => <path key={a} className="route-line draw" d={`M${a} ${Y} H${b}`} pathLength={1} />)}
          {L.breaks.map((b) => (
            <g key={b.before} className="idle-break" data-idle-ms={b.ms}>
              <path className="slash" d={`M${b.x + 12} ${Y + 9} L${b.x + 20} ${Y - 9} M${b.x + 24} ${Y + 9} L${b.x + 32} ${Y - 9}`} />
            </g>
          ))}
          {L.episodes.map((r) => <KindMark key={r.episode.id} kind={r.episode.kind} x={r.x} y={Y} />)}
          {L.answer && <KindMark kind="answer" x={L.routeEnd} y={Y} size={20} />}
          {L.answer && L.routeEnd > L.width * 0.45 && <path className="connector" d={`M${L.routeEnd} ${Y + 11} V${L.height}`} />}
        </svg>
        {L.breaks.map((b) => <span key={b.before} className="idle-label mono" style={{ left: b.x, top: Y + 14 }} aria-hidden="true">{b.label.replace(' idle', '')}<br />idle</span>)}
        {L.episodes.map((r, i) => {
          const last = i === L.episodes.length - 1;
          return (
            <div key={r.episode.id} className="map-item ep" style={{ left: r.x - 12, width: r.len, height: Y + 12 }} {...epProps(r)}>
              <span className="ep-text" style={{ width: last && !L.answer ? Math.max(r.len - 14, Math.min(200, L.width - r.x - 30)) : Math.max(32, r.len - 14 - (last ? answerRoom : 0)) }}><EpisodeText r={r} /></span>
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
          <div key={l.id} className="map-item lane-item" style={{ left: l.x1 + 6, top: lineY(l.track) - 10, width: Math.max(88, l.chars * G.monoPx + 12) }} {...laneProps(l)}>
            <LaneLabel l={l} />
          </div>
        ))}
        {L.blazes.map((b) => (
          <div key={b.id} className="map-item blaze" style={{ left: b.x - 12, top: lineY(b.track) - 12 }} {...blazeProps(b)}>
            <BlazeMark b={b} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Vertical({ L, all, epProps, laneProps, blazeProps, foldProps }: ViewProps & { all: RouteEpisode[] }) {
  const rows: ReactNode[] = [];
  const blazes = (pred: (b: Blaze) => boolean) => L.blazes.filter(pred).map((b) => (
    <div key={b.id} className="map-item blaze" {...blazeProps(b)}><BlazeMark b={b} /></div>
  ));
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
          <span className="ep-count mono">{countText(r)}</span>
        </div>
        {blazes((b) => b.track < 0 && b.episodeId === r.episode.id)}
      </div>,
    );
    for (const l of L.lanes.filter((x) => x.episodeId === r.episode.id)) {
      rows.push(
        <div key={l.id} className="vrow vsub">
          <svg className="siding" width="24" height="44" aria-hidden="true" focusable="false"><path d={l.rejoins ? 'M0 0 L14 14 V30 L0 44' : 'M0 0 L14 14 V30 M8 30 H20'} /></svg>
          <div className="map-item vitem lane-item" {...laneProps(l)}>
            <StatusGlyph status={l.status} />
            <span className="mono">{laneLines(l).join(' ')}</span>
          </div>
          {blazes((b) => b.laneItem === l.id)}
        </div>,
      );
    }
  });
  return <div className="vroute">{rows}</div>;
}

/** Draw-in on first render (DESIGN §11): route and lanes stroke in over --tg-dur-route, items fade in, all done by
 * 400 ms. Web Animations with no fill, so the dash pattern exists only while it runs; nothing waits for it to end. */
function useDrawIn(ref: RefObject<HTMLDivElement | null>) {
  const done = useRef(false);
  useLayoutEffect(() => {
    const root = ref.current;
    if (done.current || !root) return;
    done.current = true;
    const ms = parseFloat(getComputedStyle(root).getPropertyValue('--tg-dur-route')) || 0;
    if (ms <= 0 || typeof root.animate !== 'function') return;
    const ease = getComputedStyle(root).getPropertyValue('--tg-ease-grow').trim() || 'ease-out';
    root.querySelectorAll('.draw').forEach((p) => p.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: ms, easing: ease }));
    root.querySelectorAll('.map-item, .idle-label, .mark').forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: Math.min(280, 120 + i * 6), fill: 'backwards' }));
  }, [ref]);
}
