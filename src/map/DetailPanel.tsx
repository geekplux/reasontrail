// The detail panel (DESIGN §10.1, DM17–DM21; PLAN M3): a non-modal region, 440 px on the right at ≥ 1024 px and a
// bottom sheet below that. Focus goes to its title on open; Esc closes it and the map puts focus back. Breadcrumb,
// kind line, title, the selected step by tool (Bash, Edit, Read/Grep, Agent, words), provenance with Show raw and
// Copy link, previous/next, and the rule note for patterns. Everything from the transcript is rendered as text.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { BlazeIcon, InfoGlyph, KindGlyph } from './Glyph';
import { HONESTY_TEXT, HOW_TO_READ_URL } from './HonestyLabel';
import { KIND_WORD } from './keyboard';
import type { GlanceLayout } from './layout';
import { duration, fileLabel, isUnstoredThinking } from './outline';
import { RawRecord } from './RawRecord';
import { excerpt, laneWord, textHead, lineDiff, ownWords, patternLine, rawRecords, rowCategory, rowLabel, RULE_WORDS, shortId, stepSay, type Row, type Target } from './details';
import { RowGlyph, rowWords, since } from './StepList';

interface Props {
  g: SessionGraph;
  L: GlanceLayout;
  target: Target;
  rows: Row[];
  step: string | undefined;
  vertical: boolean;
  focusOnOpen: boolean;
  /** Open with the raw record shown (the destination's "Show raw"). */
  openRaw?: boolean;
  onStep(id: string): void;
  onClose(): void;
  onPattern(dir: 1 | -1): void;
  onOpenLane?: ((laneId: string) => void) | undefined;
  linkFor(stepId: string): string;
  announce(text: string): void;
  /** The selected step's AI label and supports, while the overlay is on (phase 21). */
  aiNote?: ReactNode;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DetailPanel({ g, L, target, rows, step, vertical, focusOnOpen, openRaw = false, onStep, onClose, onPattern, onOpenLane, linkFor, announce, aiNote }: Props) {
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [full, setFull] = useState(false);
  const shown = useRef<string | null>(null);
  const pattern = target.kind === 'pattern';
  const nav = pattern ? rows.filter((r) => r.ids.some((id) => target.evidence.has(id))) : rows;
  const row = rows.find((r) => r.id === step) ?? nav[0] ?? rows[0];
  const at = row ? nav.indexOf(row) : -1;

  // Focus moves to the title when an item opens (not when a step changes inside it).
  useLayoutEffect(() => {
    if (shown.current === target.item) return;
    shown.current = target.item;
    if (focusOnOpen) title.current?.focus();
  });
  // A focused map item is never hidden behind the sheet (WCAG 2.4.11).
  useEffect(() => {
    const c = document.documentElement.classList;
    const name = full ? 'tg-sheet-full' : 'tg-sheet-open';
    c.add(name);
    return () => c.remove(name);
  }, [full]);

  const stepBy = (dir: 1 | -1) => {
    const next = nav[(at < 0 ? (dir > 0 ? -1 : nav.length) : at) + dir];
    if (!next) return;
    onStep(next.id);
    announce(stepSay(pattern ? 'Evidence' : 'Step', nav.indexOf(next) + 1, nav.length, next));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    // Map keys act only on the panel itself, its title and its navigation buttons: never in text or Show raw.
    if (!(t === e.currentTarget || t === title.current || t.hasAttribute('data-panel-nav'))) return;
    const [prev, next] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (e.key === ']' || e.key === '[') onPattern(e.key === ']' ? 1 : -1);
    else if (e.key === prev || e.key === next) stepBy(e.key === next ? 1 : -1);
    else return;
    e.preventDefault();
  };

  const t0 = target.trouble?.[0];
  const n = t0 ? L.numbers.get(t0.id) : undefined;
  const crumbs = [laneWord(g, target.lane), target.kind !== 'episode' ? target.episode?.title : undefined, pattern && n ? `pattern ${n} of ${L.order.length}` : target.kind === 'files' ? 'destination' : target.title]
    .filter(Boolean).map((c) => ((c as string).length > 32 ? `${(c as string).slice(0, 31)}…` : c));
  const steps = target.episode ? target.steps.length : 0;
  const first = g.steps.find((s) => s.id === target.steps[0]);
  const last = g.steps.find((s) => s.id === target.steps[target.steps.length - 1]);
  const ms = first?.t && last?.t ? Date.parse(last.t) - Date.parse(first.t) : Number.NaN;

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the panel's keys (DESIGN §10.3): Esc, ← →, [ ]
    <aside role="region" aria-labelledby={titleId} className={full ? 'detail-panel is-full' : 'detail-panel'} data-testid="detail-panel" data-target={target.item} onKeyDown={onKeyDown}>
      <div className="panel-top">
        <span className="grabber" aria-hidden="true" />
        <p className="mono breadcrumb">{crumbs.join(' › ')}</p>
        <button type="button" className="sheet-size" onClick={() => setFull(!full)}>{full ? 'Collapse' : 'Expand'}</button>
        <button type="button" className="panel-close" aria-label="Close details" onClick={onClose}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M1 1 L11 11 M11 1 L1 11" /></svg>
        </button>
      </div>
      <p className="kind-line">
        {pattern && t0 ? <BlazeIcon kind={t0.kind} resolved={t0.resolved} badge={String(n ?? '')} /> : target.episode ? <KindGlyph kind={target.episode.kind} /> : <KindGlyph kind="answer" />}
        <span>{pattern && target.trouble ? patternLine(target.trouble) : target.episode ? `Episode · ${KIND_WORD[target.episode.kind] ?? target.episode.kind}` : 'Destination · what changed'}</span>
      </p>
      <h2 id={titleId} ref={title} tabIndex={-1} className="panel-title">{target.title}</h2>
      {target.kind === 'files' ? (
        <ol className="files panel-files">
          {g.outcome.files.map((f) => (
            <li key={f.path}><span className="mono path" title={f.path}>{f.path}{f.created && <span className="muted"> new</span>}</span><span className="mono edits">{plural(f.edits, 'edit')}</span></li>
          ))}
        </ol>
      ) : (
        <>
          <p className="panel-summary">
            {pattern ? `In ${laneWord(g, target.lane)}${target.episode ? `, ${target.episode.title}` : ''}. ${plural(nav.length, 'evidence step')}.` : `${plural(steps, 'step')}${Number.isFinite(ms) && ms >= 60_000 ? ` over ${duration(ms)}` : ''} in ${laneWord(g, target.lane)}.`}
          </p>
          {row && ownWords(row) && (
            <p className="honesty agent-words" data-honesty="detail"><InfoGlyph /><span>{HONESTY_TEXT} <a href={HOW_TO_READ_URL}>How to read this map</a></span></p>
          )}
          {row && <StepBlock key={row.id} g={g} row={row} index={at} count={nav.length} label={pattern ? 'Evidence' : 'Selected step'} onOpenLane={onOpenLane} />}
          {row && aiNote}
          {row && <ProvenanceBlock key={`${row.id}:${openRaw}`} g={g} row={row} openRaw={openRaw} link={linkFor(row.id)} announce={announce} />}
          <div className="panel-nav">
            <button type="button" data-panel-nav="" aria-disabled={at <= 0} onClick={() => stepBy(-1)}>← Previous {pattern ? 'evidence' : 'step'}</button>
            <button type="button" data-panel-nav="" aria-disabled={at >= nav.length - 1} onClick={() => stepBy(1)}>Next {pattern ? 'evidence' : 'step'} →</button>
          </div>
          {pattern && target.trouble && (
            <p className="muted fine">Found by the rule “{target.trouble.map((t) => RULE_WORDS[t.kind]).join('”, “')}”. A rule, not AI.</p>
          )}
        </>
      )}
      <p className="muted fine key-hints">Keys: {vertical ? '↑ ↓' : '← →'} steps · [ ] patterns · Esc closes.</p>
    </aside>
  );
}

