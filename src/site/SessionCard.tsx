// The session card under the hero tree (v7 §4.5, §12, §13.2): the title with nothing above it, the meta line on one
// baseline, AI titles / Details / Share on the right; then the git-style list (680) and the outcome column (360).
import { lazy, Suspense, useId, useState, type ReactNode } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import type { AiSource } from '../ai/AiControl';
import { LiveRegion, useAnnouncer } from '../components/LiveRegion';
import { taskCard } from '../map/outline';
import { ShareAction } from '../share/ShareAction';
import { finalAnswer, outcomeRows, runs, sessionMeta, type OutcomeRow, type Run } from './sessionSummary';
import { LIST_SVG } from './static/reference';

// The AI labels control, its consent dialog and client load only when first used.
const AiControl = lazy(() => import('../ai/AiControl'));
const LIVE: AiSource = { live: true };

const Runs = ({ value }: { value: Run[] }) => value.map((r, i) => (r.code ? <code key={i} className="code">{r.text}</code> : <span key={i}>{r.text}</span>));

/** ✓ blue, ⚠ orange, a file outline, or a dashed ring: the shape carries the meaning, the hue repeats it. */
function OutcomeIcon({ icon }: { icon: OutcomeRow['icon'] }) {
  const svg = (children: ReactNode) => <svg className="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{children}</svg>;
  if (icon === 'ok') return svg(<><circle cx="8" cy="8" r="7" fill="var(--blue-9)" /><path d="m4.75 8.25 2.1 2.1 4.4-4.6" fill="none" stroke="var(--slate-1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>);
  if (icon === 'alert') return svg(<><path d="M8 1.5 15 14H1z" fill="var(--orange-9)" stroke="var(--orange-9)" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 6v3.5" stroke="var(--orange-1)" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11.6" r="0.95" fill="var(--orange-1)" /></>);
  if (icon === 'files') return svg(<><path d="M3.5 1.75h6l3 3v9.5h-9z" fill="none" stroke="var(--slate-12)" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 8.5h4M6 11h4" stroke="var(--slate-12)" strokeWidth="1.4" strokeLinecap="round" /></>);
  return svg(<circle cx="8" cy="8" r="6.25" fill="none" stroke="var(--slate-9)" strokeWidth="1.4" strokeDasharray="2 2.2" />);
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
 * the sample's branch where the recorded one is the main checkout. `drawn`: false while this sample's list is not
 * drawn yet (TEMPORARY, until the list of phase 30). */
export function SessionCard({ g, sample = false, branch, drawn = true, id }: { g: SessionGraph; sample?: boolean; branch?: string | undefined; drawn?: boolean; id?: string }) {
  const [message, announce] = useAnnouncer();
  const [aiLoaded, setAiLoaded] = useState(false);
  const [details, setDetails] = useState(false);
  const detailsId = useId();
  const card = taskCard(g);
  return (
    <section className="frame" id={id} aria-labelledby="sess-title">
      <header className="sess">
        <div className="sess-l">
          <h2 id="sess-title">{g.displayTitle ?? g.title}</h2>
          <p className="meta">
            {sessionMeta(g, branch).map((m) => ('strong' in m ? <span key={m.key}><b>{m.strong}</b> {m.rest}</span> : <span key={m.key} className={m.code ? 'code' : undefined}>{m.text}</span>))}
            {sample && <span className="tag">Sample</span>}
          </p>
        </div>
        <div className="sess-r">
          {aiLoaded ? (
            <Suspense fallback={null}><AiControl g={g} source={LIVE} onOverlay={() => {}} announce={announce} /></Suspense>
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
        {/* TEMPORARY: the canvas's static list for the default sample; the git-style list replaces it in phase 30. */}
        {drawn ? <div className="list" dangerouslySetInnerHTML={{ __html: LIST_SVG }} /> : <p className="list muted">This sample&apos;s list is not drawn yet.</p>}
        <Outcome g={g} />
      </div>
      <LiveRegion message={message} />
    </section>
  );
}
