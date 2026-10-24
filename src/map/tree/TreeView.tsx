// The tree renderer (docs/design/v7/PROMPT.md §5.1, §5.4; classes and states of the canvas, docs/design/v7/gen7.mjs):
// draws `layoutTree` output as one SVG, `role="img"` with a factual summary (the list is the operable structure).
// Hover: the pointer's nearest branch, twig, glyph or number within 12 screen px picks an episode; its path from the
// root stays ink, the rest fades to slate-8 (colour only), and a tooltip names it. `hover` comes from the parent, so
// the list's hovered or focused row drives the same state.
import { useMemo, useState, type PointerEvent } from 'react';
import type { SessionGraph } from '../../../shared/session/types';
import { KindGlyph, VerdictIcon } from '../gitlist/marks';
import { listRows } from '../gitlist/rows';
import { highlight, nearest } from '.';
import type { Box, Label, LabelClass } from './types';
import { treeFor, treeSummary, treeTip } from './view';
import './tree.css';

export interface TreeViewProps {
  g: SessionGraph;
  /** The box in px; below `MIN_BOX` nothing is drawn. */
  width: number;
  height: number;
  /** Numbers, lane blocks, waits and the root's text. */
  labels?: boolean;
  /** Zones the tree keeps clear of (the legend), in px of the box. */
  reserve?: readonly Box[];
  /** The hovered episode (from the tree or the list). */
  hover?: string | undefined;
  onHover?(episodeId: string | undefined): void;
}

const CLS: Record<LabelClass, string> = { num: 't-num', sub: 't-sub', lab: 't-lab', lane: 't-lane' };
const HIT_PX = 12;

function Text({ l }: { l: Label }) {
  return (
    <>
      {l.icon && <g transform={`translate(${l.x} ${l.y - 12})`}><VerdictIcon tone={l.icon} /></g>}
      <text x={l.icon ? l.x + 20 : l.x} y={l.y} textAnchor={l.anchor} className={CLS[l.cls]}>{l.text}</text>
    </>
  );
}

export function TreeView({ g, width, height, labels = true, reserve, hover, onHover }: TreeViewProps) {
  const t = useMemo(() => treeFor(g, width, height, labels, reserve), [g, width, height, labels, reserve]);
  const rows = useMemo(() => listRows(g), [g]);
  const summary = useMemo(() => treeSummary(g, rows), [g, rows]);
  // The last hovered path stays drawn (transparent) after the pointer leaves, so it fades out instead of vanishing.
  const [last, setLast] = useState<string>();
  if (hover && t.paths[hover] && hover !== last) setLast(hover);
  const shown = last && t.paths[last] ? last : undefined;
  const path = useMemo(() => (shown ? highlight(t, shown) : []), [t, shown]);
  const on = hover !== undefined && t.paths[hover] !== undefined;
  const tip = useMemo(() => (on && labels && hover ? treeTip(g, t, hover, rows) : undefined), [on, labels, hover, g, t, rows]);
  if (t.ribbons.length === 0) return null;

  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!onHover || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const s = r.width > 0 ? t.width / r.width : 1; // layout px per screen px
    const hit = nearest(t, { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s }, HIT_PX * s);
    if (hit?.episodeId !== hover) onHover(hit?.episodeId);
  };
  const hv = (episodeId: string) => (on && episodeId === hover ? ' hv' : '');
  const z = t.root.r / 5.5; // a scaled-down tree draws its hand-back dots smaller
  return (
    <svg
      className={`tree${on ? ' hvmode' : ''}`}
      width={t.width}
      height={t.height}
      viewBox={`0 0 ${t.width} ${t.height}`}
      role="img"
      aria-label={summary}
      onPointerMove={move}
      onPointerLeave={() => hover !== undefined && onHover?.(undefined)}
    >
      {t.handBacks.map((b) => <g key={b.laneId}><path d={b.d} className="back" /><circle cx={b.to.x} cy={b.to.y} r={2.5 * z} className="back-end" /></g>)}
      {t.twigs.map((w) => <path key={w.stepId} d={`M${w.base.x} ${w.base.y}L${w.tip.x} ${w.tip.y}`} className={`tw${w.kind === 'thinking' ? ' th' : w.kind === 'failed' ? ' fail' : ''}${hv(w.episodeId)}`} />)}
      {t.ribbons.map((r) => <path key={r.id} d={r.d} data-part={r.id} className={`b${r.episodeId ? hv(r.episodeId) : ''}`} />)}
      <g className={`hv-path${on ? ' on' : ''}`}>{path.map((d, i) => <path key={i} d={d} className="b hv" />)}</g>
      {t.twigs.map((w) => {
        const { x, y } = w.tip;
        if (w.mark === 'leaf') return <path key={w.stepId} d="M0 0Q5.5 -4.2 11 0Q5.5 4.2 0 0Z" transform={`translate(${x} ${y}) rotate(${w.angle}) scale(${w.scale})`} className={`leaf${hv(w.episodeId)}`} />;
        if (w.mark === 'bud') return <circle key={w.stepId} cx={x} cy={y} r={2.4 * w.scale} className={`bud${hv(w.episodeId)}`} />;
        if (w.mark !== 'x') return null;
        const a = 2.8 * w.scale;
        return <path key={w.stepId} d={`M${x - a} ${y - a}L${x + a} ${y + a}M${x + a} ${y - a}L${x - a} ${y + a}`} className="x" />;
      })}
      {t.episodes.map((e) => <g key={e.episodeId}><circle cx={e.at.x} cy={e.at.y} r={e.r + 2.5} className="halo" /><KindGlyph kind={e.kind} size={2 * e.r} x={e.at.x} y={e.at.y} className="t-node" /></g>)}
      {t.tips.map((m) => (
        <g key={m.laneId}>
          <circle cx={m.at.x} cy={m.at.y} r={m.r + 3} className="halo" />
          {m.kind === 'answer' ? <KindGlyph kind="answer" size={2 * m.r} x={m.at.x} y={m.at.y} className={`t-node${m.tone === 'fail' ? ' tip-fail' : m.tone === 'ok' ? ' tip-ok' : ''}`} /> : <circle cx={m.at.x} cy={m.at.y} r={m.r} className="dot" />}
        </g>
      ))}
      <circle cx={t.root.at.x} cy={t.root.at.y} r={t.root.r} className="root" />
      {t.labels.map((l) => <Text key={l.key} l={l} />)}
      {t.blocks.map((b) => b.lines.map((l) => <Text key={l.key} l={l} />))}
      {tip && (
        <g className="tip" transform={`translate(${tip.box.x0} ${tip.box.y0})`}>
          <rect width={tip.box.x1 - tip.box.x0} height={tip.box.y1 - tip.box.y0} rx="10" className="tip-box" />
          <text x="12" y="23" className="t-num">{tip.n}</text>
          <text x="34" y="23" className="t-ep">{tip.title}</text>
          <text x="34" y="42" className="t-sub">{tip.facts}</text>
        </g>
      )}
    </svg>
  );
}
