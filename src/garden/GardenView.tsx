import { useEffect, useMemo, useRef } from 'react';
import { pathTo, type GardenTree } from './buildTree';
import { EMPTY_TEXT, layoutGarden, remainderLabel, valueWidth } from './layout';
import * as M from './metrics';
import { band, branchWidth, describeBranch, formatPct, formatToken, formatValue, MARKER, wsRuns, type MarkerKind } from './scales';

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
}

export function GardenView({ garden, selectedKey, hoverKey = null, onHover }: GardenViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = useMemo(() => layoutGarden(garden), [garden]);
  const labelledKey = hoverKey ?? selectedKey;
  const onPath = new Set(labelledKey ? pathTo(garden, labelledKey).map((b) => b.key) : []);
  const labelled = layout.branches.find((b) => b.branch.key === labelledKey);
  // Thin links on top near the fork: draw in ascending p.
  const drawn = [...layout.branches].sort((a, b) => a.branch.p - b.branch.p);
  const box = layout.viewBox;
  const other = layout.remainders.find((r) => r.parentKey === '');
  const summary = garden.children.map((b) => describeBranch(b.token, b.p)).join(', ') + (other ? `; other tokens ${formatPct(other.p)}` : '');
  const empty = garden.children.length === 0;
  // Value label box (spec §5): right of the label, or above the row on an expanded branch so it never covers its own fork.
  const valueH = M.VALUE_PX + 2 * M.VALUE_PAD_Y + 2;
  const above = labelled?.branch.state === 'expanded';
  const valueX = labelled ? (above ? labelled.labelX : labelled.labelEnd + M.FORK_DX) : 0;
  const valueY = labelled ? (above ? labelled.y - 10 - valueH : labelled.y - valueH / 2) : 0;

  // Test hook + "first wow" timing mark, set once the first layout is in the DOM.
  useEffect(() => {
    svgRef.current?.setAttribute('data-ready', 'true');
    performance.mark('tg:garden-ready');
  }, []);

  return (
    <svg
      ref={svgRef}
      data-testid="garden"
      className="garden"
      role="img"
      aria-label={empty ? 'Garden after the prompt: no recorded branches.' : `Garden of next-token choices after the prompt. Top branches: ${summary}.`}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      width={box.width}
      height={box.height}
      style={{ fontSize: M.TOKEN_PX }}
    >
      <circle className="seed" cx={0} cy={0} r={M.SEED_R} />
      {empty ? (
        <text className="garden-empty" x={M.LABEL_DX} y={0} dominantBaseline="middle">
          {EMPTY_TEXT}
        </text>
      ) : null}
      {layout.remainders.map((r) => (
        <g key={r.parentKey} data-role="remainder" data-parent={r.parentKey} data-p={r.p.toFixed(4)} pointerEvents="none">
          <path d={r.link} strokeWidth={branchWidth(r.p).toFixed(4)} />
          <text x={r.tipX + M.LABEL_DX} y={r.y} dominantBaseline="middle" fontSize={M.VALUE_PX}>
            {remainderLabel(r.p)}
          </text>
        </g>
      ))}
      {drawn.map(({ branch: b, tipX, y, labelX, labelEnd, link, hit }) => {
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
            onPointerEnter={() => onHover?.(b.key)}
            onPointerLeave={() => onHover?.(null)}
          >
            {onPath.has(b.key) ? <path data-role="casing" d={link} strokeWidth={w + 4} /> : null}
            <path data-role="branch-stroke" d={link} strokeWidth={w.toFixed(4)} />
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
  );
}
