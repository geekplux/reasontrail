// The tree renderer (docs/design/v7/PROMPT.md §5.1, §5.4; classes and states of the canvas, docs/design/v7/gen7.mjs):
// draws `layoutTree` output as one SVG, `role="img"` with a factual summary (the list is the operable structure).
// Hover: the pointer's nearest branch, twig, glyph or number within 12 screen px picks an episode; its path from the
// root stays ink, the rest fades to slate-8 (colour only), and a tooltip names it. `hover` comes from the parent, so
// the list's hovered or focused row drives the same state. Selection: a click or tap on a mark picks it (`onPick`);
// the selected step's path from the root turns blue-9, the rest dims to slate-9, and the step gets a ring and a
// callout with a leader line (Step.html).
import { useMemo, useState, type MouseEvent, type PointerEvent } from 'react';
import type { SessionGraph } from '../../../shared/session/types';
import { KindGlyph, VerdictIcon } from '../gitlist/marks';
import { listRows } from '../gitlist/rows';
import { highlight, nearest } from '.';
import type { Box, HitTarget, Label, LabelClass } from './types';
import { treeCallout, treeFor, treeRing, treeSummary, treeTip } from './view';
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
  /** The selected step, and its callout's two lines (summary, then "Exit code 2, 16 min"). */
  selected?: string | undefined;
  callout?: [string, string] | undefined;
  /** A click or tap on a mark (within 12px; 20px for touch). */
  onPick?(hit: HitTarget): void;
}

const CLS: Record<LabelClass, string> = { num: 't-num', sub: 't-sub', lab: 't-lab', lane: 't-lane' };
const HIT_PX = 12;
const TAP_PX = 20;

function Text({ l, on = false }: { l: Label; on?: boolean }) {
  return (
    <>
      {l.icon && <g transform={`translate(${l.x} ${l.y - 12})`}><VerdictIcon tone={l.icon} /></g>}
      <text x={l.icon ? l.x + 20 : l.x} y={l.y} textAnchor={l.anchor} className={`${CLS[l.cls]}${on ? ' on' : ''}`}>{l.text}</text>
    </>
  );
}

