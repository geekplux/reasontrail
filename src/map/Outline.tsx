// The outline view (DESIGN §10.2, DM16): the map's four regions as plain document structure. No ARIA widget roles,
// no custom keys: headings, ordered lists and one disclosure button per episode.
import { useId, useState, type ReactNode } from 'react';
import type { Episode, SessionGraph } from '../../shared/session/types';
import './outline.css';
import { KindGlyph, PlateGlyph, StatusGlyph, UnstoredGlyph } from './Glyph';
import { troubleNumbers } from './layout';
import { OutcomeCard } from './OutcomeCard';
import { STATUS_WORD, TROUBLE_LABEL, episodeLinks, laneEpisodes, stepLines, troubleLabel } from './outline';
import { GlanceRows, TaskCard } from './TaskCard';
import { useMapReady } from './MapView';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
  const numbers = troubleNumbers(g);
  return (
    <li className="episode" data-episode-id={e.id} data-episode-kind={e.kind} data-lane={e.laneId}>
      <p className="episode-head">
        <KindGlyph kind={e.kind} />
        <span>
          <span id={titleId} className="episode-title">{e.title}</span> <span className="mono muted">{e.kind}</span>
        </span>
      </p>
      {trouble.length > 0 && (
        <ul className="chips">
          {trouble.map(({ t }) => ({ t, n: numbers.get(t.id) ?? 0 })).map(({ t, n }) => (
            <li key={t.id} className="chip" data-trouble-kind={t.kind} data-count={t.count} data-resolved={t.resolved} data-n={n}>
              <PlateGlyph kind={t.kind} resolved={t.resolved} />
              <span className="chip-n mono">{n}</span>
              <span className="chip-text">
                <strong>{troubleLabel(t.kind, g.source.kind === 'chat')}:</strong> {t.summary.replace(new RegExp(`^${TROUBLE_LABEL[t.kind]}:\\s*`), '')}
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
      <button type="button" className="link-button disclosure" aria-expanded={open} aria-controls={stepsId} aria-label={`${plural(e.stepIds.length, 'step')} in ${e.title}`} onClick={() => setOpen(!open)}>
        {plural(e.stepIds.length, 'step')}
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

/** `head` and `label`: as for the map (the Map/Outline switch in the eyebrow row, one more eyebrow word). */
export function Outline({ graph: g, sample = false, head, label }: { graph: SessionGraph; sample?: boolean; head?: ReactNode; label?: string | undefined }) {
  useMapReady();
  return (
    <div className="outline" data-testid="map" data-view="outline" data-ready="true">
      <TaskCard g={g} sample={sample} title={g.displayTitle} label={label} head={head} />
      <GlanceRows g={g} />
      <section className="region route" data-region="route" aria-labelledby="h-route">
        <h2 id="h-route" className="region-head">Route</h2>
        {g.steps.length === 0 ? (
          <div className="empty">
            <span className="trail-stub" aria-hidden="true" />
            <p className="strong">This session has no steps yet.</p>
            <p className="muted">Run /reasontrail again after the agent has done some work.</p>
          </div>
        ) : (
          <EpisodeList g={g} laneId={g.lanes[0]?.id ?? 'main'} />
        )}
        <p className="muted footnote">Detected patterns are found by rules, not by AI.</p>
      </section>
      <OutcomeCard g={g} full />
    </div>
  );
}
