// The git-style list (docs/design/v7/PROMPT.md §6, §5.4): one SVG of rails and marks behind real, focusable DOM rows.
// A WAI-ARIA tree: ↑/↓ move, → opens an episode (or enters it), ← closes it (or goes to the episode), Home/End, Enter
// opens an episode or selects a step, Esc clears the step, then closes the episode. One episode is open at a time.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LabelOverlay, SessionGraph } from '../../../shared/session/types';
import { episodeTags, tagName } from '../../ai/labels';
import { AlertIcon, KindGlyph, VerdictIcon } from './marks';
import { STEP_ROWS_MAX, episodeSteps, layoutList, listRows, type AnyRow, type GlyphKind, type MoreRow, type Placed, type StepRow } from './rows';
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
  /** The focused or hovered row's episode and step, for the tree's highlight; undefined when none. */
  onActive?(active: ListSelection | undefined): void;
}

const KIND: Record<GlyphKind, string> = { discuss: 'task', explore: 'explore', change: 'change', verify: 'verify', answer: 'answer' };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Words a screen reader needs that the columns show by position: each row's name is its text, read as a sentence. */
const vh = (text: string) => <span className="visually-hidden">{text}</span>;

const episodeOf = (row: AnyRow) => (row.kind === 'episode' || row.kind === 'step' || row.kind === 'more' ? row.episodeId : row.kind === 'verdict' ? row.episodeId : undefined);
const activeOf = (row: AnyRow): ListSelection => {
  const sel: ListSelection = {};
  const ep = episodeOf(row);
  if (ep) sel.episodeId = ep;
  if (row.kind === 'step') sel.stepId = row.stepId;
  return sel;
};

