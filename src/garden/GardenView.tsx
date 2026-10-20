import { useEffect, useMemo, useRef } from 'react';
import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy';
import type { GardenBranch, GardenTree } from './buildTree';
import { branchWidth, formatPct } from './scales';

const ROW = 40; // vertical distance between sibling branches
const COL = 180; // horizontal distance between depths
const FONT = 14;
const PAD = 16;

type Datum = { branch: GardenBranch | null; children: Datum[] };

function toDatum(t: GardenTree): Datum {
  const wrap = (b: GardenBranch): Datum => ({ branch: b, children: b.children.map(wrap) });
  return { branch: null, children: t.children.map(wrap) };
}

/** Label width estimate: monospace advance (0.6em) per char, so layout never measures text. */
const labelWidth = (token: string) => token.length * FONT * 0.6;

/** Where a node's outgoing links start: the seed for the root, the end of the label otherwise. */
function outX(n: HierarchyPointNode<Datum>): number {
  return n.data.branch ? n.y + 8 + labelWidth(n.data.branch.token) + 12 : n.y;
}

export function GardenView({ garden }: { garden: GardenTree }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = useMemo(() => tree<Datum>().nodeSize([ROW, COL])(hierarchy(toDatum(garden))), [garden]);
  const nodes = layout.descendants();
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x));
  const maxY = Math.max(...nodes.map((n) => outX(n)));
  const width = maxY + PAD * 2;
  const height = maxX - minX + ROW + PAD;
  const summary = garden.children.map((b) => `“${b.token.trim()}” ${formatPct(b.p)}`).join(', ');

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
      aria-label={`Garden of next-token choices after the prompt. Top branches: ${summary}.`}
      viewBox={`${-PAD} ${minX - ROW / 2} ${width} ${height}`}
      width={width}
      style={{ maxWidth: '100%', height: 'auto' }}
    >
      <circle className="seed" cx={0} cy={0} r={5} />
      {nodes.slice(1).map((n) => {
        const b = n.data.branch!;
        const parent = n.parent!;
        const x0 = outX(parent);
        const y0 = parent.x;
        const mid = (x0 + n.y) / 2;
        return (
          <g
            key={b.key}
            className="branch"
            data-key={b.key}
            data-p={b.p.toFixed(4)}
            data-state={b.state}
            data-depth={b.depth}
          >
            <title>{`“${b.token}” ${formatPct(b.p)}`}</title>
            <path
              data-role="branch-stroke"
              d={`M${x0},${y0} C${mid},${y0} ${mid},${n.x} ${n.y},${n.x}`}
              strokeWidth={branchWidth(b.p).toFixed(4)}
            />
            <circle className="node" cx={n.y} cy={n.x} r={3} />
            <text x={n.y + 8} y={n.x} dominantBaseline="middle" fontSize={FONT}>
              {b.token}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
