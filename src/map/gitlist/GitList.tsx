// The git-style list (docs/design/v7/PROMPT.md §6, §5.4): one SVG of rails and marks behind real, focusable DOM rows.
// A WAI-ARIA tree: ↑/↓ move, → opens an episode (or enters it, or enters a subagent lane), ← closes it (or goes to the
// parent row), Home/End, Enter opens an episode or selects a step, Esc clears the step, then closes the episode. One
// episode is open at a time. Levels: lane, main-lane episode and end rows 1; a subagent's episodes and verdict 2, under
// their lane row; steps one below their episode.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LabelOverlay, SessionGraph } from '../../../shared/session/types';
import { listTags, tagName } from '../../ai/labels';
import { AlertIcon, KindGlyph, VerdictIcon } from './marks';
import { GEO, STEP_ROWS_MAX, episodeSteps, layoutList, listColumns, listRows, type AnyRow, type GlyphKind, type MoreRow, type Placed, type StepRow } from './rows';
import './gitlist.css';

/** What the list has open: an episode, and maybe one of its steps. Phase 32's tree and detail panel read this. */
export interface ListSelection { episodeId?: string; stepId?: string }

export interface GitListProps {
  g: SessionGraph;
  /** The AI titles overlay: a 12px tag beside each labelled episode. Off (undefined) = the plain list. */
  overlay?: LabelOverlay | undefined;
  /** Open episode and selected step, when the parent controls them (the tree, a `?step=` link). */
  selection?: ListSelection;
  /** A step was selected (Enter, click) or the selection changed (open, close, Esc). */
  onSelect?(selection: ListSelection): void;
  /** The focused or hovered row's episode and step, for the tree's highlight; undefined when none. `via` says
   * which: a parent falls back to the focused row when the pointer leaves. */
  onActive?(active: ListSelection | undefined, via: 'focus' | 'pointer'): void;
  /** The episode hovered in the tree: its row (episode or lane verdict) gets the hover background. */
  hover?: string | undefined;
  /** The phone's list (`listColumns`): no header, # or Start column; the numbers and start times stay for screen readers. */
  compact?: boolean;
}

const KIND: Record<GlyphKind, string> = { discuss: 'task', explore: 'explore', change: 'change', verify: 'verify', answer: 'answer' };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Words a screen reader needs that the columns show by position: each row's name is its text, read as a sentence. */
const vh = (text: string) => <span className="visually-hidden">{text}</span>;

const episodeOf = (row: AnyRow) => (row.kind === 'episode' || row.kind === 'step' || row.kind === 'more' ? row.episodeId : row.kind === 'verdict' ? row.episodeId : undefined);
/** Each visible row's place in the tree: level, parent row and position among its siblings. */
interface TreePos { level: number; parent?: string; setsize: number; posinset: number; kids: boolean }
function treePositions(visible: readonly AnyRow[]): Map<string, TreePos> {
  const pos = new Map<string, TreePos>();
  const groups = new Map<string, TreePos[]>();
  for (const r of visible) {
    const parent = r.kind === 'step' || r.kind === 'more' ? `ep:${r.episodeId}` : (r.kind === 'episode' || r.kind === 'verdict') && !r.main ? `lane:${r.laneId}` : undefined;
    const up = parent ? pos.get(parent) : undefined;
    const p: TreePos = { level: up ? up.level + 1 : 1, setsize: 0, posinset: 0, kids: false };
    if (up && parent) {
      p.parent = parent;
      up.kids = true;
    }
    const group = groups.get(p.parent ?? '') ?? [];
    group.push(p);
    p.posinset = group.length;
    groups.set(p.parent ?? '', group);
    pos.set(r.key, p);
  }
  for (const group of groups.values()) for (const p of group) p.setsize = group.length;
  return pos;
}

const activeOf = (row: AnyRow): ListSelection => {
  const sel: ListSelection = {};
  const ep = episodeOf(row);
  if (ep) sel.episodeId = ep;
  if (row.kind === 'step') sel.stepId = row.stepId;
  return sel;
};

