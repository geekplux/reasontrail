// The session card under the hero tree (v7 §4.5, §12, §13.2): the title with nothing above it, the meta line on one
// baseline, AI titles / Details / Share on the right; then the git-style list (680) and the outcome column (360), which
// becomes the detail panel while a step is selected. On the phone: the header keeps only the title and the meta line
// (no branch), the outcome box (or the panel) comes above the compact list, the final answer under it, then the three
// actions in a row (Details names the branch).
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import type { AiSource } from '../ai/AiControl';
import { LiveRegion, useAnnouncer } from '../components/LiveRegion';
import { GitList, type GitListProps, type ListSelection } from '../map/gitlist/GitList';
import { AlertIcon, OkIcon, UnknownIcon } from '../map/gitlist/marks';
import { taskCard } from '../map/outline';
import { ShareAction } from '../share/ShareAction';
import { finalAnswer, outcomeRows, runs, sessionMeta, type OutcomeRow, type Run } from './sessionSummary';
import { StepDetail } from './StepDetail';
import { findStep, stepDetail } from './stepDetail';
import { usePhone } from './usePhone';

// The AI labels control, its consent dialog and client load only when first used.
const AiControl = lazy(() => import('../ai/AiControl'));
const LIVE: AiSource = { live: true };

const Runs = ({ value }: { value: Run[] }) => value.map((r, i) => (r.code ? <code key={i} className="code">{r.text}</code> : <span key={i}>{r.text}</span>));

/** ✓ blue, ⚠ orange, a file outline, or a dashed ring: the shape carries the meaning, the hue repeats it. */
function OutcomeIcon({ icon }: { icon: OutcomeRow['icon'] }) {
  if (icon === 'ok') return <OkIcon />;
  if (icon === 'alert') return <AlertIcon />;
  if (icon === 'files') return <svg className="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.75h6l3 3v9.5h-9z" fill="none" stroke="var(--slate-12)" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 8.5h4M6 11h4" fill="none" stroke="var(--slate-12)" strokeWidth="1.4" strokeLinecap="round" /></svg>;
  return <UnknownIcon />;
}

/** The outcome box (§4.5): one bordered box with hairline rows (the final check, the trouble, the files changed). */
const OutcomeBox = ({ g }: { g: SessionGraph }) => (
  <ul className="res">
    {outcomeRows(g).map((r) => (
      <li key={r.key} className="res-row" data-row={r.key}>
        <OutcomeIcon icon={r.icon} />
        <div>
          <p className="strong">{r.lead}</p>
          {r.detail.length > 0 && <p className="muted"><Runs value={r.detail} /></p>}
        </div>
      </li>
    ))}
  </ul>
);

/** "Final answer": up to four lines, then "Read the full answer". */
function FinalAnswer({ g }: { g: SessionGraph }) {
  const answer = finalAnswer(g);
  const [full, setFull] = useState(false);
  const answerId = useId();
  return (
    <section className="block final" aria-labelledby={`${answerId}-h`}>
      <h3 id={`${answerId}-h`}>Final answer</h3>
      {answer ? (
        <>
          <p id={answerId} className={full ? 'answer is-full' : 'answer'}><Runs value={runs(full ? answer.full : answer.excerpt)} /></p>
          {answer.full !== answer.excerpt || full ? (
            <button type="button" className="link" aria-expanded={full} aria-controls={answerId} onClick={() => setFull(!full)}>
              {full ? 'Show less' : 'Read the full answer'}
            </button>
          ) : null}
        </>
      ) : (
        <p className="muted">No final answer was recorded.</p>
      )}
    </section>
  );
}

/** `sample`: a built-in sample, so the meta line ends with the "Sample" tag (never on a user's own session). `branch`:
 * the sample's branch where the recorded one is the main checkout. `selection` / `onSelect` / `onActive` / `hover`:
 * the list's open episode and selected step, its focused or hovered row, and the episode hovered in the tree. A
 * selected step opens the detail panel; `focusDetail` moves focus into it as it opens (`StepDetail`'s `focusOnOpen`). */