/** Provenance (§8.10), "Show raw" and "Copy link to step"; keyed by the row, so both reset when the step changes. */
function ProvenanceBlock({ g, row, openRaw, link, announce }: { g: SessionGraph; row: Row; openRaw: boolean; link: string; announce(text: string): void }) {
  const [raw, setRaw] = useState(openRaw);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const done = () => {
      setCopied(true);
      announce('Link to step copied');
    };
    void (navigator.clipboard?.writeText(link) ?? Promise.reject(new Error('no clipboard'))).then(done, () => announce(`Could not copy. The link is ${link}`));
  };
  return (
    <section className="provenance-block" aria-label="Provenance">
      <h3 className="section-label">Provenance</h3>
      <Provenance g={g} row={row} />
      <div className="panel-actions">
        <button type="button" aria-expanded={raw} onClick={() => setRaw(!raw)}>{raw ? 'Hide raw' : 'Show raw'}</button>
        <button type="button" onClick={copy}>{copied ? 'Link copied' : 'Copy link to step'}</button>
      </div>
      {raw && rawRecords(g, row).slice(0, 4).map((r) => <RawRecord key={`${r.file}:${r.line}`} {...r} />)}
      <p className="muted fine">Verbatim record; redacted in samples and shared copies. Dotted underline marks a redaction.</p>
    </section>
  );
}

function Provenance({ g, row }: { g: SessionGraph; row: Row }) {
  const s = row.step;
  const res = row.result && row.result.raw.line !== s.raw.line ? row.result.raw.line : undefined;
  const ids = [s.raw.uuid ? `record uuid ${shortId(s.raw.uuid)}` : '', s.tool?.callId ? `tool call ${shortId(s.tool.callId)}` : ''].filter(Boolean);
  const lane = g.lanes.find((l) => l.id === s.laneId);
  return (
    <>
      <p className="mono prov-file" title={s.raw.file}>
        {fileLabel(s.raw.file)}:{s.raw.line}{res ? ` · result at line ${res}` : ''}
        <span className="visually-hidden"> (file {s.raw.file}, line {s.raw.line}{lane ? `, in ${laneWord(g, lane)}` : ''})</span>
      </p>
      {ids.length > 0 && <p className="mono muted prov-ids">{ids.join(' · ')}</p>}
    </>
  );
}