export function GitList({ g, overlay, selection, onSelect, onActive }: GitListProps) {
  const rows = useMemo(() => listRows(g), [g]);
  const [own, setOwn] = useState<ListSelection>({});
  const sel = selection ?? own;
  const [all, setAll] = useState(false);
  const [focusKey, setFocusKey] = useState(rows[0]?.key ?? '');
  const [hover, setHover] = useState<string>();
  const els = useRef(new Map<string, HTMLDivElement>());
  const moved = useRef(false);

  const steps = useMemo(() => (sel.episodeId ? episodeSteps(g, sel.episodeId) : []), [g, sel.episodeId]);
  const shown: (StepRow | MoreRow)[] = useMemo(() => {
    const at = steps.findIndex((s) => s.stepId === sel.stepId);
    if (all || steps.length <= STEP_ROWS_MAX || at >= STEP_ROWS_MAX) return steps;
    return [...steps.slice(0, STEP_ROWS_MAX), { kind: 'more', key: `more:${sel.episodeId}`, episodeId: sel.episodeId ?? '', more: steps.length - STEP_ROWS_MAX }];
  }, [steps, all, sel]);
  const target = sel.stepId ? `step:${sel.stepId}` : sel.episodeId ? `ep:${sel.episodeId}` : undefined;
  const L = useMemo(() => layoutList(rows, sel.episodeId ? { episodeId: sel.episodeId, steps: shown } : undefined, target), [rows, sel.episodeId, shown, target]);
  const tags = useMemo(() => {
    if (!overlay) return undefined;
    const ofStep = new Map(g.episodes.filter((e) => !e.parentId).flatMap((e) => e.stepIds.map((id) => [id, e.id] as const)));
    return episodeTags(g, overlay, (id) => ofStep.get(id));
  }, [g, overlay]);

  const visible = L.placed.map((p) => p.row);
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
    const parent = row.kind === 'step' || row.kind === 'more' ? `ep:${row.episodeId}` : undefined;
    let handled = true;
    switch (e.key) {
      case 'ArrowDown': focus(visible[i + 1]?.key); break;
      case 'ArrowUp': focus(visible[i - 1]?.key); break;
      case 'Home': focus(visible[0]?.key); break;
      case 'End': focus(visible[visible.length - 1]?.key); break;
      case 'ArrowRight':
        if (row.kind === 'episode' && sel.episodeId !== row.episodeId) update({ episodeId: row.episodeId });
        else if (row.kind === 'episode') focus(visible[i + 1]?.key);
        break;
      case 'ArrowLeft':
        if (row.kind === 'episode' && sel.episodeId === row.episodeId) update({});
        else focus(parent);
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

  const level1: AnyRow[] = visible.filter((r) => r.kind !== 'step' && r.kind !== 'more');
  const level2: AnyRow[] = visible.filter((r) => r.kind === 'step' || r.kind === 'more');
  const hoverEp = hover ? visible.find((r) => r.key === hover) : undefined;

  const mark = (p: Placed) => {
    const r = p.row;
    if (r.kind === 'episode') {
      const on = sel.episodeId === r.episodeId;
      return (
        <g key={r.key}>
          <circle cx={p.x} cy={p.cy} r="8" className={`halo${on ? ' on' : hoverEp === r ? ' hv' : ''}`} />
          <KindGlyph kind={r.glyph} x={p.x} y={p.cy} className={`t-node${on ? ' on' : ''}`} />
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
        {r.mark === 'failed' ? <path d={`M${p.x - 3} ${p.cy - 3}l6 6m0 -6l-6 6`} className="x" />
          : <circle cx={p.x} cy={p.cy} r={r.mark === 'thinking' ? 2 : 2.5} className={r.mark === 'thinking' ? 'm-think' : 'm-step'} />}
        {sel.stepId === r.stepId && <circle cx={p.x} cy={p.cy} r="7.5" className="ring" />}
      </g>
    );
  };

  const content = (r: AnyRow) => {
    const at = (word: string, text: string) => text && <span className="gl-main gl-at">{vh(word)}{text}</span>;
    const count = (n: number | undefined) => n !== undefined && <span className="gl-main gl-steps">{vh(', ')}{n}{vh(n === 1 ? ' step' : ' steps')}</span>;
    switch (r.kind) {
      case 'lane':
        return (<><span className="gl-main gl-title t-lane">{r.name}</span>{r.agent && <span className="gl-sub gl-title">{vh(', ')}{r.agent}</span>}{count(r.steps)}{at(', starts at ', r.at)}</>);
      case 'episode': {
        const tag = tags?.get(r.episodeId);
        return (
          <>
            <span className="gl-main gl-num">{vh('Episode ')}{r.n}{vh(': ')}</span>
            <span className="gl-main gl-title">
              <span className="gl-text">{r.title}</span>{vh(`, ${KIND[r.glyph]}`)}
              {tag && overlay && (<><span className="ai-tag" aria-hidden="true" title={tagName(tag, overlay.model)}>{tag.label}</span>{vh(`, ${tagName(tag, overlay.model)}`)}</>)}
            </span>
            {(r.failed > 0 || r.wait) && (
              <span className="gl-sub gl-title">
                {vh(', ')}
                {r.failed > 0 && (<><AlertIcon size={12} /><b>{plural(r.failed, 'failed command')}</b></>)}
                {r.failed > 0 && r.wait ? `, ${r.wait}` : r.wait}
              </span>
            )}
            {count(r.steps)}
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
    <div className="gl" style={{ height: L.height }}>
      <div className="gl-head" aria-hidden="true"><span className="gl-num">#</span><span className="gl-title">Episode</span><span className="gl-steps">Steps</span><span className="gl-at">Start</span></div>
      <svg className="gl-svg" width="100%" height={L.height} aria-hidden="true" focusable="false">
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
          const inner = r.kind === 'step' || r.kind === 'more';
          const set = inner ? level2 : level1;
          const open = r.kind === 'episode' && sel.episodeId === r.episodeId;
          const cls = ['gl-row', `gl-${r.kind}`, open && 'is-open', r.key === target && 'is-sel', r.kind === 'step' && r.mark === 'thinking' && 'is-think'].filter(Boolean).join(' ');
          return (
            <div
              key={r.key}
              ref={(el) => {
                if (el) els.current.set(r.key, el);
                else els.current.delete(r.key);
              }}
              role="treeitem"
              className={cls}
              style={{ top: p.y, height: p.h }}
              tabIndex={r.key === current ? 0 : -1}
              aria-level={inner ? 2 : 1}
              aria-setsize={set.length}
              aria-posinset={set.indexOf(r) + 1}
              aria-selected={r.key === target}
              aria-expanded={r.kind === 'episode' ? open : undefined}
              onKeyDown={onKey}
              onClick={() => {
                setFocusKey(r.key);
                activate(r);
              }}
              onFocus={() => {
                setFocusKey(r.key);
                onActive?.(activeOf(r));
              }}
              onMouseEnter={() => {
                setHover(r.key);
                onActive?.(activeOf(r));
              }}
              onMouseLeave={() => {
                setHover(undefined);
                onActive?.(undefined);
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