export function SessionCard({ g, sample = false, branch, id, selection, onSelect, onActive, hover, focusDetail = false }: { g: SessionGraph; sample?: boolean; branch?: string | undefined; id?: string; focusDetail?: false | 'nearest' | 'start' } & Pick<GitListProps, 'selection' | 'onSelect' | 'onActive' | 'hover'>) {
  const [message, announce] = useAnnouncer();
  const phone = usePhone();
  const [aiLoaded, setAiLoaded] = useState(false);
  const [details, setDetails] = useState(false);
  const [overlay, setOverlay] = useState<LabelOverlay>();
  const detailsId = useId();
  const card = taskCard(g);
  const detail = selection?.stepId ? stepDetail(g, selection.stepId) : undefined;
  // Closing the panel puts focus back on the step's row in the list (its episode's row if the step is folded away).
  // A close from outside (Back) does the same, without scrolling, when focus went away with the panel.
  const frame = useRef<HTMLElement>(null);
  const refocus = useRef<{ stepId: string; episodeId: string }>(undefined);
  const shown = useRef<{ stepId: string; episodeId: string }>(undefined);
  useEffect(() => {
    const was = shown.current;
    shown.current = detail && { stepId: detail.stepId, episodeId: detail.episodeId };
    const lost = !document.activeElement || document.activeElement === document.body;
    const to = refocus.current ?? (was && !detail && lost ? was : undefined);
    if (!to) return;
    const scroll = refocus.current !== undefined;
    refocus.current = undefined;
    const row = (key: string) => frame.current?.querySelector<HTMLElement>(`[data-row="${key}"]`);
    (row(`step:${to.stepId}`) ?? row(`ep:${to.episodeId}`))?.focus(scroll ? undefined : { preventScroll: true });
  });
  const close = () => {
    if (!detail) return;
    refocus.current = { stepId: detail.stepId, episodeId: detail.episodeId };
    onSelect?.({ episodeId: detail.episodeId });
  };
  const say = (stepId: string) => {
    const d = stepDetail(g, stepId);
    if (d) announce(`${d.title}: ${d.summary}, ${d.where}`);
  };
  const toStep = (stepId: string) => {
    const s = findStep(g, stepId);
    if (!s) return;
    say(stepId);
    setListPick(undefined);
    onSelect?.({ episodeId: s.episode.episodeId, stepId });
  };
  // A step picked in the list while none is open is announced (the panel itself is not a live region). On the phone the
  // panel opens above the list, so a step picked there moves focus to the panel's title (scrolled to the top when out
  // of view), as a tap in the tree does; Previous / Next in the panel leave focus on their button.
  const [listPick, setListPick] = useState<string>();
  const fromList = (next: ListSelection) => {
    if (next.stepId && !detail) say(next.stepId);
    setListPick(phone ? next.stepId : undefined);
    onSelect?.(next);
  };
  // Crossing the breakpoint forgets that pick, so the panel does not take focus again on the way back.
  const [layout, setLayout] = useState(phone);
  if (layout !== phone) {
    setLayout(phone);
    setListPick(undefined);
  }
  // The actions row is one node for the card's life (its buttons are portalled into it), moved between the header
  // (desktop) and the place after `.cols` (phone), so AI titles and Share keep their state across the breakpoint and
  // focus stays on the same button. It moves before focus is put back (the next effect).
  const [actionsRow] = useState(() => Object.assign(document.createElement('div'), { className: 'sess-r' }));
  const head = useRef<HTMLElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (phone) {
      if (cols.current && cols.current.nextSibling !== actionsRow) cols.current.after(actionsRow);
    } else if (head.current && actionsRow.parentNode !== head.current) head.current.append(actionsRow);
  });
  // Crossing the breakpoint moves the list, the outcome column and the actions row, and moving a node drops its focus:
  // the element focused inside the card gets it back without scrolling (then just into view if it is off-screen).
  const focusedIn = useRef<HTMLElement>(undefined);
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const into = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement) focusedIn.current = e.target;
    };
    // Chrome blurs a moved node after it is back in the document, so the check waits until focus has been put back:
    // focus that went elsewhere forgets the element; a node moved or removed keeps it.
    const out = (e: FocusEvent) => {
      const t = e.target;
      setTimeout(() => {
        if (t instanceof Node && t === focusedIn.current && t.isConnected && !f.contains(document.activeElement)) focusedIn.current = undefined;
      });
    };
    f.addEventListener('focusin', into);
    f.addEventListener('focusout', out);
    return () => {
      f.removeEventListener('focusin', into);
      f.removeEventListener('focusout', out);
    };
  }, []);
  const laidOut = useRef(phone);
  useLayoutEffect(() => {
    if (laidOut.current === phone) return;
    laidOut.current = phone;
    const el = focusedIn.current;
    const now = document.activeElement;
    if (!el?.isConnected || (now && now !== document.body && now !== el)) return;
    if (el !== now) el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView?.({ block: 'nearest' });
  });
  // On the phone (Phone.html) the outcome box, or the step's panel in its place, comes above the list and the final
  // answer below it; the list drops its header, # and Start columns. The list, the panel and the final answer are keyed
  // children of one `.cols` grid on both layouts, so crossing the breakpoint moves them (DOM order stays reading order)
  // without remounting: their state survives and focus is put back (below).
  const list = <GitList key="list" g={g} overlay={overlay} hover={hover} compact={phone} {...(selection ? { selection } : {})} {...(onSelect ? { onSelect: fromList } : {})} {...(onActive ? { onActive } : {})} />;
  const panel = detail && <StepDetail key="panel" d={detail} focusOnOpen={focusDetail || (phone && listPick === detail.stepId && 'start')} onStep={toStep} onClose={close} />;
  const aside = panel ?? <aside key="side" className="side" aria-label="Outcome"><OutcomeBox g={g} /></aside>;
  // On the desktop the panel takes the whole outcome column, final answer included.
  const answer = (phone || !panel) && <FinalAnswer key="answer" g={g} />;
  const colsBox = <div key="cols" className="cols" ref={cols}>{phone ? [aside, list, answer] : [list, aside, answer]}</div>;
  const branchItem = sessionMeta(g, branch).find((m) => m.key === 'branch');
  const actions = (
    <>
      {aiLoaded ? (
        <Suspense fallback={null}><AiControl g={g} source={LIVE} onOverlay={setOverlay} announce={announce} label="AI titles" buttonClass="btn ghost" /></Suspense>
      ) : (
        <button type="button" className="btn ghost" aria-haspopup="dialog" onClick={() => setAiLoaded(true)}>AI titles</button>
      )}
      <button type="button" className="btn ghost" aria-expanded={details} aria-controls={detailsId} onClick={() => setDetails(!details)}>Details</button>
      <ShareAction graph={g} from="site" label="Share" className="btn ghost" />
    </>
  );
  // The phone's Details also names the branch, which its meta line leaves out.
  const detailsBox = (
    <div key="details" id={detailsId} className="details" hidden={!details}>
      {phone && branchItem && 'text' in branchItem && <p className="meta branch"><span className="code">{branchItem.text}</span></p>}
      {card.details.length > 0 && <p className="meta">{card.details.map((d) => <span key={d}>{d}</span>)}</p>}
      <p className="muted request">{card.request.replace(/\*\*|`/g, '')}</p>
    </div>
  );
  return (
    <section className="frame" id={id} ref={frame} role="tabpanel" aria-labelledby="sess-title">
      <header className="sess" ref={head}>
        <div className="sess-l">
          <h2 id="sess-title">{g.displayTitle ?? g.title}</h2>
          <ul className="meta">
            {sessionMeta(g, branch).filter((m) => !phone || m.key !== 'branch').map((m) => ('strong' in m ? <li key={m.key}><b>{m.strong}</b> {m.rest}</li> : <li key={m.key} className={m.code ? 'code' : undefined}>{m.text}</li>))}
            {sample && <li className="tag">Sample</li>}
          </ul>
        </div>
      </header>
      {/* The phone keeps every action (WCAG 1.4.10): AI titles, Details and Share in a row under the final answer (the
          actions row goes in after `.cols`, above), Details opening under it. */}
      {phone ? [colsBox, detailsBox] : [detailsBox, colsBox]}
      {createPortal(actions, actionsRow)}
      <LiveRegion message={message} />
    </section>
  );
}