export function TreeView({ g, width, height, labels = true, reserve, hover, onHover, selected, callout, onPick }: TreeViewProps) {
  const t = useMemo(() => treeFor(g, width, height, labels, reserve), [g, width, height, labels, reserve]);
  const rows = useMemo(() => listRows(g), [g]);
  const summary = useMemo(() => treeSummary(g, rows), [g, rows]);
  // The last hovered path stays drawn (transparent) after the pointer leaves, so it fades out instead of vanishing;
  // another graph (a tab switch) forgets it.
  const [last, setLast] = useState<{ g: SessionGraph; id: string }>();
  if (hover && t.paths[hover] && (hover !== last?.id || g !== last.g)) setLast({ g, id: hover });
  const shown = last && last.g === g && t.paths[last.id] ? last.id : undefined;
  const path = useMemo(() => (shown ? highlight(t, shown) : []), [t, shown]);
  const on = hover !== undefined && t.paths[hover] !== undefined;
  // A lane tip without an episode of its own, under the pointer: its tooltip is the lane's verdict.
  const [via, setVia] = useState<{ episodeId: string; lane: string }>();
  const tipLane = via && via.episodeId === hover ? via.lane : undefined;
  const sel = selected && t.paths[selected] ? selected : undefined;
  const selPath = useMemo(() => (sel ? highlight(t, sel) : []), [t, sel]);
  const selEp = sel ? t.twigs.find((w) => w.stepId === sel)?.episodeId : undefined;
  // The ring is drawn without labels too (the phone's silhouette); the callout only with them.
  const ring = useMemo(() => (sel ? treeRing(t, sel) : undefined), [t, sel]);
  const call = useMemo(() => (sel && callout && labels ? treeCallout(t, sel, callout, reserve) : undefined), [t, sel, callout, labels, reserve]);
  // The hover tooltip keeps clear of the selection's callout and ring.
  const tip = useMemo(() => {
    if (!on || !labels || !hover) return undefined;
    const keep = call ? [...(reserve ?? []), call.box] : reserve;
    const ringBox = call && { x0: call.ring.x - 10, y0: call.ring.y - 10, x1: call.ring.x + 10, y1: call.ring.y + 10 };
    return treeTip(g, t, hover, { rows, tipLane, reserve: keep, ring: ringBox });
  }, [on, labels, hover, g, t, rows, tipLane, reserve, call]);
  if (t.ribbons.length === 0) return null;

  const hitAt = (e: { currentTarget: SVGSVGElement; clientX: number; clientY: number }, px: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = r.width > 0 ? t.width / r.width : 1; // layout px per screen px
    return nearest(t, { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s }, px * s);
  };
  const click = (e: MouseEvent<SVGSVGElement>) => {
    const hit = onPick && hitAt(e, (e.nativeEvent as globalThis.PointerEvent).pointerType === 'touch' ? TAP_PX : HIT_PX);
    if (hit) onPick?.(hit);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!onHover || e.pointerType === 'touch') return;
    const hit = hitAt(e, HIT_PX);
    const lane = hit?.tipLane;
    if (lane !== via?.lane || hit?.episodeId !== via?.episodeId) setVia(hit && lane ? { episodeId: hit.episodeId, lane } : undefined);
    if (hit?.episodeId !== hover) onHover(hit?.episodeId);
  };
  const hv = (episodeId: string) => (on && episodeId === hover ? ' hv' : '');
  const hi = (stepId: string) => (stepId === sel ? ' hi' : '');
  const z = t.root.r / 5.5; // a scaled-down tree draws its hand-back dots smaller
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- a pointer shortcut; the list is the keyboard path to every step (§5.4)
    <svg
      className={`tree${on ? ' hvmode' : ''}${sel ? ' dim' : ''}${onPick ? ' pickable' : ''}`}
      width={t.width}
      height={t.height}
      viewBox={`0 0 ${t.width} ${t.height}`}
      role="img"
      aria-label={summary}
      onPointerMove={move}
      onClick={click}
      onPointerLeave={() => {
        setVia(undefined);
        if (hover !== undefined) onHover?.(undefined);
      }}
    >
      {t.handBacks.map((b) => <g key={b.laneId}><path d={b.d} className="back" /><circle cx={b.to.x} cy={b.to.y} r={2.5 * z} className="back-end" /></g>)}
      {t.twigs.map((w) => <path key={w.stepId} data-step={w.stepId} d={`M${w.base.x} ${w.base.y}L${w.tip.x} ${w.tip.y}`} className={`tw${w.kind === 'thinking' ? ' th' : w.kind === 'failed' ? ' fail' : ''}${hv(w.episodeId)}${hi(w.stepId)}`} />)}
      {t.ribbons.map((r) => <path key={r.id} d={r.d} data-part={r.id} className={`b${r.episodeId ? hv(r.episodeId) : ''}`} />)}
      <g className={`hv-path${on ? ' on' : ''}`}>{path.map((d, i) => <path key={i} d={d} className="b hv" />)}</g>
      {selPath.map((d, i) => <path key={`s${i}`} d={d} className="b hi" />)}
      {t.twigs.map((w) => {
        const { x, y } = w.tip;
        if (w.mark === 'leaf') return <path key={w.stepId} d="M0 0Q5.5 -4.2 11 0Q5.5 4.2 0 0Z" transform={`translate(${x} ${y}) rotate(${w.angle}) scale(${w.scale})`} className={`leaf${hv(w.episodeId)}${hi(w.stepId)}`} />;
        if (w.mark === 'bud') return <circle key={w.stepId} cx={x} cy={y} r={2.4 * w.scale} className={`bud${hv(w.episodeId)}${hi(w.stepId)}`} />;
        if (w.mark !== 'x') return null;
        const a = 2.8 * w.scale;
        return <path key={w.stepId} d={`M${x - a} ${y - a}L${x + a} ${y + a}M${x + a} ${y - a}L${x - a} ${y + a}`} className="x" />;
      })}
      {t.episodes.map((e) => <g key={e.episodeId}><circle cx={e.at.x} cy={e.at.y} r={e.r + 2.5} className="halo" /><KindGlyph kind={e.kind} size={2 * e.r} x={e.at.x} y={e.at.y} className={`t-node${e.episodeId === selEp ? ' on' : ''}`} /></g>)}
      {t.tips.map((m) => (
        <g key={m.laneId}>
          <circle cx={m.at.x} cy={m.at.y} r={m.r + 3} className="halo" />
          {m.kind === 'answer' ? <KindGlyph kind="answer" size={2 * m.r} x={m.at.x} y={m.at.y} className={`t-node${m.tone === 'fail' ? ' tip-fail' : m.tone === 'ok' ? ' tip-ok' : ''}`} /> : <circle cx={m.at.x} cy={m.at.y} r={m.r} className="dot" />}
        </g>
      ))}
      <circle cx={t.root.at.x} cy={t.root.at.y} r={t.root.r} className="root" />
      {ring && <circle cx={ring.x} cy={ring.y} r="8" className="ring" />}
      {t.labels.map((l) => <Text key={l.key} l={l} on={selEp !== undefined && l.key === `num:${selEp}`} />)}
      {t.blocks.map((b) => b.lines.map((l) => <Text key={l.key} l={l} />))}
      {call && (
        <g className="callout">
          <path d={`M${call.leader[0].x} ${call.leader[0].y}L${call.leader[1].x} ${call.leader[1].y}`} className="lead" />
          <text x={call.x} y={call.y} textAnchor={call.anchor} className="t-lab">{call.lines[0]}</text>
          <text x={call.x} y={call.y + 16} textAnchor={call.anchor} className="t-sub">{call.lines[1]}</text>
        </g>
      )}
      {tip && (
        <g className="tip" transform={`translate(${tip.box.x0} ${tip.box.y0})`}>
          <rect width={tip.box.x1 - tip.box.x0} height={tip.box.y1 - tip.box.y0} rx="8" className="tip-box" />
          {tip.n !== undefined && <text x="12" y="23" className="t-num">{tip.n}</text>}
          <text x={tip.n === undefined ? 12 : 34} y="23" className="t-ep">{tip.title}</text>
          <text x={tip.n === undefined ? 12 : 34} y="42" className="t-sub">{tip.facts}</text>
        </g>
      )}
    </svg>
  );
}
