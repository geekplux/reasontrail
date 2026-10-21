// The outline view (DESIGN §10.2, DM16): the map's four regions as plain document structure. No ARIA widget roles,
// no custom keys: headings, ordered lists and one disclosure button per episode.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Episode, SessionGraph } from '../../shared/session/types';
import { InfoGlyph, KindGlyph, NeutralPlateGlyph, PlateGlyph, StatusGlyph, UnstoredGlyph } from './Glyph';
import { HonestyLabel } from './HonestyLabel';
import { REQUEST_MAX, STATUS_WORD, TROUBLE_LABEL, episodeLinks, glance, laneEpisodes, parseNotes, skippedWhere, stepLines, taskCard } from './outline';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The first request in serif: at most 280 chars and 2 lines until "more" (M1a, DM5). */
function Request({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || more) return;
    let live = true;
    // Half a line of tolerance: serif ascenders and sub-pixel line boxes must not count as a third line.
    const check = () => {
      if (live) setClamped(el.scrollHeight - el.clientHeight > parseFloat(getComputedStyle(el).lineHeight) / 2);
    };
    check();
    void document.fonts?.ready.then(check);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    observer?.observe(el);
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [more]);
  const long = text.length > REQUEST_MAX;
  return (
    <div className="task-request">
      <p ref={ref} className={more ? 'task-title' : 'task-title is-clamped'}>
        {long && !more ? `${text.slice(0, REQUEST_MAX - 1)}…` : text}
      </p>
      {(long || clamped || more) && (
        <button type="button" className="link-button" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

function EpisodeList({ g, laneId }: { g: SessionGraph; laneId: string }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics under list-style: none
    <ol className="episodes" role="list">
      {laneEpisodes(g, laneId).map((e) => <EpisodeItem key={e.id} g={g} e={e} />)}
    </ol>
  );
}

function EpisodeItem({ g, e }: { g: SessionGraph; e: Episode }) {
  const [open, setOpen] = useState(false);
  const stepsId = useId();
  const titleId = useId();
  const { trouble, lanes } = episodeLinks(g, e);
  return (
    <li className="episode" data-episode-id={e.id} data-episode-kind={e.kind} data-lane={e.laneId}>
      <p className="episode-head">
        <KindGlyph kind={e.kind} />
        <span>
          <span id={titleId} className="episode-title">{e.title}</span> <span className="mono muted">{e.kind} · {plural(e.stepIds.length, 'step')}</span>
        </span>
      </p>
      {trouble.length > 0 && (
        <ul className="chips">
          {trouble.map(({ t, n }) => (
            <li key={t.id} className="chip" data-trouble-kind={t.kind} data-count={t.count} data-resolved={t.resolved} data-n={n}>
              <PlateGlyph kind={t.kind} resolved={t.resolved} />
              <span className="chip-n mono">{n}</span>
              <span className="chip-text">
                <strong>{TROUBLE_LABEL[t.kind]}:</strong> {t.summary.replace(new RegExp(`^${TROUBLE_LABEL[t.kind]}:\\s*`), '')}
                <span className="mono muted"> · detected pattern{t.resolved ? ' · resolved' : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {lanes.length > 0 && (
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics under list-style: none
        <ol className="lanes" role="list">
          {lanes.map((l) => {
            const status = l.status ?? 'unknown';
            const calls = g.steps.filter((s) => s.laneId === l.id && s.kind === 'tool-call').length;
            return (
              <li key={l.id} className="lane" data-lane={l.id} data-lane-status={status}>
                <p className="lane-head">
                  <span className="mono">{l.agentType ?? 'subagent'}</span> {l.name}
                  <span className="mono muted"> · {plural(calls, 'call')} · </span>
                  <StatusGlyph status={status} /> <span className="mono">{status === 'unknown' ? 'no result recorded' : STATUS_WORD[status]}</span>
                </p>
                <EpisodeList g={g} laneId={l.id} />
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" className="disclosure" aria-expanded={open} aria-controls={stepsId} aria-describedby={titleId} onClick={() => setOpen(!open)}>
        Steps ({e.stepIds.length})
      </button>
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics under list-style: none */}
      <ol id={stepsId} className="steps" role="list" hidden={!open}>
        {open &&
          stepLines(g, e).map((s) => (
            <li key={s.id} data-step-id={s.id} data-kind={s.kind} data-status={s.status}>
              {s.text === 'thinking (text not stored)' ? <UnstoredGlyph /> : null}
              <span className="mono muted">{s.kind}</span> <span className={s.kind === 'assistant' || s.kind === 'thinking' ? 'agent-words' : undefined}>{s.text}</span>
              {s.times > 1 && <span className="mono"> ×{s.times}</span>}
              {s.status && (<> <StatusGlyph status={s.status} /> <span className="mono">{STATUS_WORD[s.status]}</span></>)}
            </li>
          ))}
      </ol>
    </li>
  );
}

function Destination({ g }: { g: SessionGraph }) {
  const { files, revertedFiles, lastVerification: v, answerStepId } = g.outcome;
  const top = [...files].sort((a, b) => b.edits - a.edits).slice(0, 5);
  const answer = g.steps.find((s) => s.id === answerStepId);
  return (
    <section className="region outcome" data-region="outcome" aria-labelledby="h-outcome">
      <h2 id="h-outcome" className="section-label">
        <KindGlyph kind="answer" /> Destination <span>· what changed</span>
      </h2>
      <div className="outcome-cols">
        <div>
          <p className="strong">{plural(files.length, 'file')} changed</p>
          {top.length > 0 && (
            <ol className="files">
              {top.map((f) => (
                <li key={f.path}>
                  <span className="mono path">{f.path}</span>
                  {f.created && <span className="mono muted"> new</span>}
                  <span className="mono edits">{plural(f.edits, 'edit')}</span>
                </li>
              ))}
            </ol>
          )}
          {files.length > top.length && <p className="muted">+{files.length - top.length} more files</p>}
          {revertedFiles ? <p className="muted">({plural(revertedFiles, 'reverted file')} not counted)</p> : null}
        </div>
        <div>
          <h3 className="sub-label">Last verification</h3>
          {v ? (
            <p data-status={v.ok ? 'ok' : 'error'}>
              <StatusGlyph status={v.ok ? 'ok' : 'error'} /> <code className="mono">{v.command}</code> {v.ok ? 'passed' : 'failed'}
            </p>
          ) : (
            <p><StatusGlyph status="unknown" /> No test, build, lint or typecheck run found.</p>
          )}
          <h3 className="sub-label">Final answer</h3>
          {answer?.text ? (
            <>
              <p className="agent-words excerpt">{answer.text}</p>
              <p className="mono muted provenance">The agent&apos;s own words · {answer.raw.file}:{answer.raw.line}</p>
            </>
          ) : (
            <p className="muted">No final answer was recorded.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function Outline({ graph: g }: { graph: SessionGraph }) {
  const card = taskCard(g);
  const rows = glance(g);
  const where = skippedWhere(g);
  const open = g.trouble.find((t) => !t.resolved);
  return (
    <div className="outline" data-testid="map" data-view="outline" data-ready="true">
      <section className="region task-card" data-region="task" aria-labelledby="h-task">
        <h2 id="h-task" className="section-label">Task <span>· {card.label}</span></h2>
        <Request text={card.request} />
        <p className="mono muted task-meta">{card.meta.join(' · ')}</p>
        {parseNotes(g).map((n) => (
          <p key={n} className="note"><InfoGlyph /><span>{n}</span></p>
        ))}
        {where.length > 0 && (
          <details className="skipped-where">
            <summary>Show where</summary>
            <p className="mono">{where.join(', ')}</p>
          </details>
        )}
        <HonestyLabel />
      </section>
      <section className="region glance" data-region="glance" aria-labelledby="h-glance">
        <h2 id="h-glance" className="section-label">At a glance</h2>
        <ul className="glance-rows">
          {rows.map((r) => (
            <li key={r.key} data-glance={r.key} data-status={r.status}>
              {r.key === 'trouble' && g.trouble.length > 0 ? (open ? <PlateGlyph kind={open.kind} resolved={false} /> : <NeutralPlateGlyph />) : <StatusGlyph status={r.status} />}{' '}
              <span><strong>{r.lead}</strong>{r.rest}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="region route" data-region="route" aria-labelledby="h-route">
        <h2 id="h-route" className="section-label">Route</h2>
        {g.steps.length === 0 ? (
          <div className="empty">
            <span className="trail-stub" aria-hidden="true" />
            <p className="strong">This session has no steps yet.</p>
            <p className="muted">Run /reasontrail again after the agent has done some work.</p>
          </div>
        ) : (
          <EpisodeList g={g} laneId={g.lanes[0]?.id ?? 'main'} />
        )}
        <p className="mono muted footnote">Detected patterns are found by rules, not by AI.</p>
      </section>
      <Destination g={g} />
    </div>
  );
}