export function GitList({ g, overlay, selection, onSelect, onActive, hover: treeHover, compact = false }: GitListProps) {
  const rows = useMemo(() => listRows(g), [g]);
  const cols = listColumns(compact);
  const [own, setOwn] = useState<ListSelection>({});
  const sel = selection ?? own;
  const [all, setAll] = useState(false);
  const [focusKey, setFocusKey] = useState(rows[0]?.key ?? '');
  // Another session (the viewer reuses the list): drop the old one's open episode, "show all" and focus.
  const [shownG, setShownG] = useState(g);
  if (shownG !== g) {
    setShownG(g);
    setOwn({});
    setAll(false);
    setFocusKey(rows[0]?.key ?? '');
  }
  const els = useRef(new Map<string, HTMLDivElement>());
  const svg = useRef<SVGSVGElement>(null);
  const moved = useRef(false);
  const hovered = useRef<string | undefined>(undefined);

  const steps = useMemo(() => (sel.episodeId ? episodeSteps(g, sel.episodeId) : []), [g, sel.episodeId]);
  const shown: (StepRow | MoreRow)[] = useMemo(() => {
    const at = steps.findIndex((s) => s.stepId === sel.stepId);
    // Hiding five steps or fewer saves too little to cost a click.
    if (all || steps.length <= STEP_ROWS_MAX + 5 || at >= STEP_ROWS_MAX) return steps;
    return [...steps.slice(0, STEP_ROWS_MAX), { kind: 'more', key: `more:${sel.episodeId}`, episodeId: sel.episodeId ?? '', more: steps.length - STEP_ROWS_MAX }];
  }, [steps, all, sel]);
  const listedSteps = shown.filter((s) => s.kind === 'step').length;
  const target = sel.stepId ? `step:${sel.stepId}` : sel.episodeId ? `ep:${sel.episodeId}` : undefined;
  // A leaf episode (nothing to list) is selected in place: no step rows, no gap under it.
  const top = cols.head ? GEO.head : 0;
  const L = useMemo(() => layoutList(rows, sel.episodeId && shown.length > 0 ? { episodeId: sel.episodeId, steps: shown } : undefined, target, top), [rows, sel.episodeId, shown, target, top]);
  const tags = useMemo(() => (overlay ? listTags(g, overlay) : undefined), [g, overlay]);

  const visible = useMemo(() => L.placed.map((p) => p.row), [L]);
  const tree = useMemo(() => treePositions(visible), [visible]);
  const current = visible.some((r) => r.key === focusKey) ? focusKey : (visible[0]?.key ?? '');

  // Keyboard moves focus with the roving tab stop; clicks leave it where the pointer put it.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    els.current.get(current)?.focus();
  }, [current]);

  const update = (next: ListSelection) => {
    if (next.episodeId !== sel.episodeId) setAll(false);
    setOwn(next);
    onSelect?.(next);
  };
  const focus = (key: string | undefined) => {
    if (!key) return;
    moved.current = true;
    setFocusKey(key);
  };
  const toggle = (episodeId: string) => update(sel.episodeId === episodeId ? {} : { episodeId });
  const activate = (row: AnyRow) => {
    if (row.kind === 'episode') toggle(row.episodeId);
    else if (row.kind === 'step') update({ episodeId: row.episodeId, stepId: row.stepId });
    else if (row.kind === 'more') {
      setAll(true);
      focus(steps[STEP_ROWS_MAX]?.key);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    const i = visible.findIndex((r) => r.key === current);
    const row = visible[i];
    if (!row) return;
    const at = tree.get(row.key);
    const opens = row.kind === 'episode' && !row.leaf;
    let handled = true;
    switch (e.key) {
      case 'ArrowDown': focus(visible[i + 1]?.key); break;
      case 'ArrowUp': focus(visible[i - 1]?.key); break;
      case 'Home': focus(visible[0]?.key); break;
      case 'End': focus(visible[visible.length - 1]?.key); break;
      case 'ArrowRight':
        if (opens && sel.episodeId !== row.episodeId) update({ episodeId: row.episodeId });
        else if ((opens || row.kind === 'lane') && at?.kids) focus(visible[i + 1]?.key);
        break;
      case 'ArrowLeft':
        if (opens && sel.episodeId === row.episodeId) update({});
        else focus(at?.parent);
        break;
      case 'Enter':
      case ' ':
        activate(row);
        break;
      case 'Escape':
        if (sel.stepId) update({ episodeId: sel.episodeId ?? '' });
        else if (sel.episodeId) {
          focus(`ep:${sel.episodeId}`);
          update({});
        } else handled = false;
        break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  };

  // Hover only tints the episode's halo: toggled on the SVG node, so it does not re-render every row.
  const halo = (key: string) => svg.current?.querySelector(`[data-halo="${key}"]`);
  const hover = (key: string, on: boolean) => {
    if (on) hovered.current = key;
    else if (hovered.current === key) hovered.current = undefined;
    halo(key)?.classList.toggle('hv', on);
  };
  // A re-render (a click that opens or closes the episode) rewrites the halo's class: put the tint back before paint.
  useLayoutEffect(() => {
    if (hovered.current) halo(hovered.current)?.classList.add('hv');
  });

  const mark = (p: Placed) => {
    const r = p.row;
    if (r.kind === 'episode') {
      const on = sel.episodeId === r.episodeId;
      return (
        <g key={r.key}>
          <circle cx={p.x} cy={p.cy} r="8" className={`halo${on ? ' on' : ''}${treeHover === r.episodeId ? ' hv' : ''}`} data-halo={r.key} />
          <KindGlyph kind={r.glyph} x={p.x} y={p.cy} className={`t-node${on ? ' on' : ''}`} />
          {on && r.leaf && <circle cx={p.x} cy={p.cy} r="10.5" className="ring" />}
        </g>
      );
    }
    if (r.kind === 'verdict') {
      return (
        <g key={r.key}>
          <circle cx={p.x} cy={p.cy} r="9" className="halo" />
          <KindGlyph kind="answer" size={14} x={p.x} y={p.cy} className={`t-node${r.tone === 'fail' ? ' tip-fail' : r.tone === 'ok' ? ' tip-ok' : ''}`} />
        </g>
      );
    }
    if (r.kind !== 'step') return null;
    return (
      <g key={r.key}>
        {r.mark === 'failed' ? <><circle cx={p.x} cy={p.cy} r="5" className="halo" /><path d={`M${p.x - 3} ${p.cy - 3}l6 6m0 -6l-6 6`} className="x" /></>
          : <circle cx={p.x} cy={p.cy} r={r.mark === 'thinking' ? 2 : 2.5} className={r.mark === 'thinking' ? 'm-think' : 'm-step'} />}
        {sel.stepId === r.stepId && <circle cx={p.x} cy={p.cy} r="7.5" className="ring" />}
      </g>
    );
  };

  const content = (r: AnyRow) => {
    const at = (word: string, text: string) => text && (cols.at ? <span className="gl-main gl-at">{vh(word)}{text}</span> : vh(`${word}${text}`));
    // An open episode lists fewer rows than its steps (results fold into their calls, long ones cut off): say how many.
    const count = (n: number | undefined, listed?: number) => n !== undefined && <span className="gl-main gl-steps">{vh(', ')}{n}{vh(n === 1 ? ' step' : ' steps')}{listed !== undefined && listed < n && vh(`, ${listed} shown`)}</span>;
    switch (r.kind) {
      case 'lane':
        return (<><span className="gl-main gl-title t-lane"><span className="gl-text">{r.name}</span></span>{r.agent && <span className="gl-sub gl-title">{vh(', ')}{r.agent}</span>}{count(r.steps)}{at(', starts at ', r.at)}</>);
      case 'episode': {
        const tag = tags?.get(r.episodeId);
        return (
          <>
            {cols.num ? <span className="gl-main gl-num">{vh('Episode ')}{r.n}{vh(': ')}</span> : vh(`Episode ${r.n}: `)}
            <span className="gl-main gl-title">
              <span className="gl-text">{r.title}</span>{r.title.toLowerCase() !== KIND[r.glyph] && vh(`, ${KIND[r.glyph]}`)}
              {tag && overlay && (<><span className="ai-tag" aria-hidden="true">{tag.label}</span>{vh(`, ${tagName(tag, overlay.model)}`)}</>)}
            </span>
            {(r.failed > 0 || r.wait) && (
              <span className="gl-sub gl-title">
                {vh(', ')}
                {r.failed > 0 && <AlertIcon size={12} />}
                <span>{r.failed > 0 && <b>{plural(r.failed, 'failed command')}</b>}{r.failed > 0 && r.wait ? `, ${r.wait}` : r.wait}</span>
              </span>
            )}
            {count(r.steps, sel.episodeId === r.episodeId && !r.leaf ? listedSteps : undefined)}
            {at(', starts at ', r.at)}
          </>
        );
      }
      case 'verdict':
        return (<><span className="gl-main gl-title gl-verdict"><VerdictIcon tone={r.tone} /><span className="t-lane">{r.text}</span></span>{r.dur && <span className="gl-sub gl-title gl-indent">{vh(', after ')}{r.dur}</span>}{count(r.steps)}{at(', at ', r.at)}</>);
      case 'end':
        return (<><span className="gl-main gl-title gl-small">Session ends</span>{at(' at ', r.at)}</>);
      case 'step':
        return (<><span className={`gl-main gl-title${r.mark === 'thinking' ? ' gl-small' : ''}`}><span className="gl-text">{r.label}</span>{r.mark === 'failed' && vh(', failed')}</span>{r.exit && <span className={`gl-main gl-steps${r.mark === 'failed' ? ' gl-bad' : ''}`}>{vh(', ')}{r.exit}</span>}{r.mark !== 'thinking' && at(', ', r.at)}</>);
      default:
        return <span className="gl-main gl-title gl-small"><span className="link">Show {plural(r.more, 'more step')}</span></span>;
    }
  };

  return (
    <div className={compact ? 'gl is-compact' : 'gl'} style={{ height: L.height }}>
      {cols.head && <div className="gl-head" aria-hidden="true"><span className="gl-num">#</span><span className="gl-title">Episode</span><span className="gl-steps">Steps</span><span className="gl-at">Start</span></div>}
      <svg ref={svg} className="gl-svg" width="100%" height={L.height} aria-hidden="true" focusable="false">
        {L.rails.map((r, i) => <path key={i} d={r.d} className={r.cls} />)}
        {L.highlight.map((d, i) => <path key={`h${i}`} d={d} className="r-hi" />)}
        <circle cx={L.root.x} cy={L.root.y} r="4.5" className="m-root" />
        {L.forks.map((f) => <circle key={f.y} cx={f.x} cy={f.y} r="3" className="m-fork" />)}
        <circle cx={L.end.x} cy={L.end.y} r="4" className="m-end" />
        {L.placed.map(mark)}
      </svg>
      <div role="tree" aria-label="Episodes in order">
        {L.placed.map((p) => {
          const r = p.row;
          const at = tree.get(r.key);
          const open = r.kind === 'episode' && sel.episodeId === r.episodeId;
          const hv = treeHover !== undefined && (r.kind === 'episode' || r.kind === 'verdict') && r.episodeId === treeHover;
          const cls = ['gl-row', `gl-${r.kind}`, open && 'is-open', hv && 'is-hv', r.key === target && 'is-sel', r.kind === 'step' && r.mark === 'thinking' && 'is-think'].filter(Boolean).join(' ');
          return (
            <div
              key={r.key}
              ref={(el) => {
                if (el) els.current.set(r.key, el);
                else els.current.delete(r.key);
              }}
              role="treeitem"
              data-row={r.key}
              className={cls}
              style={{ top: p.y, height: p.h }}
              tabIndex={r.key === current ? 0 : -1}
              aria-level={at?.level}
              aria-setsize={at?.setsize}
              aria-posinset={at?.posinset}
              // Selection is a step's (or a leaf episode's); an open episode says so with aria-expanded alone.
              aria-selected={r.kind === 'step' ? r.stepId === sel.stepId : r.kind === 'episode' && r.leaf ? open : undefined}
              aria-expanded={r.kind === 'episode' ? (r.leaf ? undefined : open) : r.kind === 'lane' && at?.kids ? true : undefined}
              onKeyDown={onKey}
              onClick={() => {
                setFocusKey(r.key);
                activate(r);
              }}
              onFocus={() => {
                setFocusKey(r.key);
                onActive?.(activeOf(r), 'focus');
              }}
              onBlur={() => onActive?.(undefined, 'focus')}
              onMouseEnter={() => {
                hover(r.key, true);
                onActive?.(activeOf(r), 'pointer');
              }}
              onMouseLeave={() => {
                hover(r.key, false);
                onActive?.(undefined, 'pointer');
              }}
            >
              {content(r)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

