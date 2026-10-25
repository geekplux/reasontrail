// The detail panel (docs/design/v7/PROMPT.md §4.5; docs/design/v7/preview/Step.html `.detail`): in place of the outcome
// column while a step is selected. Where the step is, with a close button; its kind (⚠ when it failed) and time; the
// summary; the command in a `pre`; its output; the next step; the source file and line, with "Show raw" for the verbatim
// record when the graph kept it; Previous / Next step. Esc closes it. Everything from the transcript is rendered as text.
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertIcon, OkIcon } from '../map/gitlist/marks';
import type { StepDetail as Detail, StepTone } from './stepDetail';

const Tone = ({ tone }: { tone: StepTone }) => (tone === 'fail' ? <AlertIcon size={14} /> : tone === 'ok' ? <OkIcon size={14} /> : <span />);

export interface StepDetailProps {
  d: Detail;
  /** Move focus to the title when the panel opens or shows another step from a click in the tree, scrolling only when
   * the title is out of view so focus never lands off-screen: `nearest` brings the title just into view (desktop, the
   * tree stays in view), `start` brings the panel's top to the top (the phone, so the panel's content shows). */
  focusOnOpen?: false | 'nearest' | 'start';
  /** The title's heading level, one under the session title's (2 in the viewer, 3 on the website); its labels one more. */
  level?: 2 | 3;
  onStep(stepId: string): void;
  onClose(): void;
}

export function StepDetail({ d, focusOnOpen = false, level = 3, onStep, onClose }: StepDetailProps) {
  const [H, L] = level === 2 ? (['h2', 'h3'] as const) : (['h3', 'h4'] as const);
  const title = useRef<HTMLHeadingElement>(null);
  const rawId = useId();
  // The raw record is shown for one step at a time; another step starts with it hidden.
  const [rawFor, setRawFor] = useState<string>();
  const showRaw = d.raw !== undefined && rawFor === d.stepId;
  useLayoutEffect(() => {
    const el = title.current;
    if (!focusOnOpen || !el) return;
    // `start` brings the whole panel to the top (its context line and close button too, with the panel's scroll margin).
    const box = (focusOnOpen === 'start' && el.closest<HTMLElement>('.detail')) || el;
    const hidden = box.getBoundingClientRect().top < 0 || el.getBoundingClientRect().bottom > window.innerHeight;
    el.focus({ preventScroll: true });
    if (hidden) box.scrollIntoView?.({ block: focusOnOpen });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- another step picked in the tree moves focus again
  }, [focusOnOpen, d.stepId]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    onClose();
  };
  const go = (id: string | undefined) => id && onStep(id);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Esc closes the panel from anywhere inside it
    <aside className="side detail" aria-label="Step details" data-step={d.stepId} onKeyDown={onKeyDown}>
      <div className="d-head">
        <p className="muted">{d.where}</p>
        <button type="button" className="iconbtn" aria-label="Close step details" onClick={onClose}>
          <svg className="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="d-title">
        {d.tone === 'fail' && <AlertIcon size={14} />}
        <H ref={title} className="d-h" tabIndex={-1}>{d.title}</H>
        <span className="at">{d.at}</span>
      </div>
      <p>{d.summary}</p>
      {d.code && <pre className="cmd">{d.code.startsWith('$ ') ? <><span className="muted">$</span>{d.code.slice(1)}</> : d.code}</pre>}
      {d.text && <p className="muted">{d.text}</p>}
      {d.output && (
        <>
          <L className="d-label">Output <span className="muted">{d.output.note}</span></L>
          {d.output.text && <pre className="out">{d.output.text}</pre>}
        </>
      )}
      {d.next && (
        <>
          <L className="d-label">Next step <span className="muted">{d.next.at}</span></L>
          <div className="d-next">
            <Tone tone={d.next.tone} />
            <div>
              <p>{d.next.summary}</p>
              {d.next.output && <pre className="out">{d.next.output}</pre>}
            </div>
          </div>
        </>
      )}
      <p className="d-src muted">Source <span className="code">{d.source.file}</span> line {d.source.line}</p>
      {d.raw !== undefined && (
        <>
          <button type="button" className="link d-raw" aria-expanded={showRaw} aria-controls={showRaw ? rawId : undefined} onClick={() => setRawFor(showRaw ? undefined : d.stepId)}>{showRaw ? 'Hide raw' : 'Show raw'}</button>
          {showRaw && <pre id={rawId} className="raw" aria-label="Raw record">{d.raw}</pre>}
        </>
      )}
      <div className="d-nav">
        <button type="button" className="btn ghost" aria-disabled={!d.prevId} onClick={() => go(d.prevId)}>Previous step</button>
        <button type="button" className="btn ghost" aria-disabled={!d.nextId} onClick={() => go(d.nextId)}>Next step</button>
      </div>
    </aside>
  );
}