function StepBlock({ g, row, index, count, label, onOpenLane }: { g: SessionGraph; row: Row; index: number; count: number; label: string; onOpenLane?: ((laneId: string) => void) | undefined }) {
  const [more, setMore] = useState(false);
  const s = row.step;
  const tool = s.kind === 'tool-call' ? s.tool : undefined;
  const words = rowWords(row);
  const out = row.result?.text ?? '';
  const ex = excerpt(out);
  const spawned = tool?.category === 'agent' ? g.lanes.find((l) => l.spawnedBy === s.id) : undefined;
  return (
    <section className="step-block" aria-label={label} data-step={row.id} data-tool={tool?.name}>
      <h3 className="section-label">{label} · {index + 1} of {count}</h3>
      <p className="step-status">
        <RowGlyph row={row} />
        <strong>{rowCategory(row)}</strong>{words ? ` · ${words}` : ''}
        <span className="mono muted">{since(g, s.t)}</span>
      </p>
      {isUnstoredThinking(s) ? (
        <p className="agent-words muted">{rowLabel(row)}. Only a signature was recorded for {row.times > 1 ? 'these blocks' : 'this block'}, so no text is shown.</p>
      ) : tool?.command ? (
        <>
          <Box label="Command" className="cmd">{`$ ${tool.command}`}</Box>
          {row.result && (
            <>
              <h4 className="section-label">Output · {more || !ex.more ? 'recorded' : 'excerpt'}</h4>
              <Box label="Output">{(more ? out : ex.head) || '(no output)'}</Box>
              {ex.more > 0 && <button type="button" className="link-button" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Show less' : `Show ${plural(ex.more, 'more line')}`}</button>}
              {row.result.tool?.persistedOutput && <p className="muted fine">The full output was saved to {row.result.tool.persistedOutput}.</p>}
            </>
          )}
        </>
      ) : tool?.edit ? (
        <>
          <p className="mono step-path">{tool.files[0] ?? tool.summary}</p>
          <Box label="Edit, removed lines marked minus, added lines marked plus" className="diff">
            {lineDiff(tool.edit.before, tool.edit.after).map((d, i) => (
              <span key={i} className={d.op === '-' ? 'd-del' : d.op === '+' ? 'd-add' : 'd-same'}>{`${d.op === '-' ? '−' : d.op === '+' ? '+' : ' '} ${d.text}`}</span>
            ))}
          </Box>
        </>
      ) : tool && (tool.category === 'read' || tool.category === 'search') ? (
        <dl className="step-facts">
          {tool.files[0] && (<><dt>Path</dt><dd className="mono">{tool.files[0]}</dd></>)}
          {tool.pattern && (<><dt>Pattern</dt><dd className="mono">{tool.pattern}</dd></>)}
          {!tool.files[0] && !tool.pattern && (<><dt>Call</dt><dd className="mono">{tool.summary}</dd></>)}
        </dl>
      ) : tool ? (
        <>
          <p className="mono step-path">{tool.summary}</p>
          {spawned && onOpenLane && <button type="button" onClick={() => onOpenLane(spawned.id)}>Open lane: {spawned.agentType ?? spawned.name}</button>}
          {row.result?.text && <Box label="Result">{ex.head}</Box>}
        </>
      ) : (
        <StepText row={row} more={more} onMore={() => setMore(!more)} />
      )}
    </section>
  );
}

/** A user or agent text, its first 12 visual lines and "Show full text" (DESIGN §10.1). In the browser CSS clamps it and
 * the button shows only when it overflows; without layout (tests, server render) it is cut by `textHead`. */
function StepText({ row, more, onMore }: { row: Row; more: boolean; onMore(): void }) {
  const text = row.step.text ?? '';
  const ref = useRef<HTMLParagraphElement>(null);
  const [laidOut, setLaidOut] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || more || !text) return;
    if (!laidOut) {
      if (el.clientHeight > 0) setLaidOut(true);
      return;
    }
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, more, laidOut]);
  const fallback = textHead(text);
  const cut = text !== '' && (laidOut ? overflows : fallback.cut);
  const shown = more || laidOut || !fallback.cut ? text : fallback.head;
  const cls = `${ownWords(row) ? 'agent-words step-text' : 'step-text'}${laidOut && !more ? ' is-clamped' : ''}`;
  return (
    <>
      <p ref={ref} className={cls}>{shown}</p>
      {cut && <button type="button" className="link-button" aria-expanded={more} onClick={onMore}>{more ? 'Show less' : 'Show full text'}</button>}
    </>
  );
}

/** A mono box for commands, output and diffs: a <pre> rendered as text; it may scroll, so it is a tab stop. */
function Box({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be keyboard-reachable
    <pre className={className ? `box mono ${className}` : 'box mono'} tabIndex={0} aria-label={label}>{children}</pre>
  );
}
