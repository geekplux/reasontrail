import { useEffect, useId, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { pathTo, type GardenTree } from './buildTree';
import { treeKeyAction, visibleItems } from './keyboard';
import { EMPTY_TEXT, layoutGarden, remainderLabel, valueWidth, type Box } from './layout';
import * as M from './metrics';
import { band, branchWidth, dashArray, formatPct, formatToken, formatValue, MARKER, spokenBranch, wsRuns, type MarkerKind } from './scales';

/** A tip marker: the state's shape (spec §3). Also used by the legend. */
export function Marker({ kind, x = 0, y = 0 }: { kind: MarkerKind; x?: number; y?: number }) {
  if (kind === 'ring') return <circle className="marker-ring" cx={x} cy={y} r={M.MARKER_R} />;
  return (
    <>
      <circle className="marker-bud" cx={x} cy={y} r={M.MARKER_R} />
      {kind === 'knot' ? <circle className="marker-knot" cx={x} cy={y} r={M.KNOT_R} /> : null}
    </>
  );
}

/** Token text with whitespace glyphs in their own muted runs. */
export function WsText({ text, Run }: { text: string; Run: 'tspan' | 'span' }) {
  return wsRuns(text).map((r, i) => (r.ws ? <Run key={i} data-ws="">{r.text}</Run> : r.text));
}

interface GardenViewProps {
  garden: GardenTree;
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

export function GardenView({ garden, selectedKey, hoverKey = null, onHover, onActivate, onSelect, note = null }: GardenViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const anchor = useRef<{ key: string; top: number; open: boolean } | null>(null);
  const dropSlack = useRef<(() => void) | null>(null);
  const layout = useMemo(() => layoutGarden(garden), [garden]);
  const items = useMemo(() => visibleItems(garden), [garden]);
  const byKey = new Map(items.map((it, i) => [it.branch.key, { ...it, i }]));
  const uid = useId();
  // Roving tabindex (A1): the garden is one tab stop, on the selected branch (or the first one).
  const tabKey = selectedKey !== null && byKey.has(selectedKey) ? selectedKey : items[0]?.branch.key;
  const labelledKey = hoverKey ?? selectedKey;
  const onPath = new Set(labelledKey ? pathTo(garden, labelledKey).map((b) => b.key) : []);
  const labelled = layout.branches.find((b) => b.branch.key === labelledKey);
  // Thin links on top near the fork: draw in ascending p.
  const drawn = [...layout.branches].sort((a, b) => a.branch.p - b.branch.p);
  const box = layout.viewBox;
  const other = layout.remainders.find((r) => r.parentKey === '');
  const empty = garden.children.length === 0;
  // Value label box (spec §5): right of the label, or above the row on an expanded branch so it never covers its own fork.
  const valueH = M.VALUE_PX + 2 * M.VALUE_PAD_Y + 2;
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
        aria-label={empty ? 'Garden after the prompt: no recorded branches.' : `Garden of next-token choices after the prompt${other ? `; other tokens ${formatPct(other.p)}` : ''}`}
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        width={box.width}
        height={box.height}
        style={{ fontSize: M.TOKEN_PX }}
      >
        <circle className="seed" cx={0} cy={0} r={M.SEED_R} />
        {empty ? (
          <text className="garden-empty" aria-hidden="true" x={M.LABEL_DX} y={0} dominantBaseline="middle">
            {EMPTY_TEXT}
          </text>
        ) : null}
        {layout.remainders.map((r) => (
          <g key={r.parentKey} aria-hidden="true" data-role="remainder" data-parent={r.parentKey} data-p={r.p.toFixed(4)} pointerEvents="none">
            <path d={r.link} strokeWidth={branchWidth(r.p).toFixed(4)} strokeDasharray={dashArray('other', branchWidth(r.p), r.length)} />
            <text x={r.tipX + M.LABEL_DX} y={r.y} dominantBaseline="middle" fontSize={M.VALUE_PX}>
              {remainderLabel(r.p)}
            </text>
          </g>
        ))}
        {drawn.map(({ branch: b, tipX, y, labelX, labelEnd, link, length, hit }) => {
          const w = branchWidth(b.p);
          const self = b.key === labelledKey;
          return (
            <g
              key={b.key}
              className={onPath.has(b.key) ? 'branch on-path' : 'branch'}
              data-key={b.key}
              data-p={b.p.toFixed(4)}
              data-state={b.state}
              data-marker={MARKER[b.state]}
              data-band={band(b.p)}
              data-depth={b.depth}
              role="treeitem"
              id={`${uid}b${byKey.get(b.key)?.i}`}
              tabIndex={b.key === tabKey ? 0 : -1}
              aria-label={spokenBranch(b)}
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
              {onPath.has(b.key) ? <path data-role="casing" d={link} strokeWidth={w + 4} /> : null}
              <path data-role="branch-stroke" d={link} strokeWidth={w.toFixed(4)} strokeDasharray={b.state === 'not-recorded' ? dashArray('not-recorded', w, length) : undefined} />
              <Marker kind={MARKER[b.state]} x={tipX} y={y} />
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
            <rect x={valueX} y={valueY} width={valueWidth(labelled.branch)} height={valueH} rx={2} />
            <text x={valueX + M.VALUE_PAD_X} y={valueY + valueH / 2} dominantBaseline="middle" fontSize={M.VALUE_PX}>
              {formatValue(labelled.branch)}
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
