// The session card under the hero tree (v7 §4.5, §12, §13.2): the title with nothing above it, the meta line on one
// baseline, AI titles / Details / Share on the right; then the git-style list (680) and the outcome column (360), which
// becomes the detail panel while a step is selected.
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import type { AiSource } from '../ai/AiControl';
import { LiveRegion, useAnnouncer } from '../components/LiveRegion';
import { GitList, type GitListProps } from '../map/gitlist/GitList';
import { AlertIcon, OkIcon, UnknownIcon } from '../map/gitlist/marks';
import { taskCard } from '../map/outline';
import { ShareAction } from '../share/ShareAction';
import { finalAnswer, outcomeRows, runs, sessionMeta, type OutcomeRow, type Run } from './sessionSummary';
import { StepDetail } from './StepDetail';
import { findStep, stepDetail } from './stepDetail';

// The AI labels control, its consent dialog and client load only when first used.
const AiControl = lazy(() => import('../ai/AiControl'));
const LIVE: AiSource = { live: true };

const Runs = ({ value }: { value: Run[] }) => value.map((r, i) => (r.code ? <code key={i} className="code">{r.text}</code> : <span key={i}>{r.text}</span>));

/** ✓ blue, ⚠ orange, a file outline, or a dashed ring: the shape carries the meaning, the hue repeats it. */
function OutcomeIcon({ icon }: { icon: OutcomeRow['icon'] }) {
  if (icon === 'ok') return <OkIcon />;
  if (icon === 'alert') return <AlertIcon />;
  if (icon === 'files') return <svg className="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.75h6l3 3v9.5h-9z" fill="none" stroke="var(--slate-12)" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 8.5h4M6 11h4" stroke="var(--slate-12)" strokeWidth="1.4" strokeLinecap="round" /></svg>;
  return <UnknownIcon />;
}

function Outcome({ g }: { g: SessionGraph }) {
  const answer = finalAnswer(g);
  const [full, setFull] = useState(false);
  const answerId = useId();
  return (
    <aside className="side" aria-label="Outcome">
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
      <section className="block" aria-labelledby={`${answerId}-h`}>
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
    </aside>
  );
}

/** `sample`: a built-in sample, so the meta line ends with the "Sample" tag (never on a user's own session). `branch`:
 * the sample's branch where the recorded one is the main checkout. `selection` / `onSelect` / `onActive` / `hover`:
 * the list's open episode and selected step, its focused or hovered row, and the episode hovered in the tree. A
 * selected step opens the detail panel; `focusDetail` moves focus into it as it opens. */
export function SessionCard({ g, sample = false, branch, id, selection, onSelect, onActive, hover, focusDetail = false }: { g: SessionGraph; sample?: boolean; branch?: string | undefined; id?: string; focusDetail?: boolean } & Pick<GitListProps, 'selection' | 'onSelect' | 'onActive' | 'hover'>) {
  const [message, announce] = useAnnouncer();
  const [aiLoaded, setAiLoaded] = useState(false);
  const [details, setDetails] = useState(false);
  const [overlay, setOverlay] = useState<LabelOverlay>();
  const detailsId = useId();
  const card = taskCard(g);
  const detail = selection?.stepId ? stepDetail(g, selection.stepId) : undefined;
  // Closing the panel puts focus back on the step's row in the list (its episode's row if the step is folded away).
  const frame = useRef<HTMLElement>(null);
  const refocus = useRef<{ stepId: string; episodeId: string }>(undefined);
  useEffect(() => {
    const to = refocus.current;
    if (!to) return;
    refocus.current = undefined;
    const row = (key: string) => frame.current?.querySelector<HTMLElement>(`[data-row="${key}"]`);
    (row(`step:${to.stepId}`) ?? row(`ep:${to.episodeId}`))?.focus();
  });
  const close = () => {
    if (!detail) return;
    refocus.current = { stepId: detail.stepId, episodeId: detail.episodeId };
    onSelect?.({ episodeId: detail.episodeId });
  };
  const toStep = (stepId: string) => {
    const s = findStep(g, stepId);
    if (s) onSelect?.({ episodeId: s.episode.episodeId, stepId });
  };  return (
    <section className="frame" id={id} ref={frame} role="tabpanel" aria-labelledby="sess-title">
      <header className="sess">
        <div className="sess-l">
          <h2 id="sess-title">{g.displayTitle ?? g.title}</h2>
          <ul className="meta">
            {sessionMeta(g, branch).map((m) => ('strong' in m ? <li key={m.key}><b>{m.strong}</b> {m.rest}</li> : <li key={m.key} className={m.code ? 'code' : undefined}>{m.text}</li>))}
            {sample && <li className="tag">Sample</li>}
          </ul>
        </div>
        <div className="sess-r">
          {aiLoaded ? (
            <Suspense fallback={null}><AiControl g={g} source={LIVE} onOverlay={setOverlay} announce={announce} label="AI titles" buttonClass="btn ghost" /></Suspense>
          ) : (
            <button type="button" className="btn ghost" aria-haspopup="dialog" onClick={() => setAiLoaded(true)}>AI titles</button>
          )}
          <button type="button" className="btn ghost" aria-expanded={details} aria-controls={detailsId} onClick={() => setDetails(!details)}>Details</button>
          <ShareAction graph={g} from="site" label="Share" className="btn ghost" />
        </div>
      </header>
      <div id={detailsId} className="details" hidden={!details}>
        {card.details.length > 0 && <p className="meta">{card.details.map((d) => <span key={d}>{d}</span>)}</p>}
        <p className="muted request">{card.request.replace(/\*\*|`/g, '')}</p>
      </div>
      <div className="cols">
        <GitList g={g} overlay={overlay} hover={hover} {...(selection ? { selection } : {})} {...(onSelect ? { onSelect } : {})} {...(onActive ? { onActive } : {})} />
        {detail ? <StepDetail d={detail} focusOnOpen={focusDetail} onStep={toStep} onClose={close} /> : <Outcome g={g} />}
      </div>
      <LiveRegion message={message} />
    </section>
  );
}
