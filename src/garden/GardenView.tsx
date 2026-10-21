import { useEffect, useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { pathTo, type GardenTree } from './buildTree';
import { treeKeyAction, visibleItems } from './keyboard';
import { EMPTY_TEXT, forkLinks, remainderLabel, valueWidth, type Box, type GardenLayout } from './layout';
import * as M from './metrics';
import type { SampledPath } from './samplePath';
import { band, branchWidth, dashArray, formatPct, formatToken, formatValue, MARKER, spokenBranch, wsRuns, type MarkerKind } from './scales';

/** The remainder stub is hidden below this shown chance (so it vanishes at T = 0). */
const MIN_REST = 0.0005;
/** Walk step per edge as a CSS custom property, plus the edge index for the delay (spec §10.3). */
const walkStyle = (i: number, w?: number) => ({ '--i': i, ...(w === undefined ? {} : { strokeWidth: w }) }) as CSSProperties;
/** The sampled path's ink underlay and accent stroke (spec §3: never colour alone). Keyed by the walk, so a new walk redraws. */
function SampledLink({ d, w, i, dash }: { d: string; w: number; i: number; dash?: string | undefined }) {
  return (
    <>
      <path data-role="sampled-underlay" d={d} style={{ strokeWidth: w + 3 }} />
      <path data-role="sampled-stroke" data-sampled-step={i} data-walk={dash ? 'fade' : 'draw'} d={d} pathLength={dash ? undefined : 1} strokeDasharray={dash} style={walkStyle(i, w)} />
    </>
  );
}

/** A tip marker: the state's shape (spec §3). Also used by the legend. */
export function Marker({ kind, x = 0, y = 0 }: { kind: MarkerKind; x?: number; y?: number }) {
  if (kind === 'ring') return <circle className="marker-ring" cx={x} cy={y} r={M.MARKER_R} />;
  if (kind === 'diamond') return <rect className="marker-diamond" x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`} />;
  return (
    <>
      <circle className="marker-bud" cx={x} cy={y} r={M.MARKER_R} />
      {kind === 'knot' ? <circle className="marker-knot" cx={x} cy={y} r={M.KNOT_R} /> : null}
    </>
  );
}

/** Token text with whitespace glyphs in their own muted runs. In HTML the glyphs are hidden from screen readers, which
 *  hear a real space instead of "dot". */
export function WsText({ text, Run }: { text: string; Run: 'tspan' | 'span' }) {
  return wsRuns(text).map((r, i) =>
    !r.ws ? (
      r.text
    ) : Run === 'span' ? (
      <span key={i}>
        <span data-ws="" aria-hidden="true">
          {r.text}
        </span>
        <span className="visually-hidden"> </span>
      </span>
    ) : (
      <Run key={i} data-ws="">
        {r.text}
      </Run>
    ),
  );
}

interface GardenViewProps {
  /** The shown (tempered) garden. */
  garden: GardenTree;
  /** Its layout, computed from the recorded garden: it never depends on temperature (spec §10.1). */
  layout: GardenLayout;
  /** A sampled path to highlight; `walk` > 0 animates the draw (0: shown at once). */
  sampled?: { path: SampledPath; walk: number } | null;
  /** Click (phase 4) or focus (phase 5) selection; labelled when nothing is hovered. */
  selectedKey: string | null;
  hoverKey?: string | null;
  onHover?(key: string | null): void;
  /** Click (phase 4) or Enter/Space (phase 5) on a branch. */
  onActivate?(key: string): void;
  /** Keyboard focus moved to a branch (arrows, Home, End): it becomes the selection. */
  onSelect?(key: string): void;
  /** A note placed by `placeNote` next to one branch (e.g. "Not in this recording."), in drawing coordinates. */
  note?: { box: Box; content: ReactNode } | null;
}

/** The branch group with `key`, and its hit rect (keys are arbitrary text, so no attribute selector). */
const groupOf = (svg: SVGSVGElement | null, key: string | undefined) =>
  [...(svg?.querySelectorAll<SVGGElement>('g.branch') ?? [])].find((g) => g.getAttribute('data-key') === key);
const hitOf = (svg: SVGSVGElement | null, key: string | undefined) => groupOf(svg, key)?.querySelector('[data-role="hit"]');
const TREE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']);

export function GardenView({ garden, layout, sampled = null, selectedKey, hoverKey = null, onHover, onActivate, onSelect, note = null }: GardenViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const anchor = useRef<{ key: string; top: number; open: boolean } | null>(null);
  const dropSlack = useRef<(() => void) | null>(null);
  const items = useMemo(() => visibleItems(garden), [garden]);
  const byKey = useMemo(() => new Map(items.map((it, i) => [it.branch.key, { ...it, i }])), [items]);
  const restOf = (parentKey: string) => (parentKey ? byKey.get(parentKey)?.branch.next : garden.next)?.rest ?? 0;
  // Shown widths restack each fork's bundle; tips never move (spec §10.1).
  const links = useMemo(() => {
    const out = new Map<string, { link: string; length: number }>();
    for (const f of layout.forks) {
      const rest = (f.parentKey ? byKey.get(f.parentKey)?.branch.next : garden.next)?.rest ?? 0;
      const ws = f.tips.map((tip) => (tip.key === null ? (rest >= MIN_REST ? branchWidth(rest) : 0) : branchWidth(byKey.get(tip.key)?.branch.p ?? 0)));
      forkLinks(f, ws).forEach((l, i) => out.set(f.tips[i]!.key ?? `\0${f.parentKey}`, l));
    }
    return out;
  }, [layout, byKey, garden]);
  const shown = (key: string) => byKey.get(key)!.branch;
  // Sampled path: edge index per key; the stop node keeps its own marker (no diamond).
  const steps = new Map(sampled?.path.keys.map((k, i) => [k, i]));
  const stopKey = sampled && sampled.path.stop !== 'other' ? sampled.path.keys.at(-1) : undefined;
  const otherAt = sampled?.path.stop === 'other' ? (sampled.path.keys.at(-1) ?? '') : null;
  const walk = sampled?.walk ?? 0;
  const animate = walk > 0 && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const stepMs = Math.min(80, 600 / Math.max(1, (sampled?.path.keys.length ?? 0) + (otherAt === null ? 0 : 1)));
  const uid = useId();
  // Roving tabindex (A1): the garden is one tab stop, on the selected branch (or the first one).
  const tabKey = selectedKey !== null && byKey.has(selectedKey) ? selectedKey : items[0]?.branch.key;
  const labelledKey = hoverKey ?? selectedKey;
  const onPath = new Set(labelledKey ? pathTo(garden, labelledKey).map((b) => b.key) : []);
  const labelled = layout.branches.find((b) => b.branch.key === labelledKey);
  // Thin links on top near the fork: draw in ascending p.
  const drawn = [...layout.branches].sort((a, b) => shown(a.branch.key).p - shown(b.branch.key).p);
  const box = layout.viewBox;
  const other = garden.next && garden.children.length ? garden.next.rest : 0;
  const empty = garden.children.length === 0;
  // Value label box (spec §5): right of the label, or above the row on an expanded branch so it never covers its own fork.
  const valueH = M.VALUE_PX + 2 * M.VALUE_PAD_Y + 2;
  const labelledShown = labelled ? shown(labelled.branch.key) : null;
  const above = labelled?.branch.state === 'expanded';
  const valueX = labelled ? (above ? labelled.labelX : labelled.labelEnd + M.FORK_DX) : 0;
  // Above: bottom edge 9 px over the row, so the box overlaps its own hit rect (reachable) but not the row above's.
  const valueY = labelled ? (above ? labelled.y - 9 - valueH : labelled.y - valueH / 2) : 0;

  // Test hook + "first wow" timing mark, set once the first layout is in the DOM.
  useEffect(() => {
    svgRef.current?.setAttribute('data-ready', 'true');
    performance.mark('tg:garden-ready');
    return () => dropSlack.current?.();
  }, []);

  // Growth stability (spec §4): keep the activated branch still on screen, then bring its new children into view.
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    const hit = a && hitOf(svgRef.current, a.key);
    if (!a || !hit) return;
    // Temporary slack under the figure (inside main, above the footer) lets the scroll compensate fully when growth
    // above the branch is taller than the page can scroll; dropped on the next activation or once scrolled back up.
    dropSlack.current?.();
    const delta = hit.getBoundingClientRect().top - a.top;
    const room = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
    const figure = svgRef.current?.closest('figure');
    if (delta > room && figure) {
      const px = Math.ceil(delta - room);
      figure.style.paddingBottom = `${px}px`;
      const onScroll = () => {
        if (window.scrollY <= document.documentElement.scrollHeight - window.innerHeight - px) drop();
      };
      const drop = () => {
        figure.style.paddingBottom = '';
        window.removeEventListener('scroll', onScroll);
        dropSlack.current = null;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      dropSlack.current = drop;
    }
    window.scrollBy({ top: delta, behavior: 'instant' });
    performance.mark('tg:activate-end');
    performance.measure(a.open ? 'tg:collapse' : 'tg:expand', 'tg:activate-start', 'tg:activate-end');
    const kids = a.open ? [] : (layout.branches.find((b) => b.branch.key === a.key)?.branch.children ?? []);
    for (const kid of [kids[0], kids.at(-1)]) hitOf(svgRef.current, kid?.key)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [layout]);

  // Click, Enter/Space, Right on a closed branch, Left on an open one: one handler, so all of them stay anchored (spec §4).
  const activate = (key: string) => {
    const top = hitOf(svgRef.current, key)?.getBoundingClientRect().top ?? 0;
    anchor.current = { key, top, open: byKey.get(key)?.branch.state === 'expanded' };
    performance.mark('tg:activate-start');
    onActivate?.(key);
  };

  const onKeyDown = (key: string, e: KeyboardEvent) => {
    if ( !TREE_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const action = treeKeyAction(items, key, e.key);
    if (action?.type === 'activate') activate(action.key);
    else if (action) {
      onSelect?.(action.key);
      groupOf(svgRef.current, action.key)?.focus({ preventScroll: true });
      // scroll-padding keeps it clear of the sticky readout on phones.
      hitOf(svgRef.current, action.key)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  return (
    <>
      <svg
        ref={svgRef}
        data-testid="garden"
        className="garden"
        role={empty ? 'img' : 'tree'}
        // Strokes are drawn thinnest-last (paint order); aria-owns gives assistive tech the tree order instead.
        aria-owns={empty ? undefined : items.map((_, i) => `${uid}b${i}`).join(' ')}
        aria-label={empty ? 'Garden after the prompt: no recorded branches.' : `Garden of next-token choices after the prompt${other >= MIN_REST ? `; other tokens ${formatPct(other)}` : ''}`}
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        width={box.width}
        height={box.height}
        style={{ fontSize: M.TOKEN_PX, '--tg-step': `${stepMs}ms` } as CSSProperties}
        data-walk={animate ? 'on' : undefined}
      >
        <circle className="seed" cx={0} cy={0} r={M.SEED_R} />
        {empty ? (
          <text className="garden-empty" aria-hidden="true" x={M.LABEL_DX} y={0} dominantBaseline="middle">
            {EMPTY_TEXT}
          </text>
        ) : null}
        {layout.remainders.map((r) => {
          const p = restOf(r.parentKey);
          if (p < MIN_REST) return null;
          const w = branchWidth(p);
          const { link, length } = links.get(`\0${r.parentKey}`)!;
          const dash = dashArray('other', w, length);
          const drew = otherAt === r.parentKey;
          return (
            <g key={r.parentKey} aria-hidden="true" data-role="remainder" data-parent={r.parentKey} data-p={p.toFixed(4)} data-p-recorded={r.p.toFixed(4)} pointerEvents="none">
              <path data-role="remainder-stroke" d={link} style={{ strokeWidth: w }} strokeDasharray={dash} />
              {drew ? <SampledLink key={walk} d={link} w={w} i={steps.size} dash={dash} /> : null}
              <text x={r.tipX + M.LABEL_DX} y={r.y} dominantBaseline="middle" fontSize={M.VALUE_PX}>
                {remainderLabel(p)}
                {drew ? ' · sampled' : ''}
              </text>
            </g>
          );
        })}
        {drawn.map(({ branch: { key }, tipX, y, labelX, labelEnd, hit }) => {
          const b = shown(key);
          const { link, length } = links.get(key)!;
          const w = branchWidth(b.p);
          const self = b.key === labelledKey;
          const step = steps.get(key);
          const marker = step !== undefined && key !== stopKey ? 'diamond' : MARKER[b.state];
          return (
            <g
              key={b.key}
              className={onPath.has(b.key) ? 'branch on-path' : 'branch'}
              data-key={b.key}
              data-p={b.p.toFixed(4)}
              data-p-recorded={b.recordedP.toFixed(4)}
              data-state={b.state}
              data-marker={marker}
              data-band={band(b.p)}
              data-depth={b.depth}
              role="treeitem"
              id={`${uid}b${byKey.get(b.key)?.i}`}
              tabIndex={b.key === tabKey ? 0 : -1}
              aria-label={`${spokenBranch(b)}${step === undefined ? '' : ', sampled'}`}
              aria-level={b.depth}
              aria-setsize={byKey.get(b.key)?.setSize}
              aria-posinset={b.rank + 1}
              aria-expanded={b.state === 'not-recorded' ? undefined : b.state === 'expanded'}
              aria-selected={b.key === selectedKey}
              onPointerEnter={() => onHover?.(b.key)}
              onPointerLeave={() => onHover?.(null)}
              onClick={() => activate(b.key)}
              onKeyDown={(e) => onKeyDown(b.key, e)}
              onFocus={() => {
                if (b.key !== selectedKey) onSelect?.(b.key);
              }}
            >
              {onPath.has(b.key) ? <path data-role="casing" d={link} style={{ strokeWidth: w + 4 }} /> : null}
              <path data-role="branch-stroke" d={link} style={{ strokeWidth: w }} strokeDasharray={b.state === 'not-recorded' ? dashArray('not-recorded', w, length) : undefined} />
              {step === undefined ? null : <SampledLink key={`l${walk}`} d={link} w={w} i={step} />}
              {marker === 'diamond' ? (
                <rect key={`d${walk}`} className="marker-diamond" data-walk="fade" x={tipX - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${tipX} ${y})`} style={walkStyle(step! + 1)} />
              ) : (
                <Marker kind={marker} x={tipX} y={y} />
              )}
              {self ? <circle className="selected-ring" cx={tipX} cy={y} r={M.SELECTED_R} /> : null}
              <text x={labelX} y={y} dominantBaseline="middle">
                <WsText text={formatToken(b.token)} Run="tspan" />
              </text>
              {self ? <line className="selected-underline" x1={labelX} x2={labelEnd} y1={y + 9.5} y2={y + 9.5} /> : null}
              <rect data-role="hit" {...hit} />
            </g>
          );
        })}
        {labelled ? (
          <g
            data-role="value-label"
            data-key={labelled.branch.key}
            aria-hidden="true"
            onPointerEnter={() => onHover?.(labelled.branch.key)}
            onPointerLeave={() => onHover?.(null)}
          >
            <rect x={valueX} y={valueY} width={valueWidth(labelledShown!)} height={valueH} rx={2} />
            <text x={valueX + M.VALUE_PAD_X} y={valueY + valueH / 2} dominantBaseline="middle" fontSize={M.VALUE_PX}>
              {formatValue(labelledShown!)}
            </text>
          </g>
        ) : null}
      </svg>
      {note ? (
        <div className="garden-note" style={{ left: note.box.x - box.x, top: note.box.y - box.y }}>
          {note.content}
        </div>
      ) : null}
    </>
  );
}
