// The destination (DESIGN §8.8, DM15, §18.2): files changed with exact edit counts and linear bars, the last verification
// and an excerpt of the final answer in the agent's own words. On the map: no frame, the top 3 files and a 2-line answer;
// its record and Show raw are in the detail panel. The outline (`full`) keeps every file and the answer's location.
import type { SessionGraph } from '../../shared/session/types';
import { KindGlyph, StatusGlyph } from './Glyph';
import { duration, fileLabel } from './outline';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where the verification ran and when, relative to the session start: "in verifier · at 26 min". */
function ranWhere(g: SessionGraph, stepId: string): string {
  const step = g.steps.find((s) => s.id === stepId);
  const lane = g.lanes.find((l) => l.id === step?.laneId);
  const at = step?.t && g.source.startedAt ? Date.parse(step.t) - Date.parse(g.source.startedAt) : Number.NaN;
  const who = lane && lane.id !== g.lanes[0]?.id ? lane.agentType ?? lane.name : 'main';
  return `in ${who}${Number.isFinite(at) ? ` · at ${duration(at)}` : ''}`;
}

export function OutcomeCard({ g, full = false }: { g: SessionGraph; full?: boolean }) {
  const { files, revertedFiles, lastVerification: v, answerStepId } = g.outcome;
  const top = full ? files : files.slice(0, 3);
  const max = Math.max(1, ...top.map((f) => f.edits));
  const answer = g.steps.find((s) => s.id === answerStepId);
  const chat = g.source.kind === 'chat';
  const finalAnswer = answer?.text ? (
    <>
      <p className={full ? 'agent-words excerpt' : 'agent-words excerpt is-clamped'}>{answer.text}</p>
      <p className="muted provenance">The {chat ? 'model' : 'agent'}&apos;s own words{full && <span className="mono"> · <span title={answer.raw.file}>{fileLabel(answer.raw.file)}</span>:{answer.raw.line}</span>}</p>
    </>
  ) : (
    <p className="muted">No final answer was recorded.</p>
  );
  if (chat) {
    // A chat changes no files and runs no checks: the destination is the final answer alone, full width.
    return (
      <section className="region outcome is-chat" id="destination" data-region="outcome" aria-labelledby="h-outcome">
        <h2 id="h-outcome" className="section-label">
          <KindGlyph kind="answer" /> Destination <span>· final answer</span>
        </h2>
        {finalAnswer}
      </section>
    );
  }
  return (
    <section className="region outcome" id="destination" data-region="outcome" aria-labelledby="h-outcome">
      <h2 id="h-outcome" className="section-label">
        <KindGlyph kind="answer" /> Destination <span>· what changed</span>
      </h2>
      <div className="outcome-cols">
        <div>
          <p className="strong outcome-count">{plural(files.length, 'file')} changed</p>
          {top.length > 0 && (
            <>
              <ol className="files">
                {top.map((f) => (
                  <li key={f.path}>
                    <span className="mono path" title={f.path}>{f.path.split('/').map((part, i, all) => (i < all.length - 1 ? <span key={i}>{part}/<wbr /></span> : <span key={i} className="file-name">{part}{f.created && <span className="muted new"> new</span>}</span>))}</span>
                    <span className="mono edits">{f.edits}<span className="visually-hidden"> {f.edits === 1 ? 'edit' : 'edits'}</span></span>
                    <span className="bar" style={{ width: `${Math.max(4, (48 * f.edits) / max)}px` }} aria-hidden="true" />
                  </li>
                ))}
              </ol>
            </>
          )}
          {files.length > top.length && (
            <p className="muted more-files">
              {/* Text, not a link: the glance's files row already opens every file (one control fewer, CL2). */}
              +{plural(files.length - top.length, 'more file', 'more files')}
            </p>
          )}
          {revertedFiles ? <p className="muted">({plural(revertedFiles, 'reverted file')} not counted)</p> : null}
        </div>
        <div>
          <h3 className="sub-label">Last verification</h3>
          {v ? (
            <p className="verification" data-status={v.ok ? 'ok' : 'error'}>
              <StatusGlyph status={v.ok ? 'ok' : 'error'} />
              <span><code className="mono">{v.command}</code><br /><span className="muted">{v.ok ? 'passed' : 'failed'} · {ranWhere(g, v.stepId)}</span></span>
            </p>
          ) : (
            <p className="verification" data-status="unknown"><StatusGlyph status="unknown" /> <span>No test, build, lint or typecheck run found.</span></p>
          )}
          <h3 className="sub-label">Final answer</h3>
          {finalAnswer}
        </div>
      </div>
    </section>
  );
}
