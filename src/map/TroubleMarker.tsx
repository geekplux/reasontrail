// Trouble blazes (DESIGN §8.5): the numbered plate on the route or a lane, and the "Where it got stuck" list whose rows
// match the badges one to one. Every plate pairs its shape with a word; colour only repeats it.
import { useId, useState } from 'react';
import type { SessionGraph, Trouble } from '../../shared/session/types';
import { BlazeIcon, StatusGlyph } from './Glyph';
import type { Blaze, GlanceLayout } from './layout';
import { TROUBLE_LABEL, troubleLabel } from './outline';
import { selectOnClick, useSelector } from './SelectContext';

/** Bold kind phrase + the rest of the summary: "Error streak:" "2 failed runs". In a chat a user's interruption is a
 * correction (DESIGN §18.1): "Correction:". */
export function troubleText(t: Trouble, chat = false): [string, string] {
  const label = TROUBLE_LABEL[t.kind];
  const rest = t.summary.startsWith(`${label}:`) ? t.summary.slice(label.length + 1).trim() : t.summary;
  return [`${troubleLabel(t.kind, chat)}:`, rest];
}

export function BlazeMark({ b }: { b: Blaze }) {
  const t = b.trouble[0] as Trouble;
  return <BlazeIcon kind={t.kind} resolved={b.resolved} badge={b.badge} {...(b.trouble.length > 1 ? { plus: b.trouble.length } : {})} />;
}

/** Data hooks shared by every blaze element (DESIGN §14.2). */
export const blazeData = (b: Blaze) => ({
  'data-trouble-kind': b.trouble.length > 1 ? 'group' : b.trouble[0]?.kind,
  'data-count': b.trouble.reduce((a, t) => a + t.count, 0),
  'data-resolved': String(b.resolved),
  'data-n': b.badge,
});

/** At most 5 rows (3 on a phone) until "Show all <n> patterns" (DESIGN §18.2, CL6); a selected pattern past the cap shows
 * them all. Each row names its episode (and its side trail); the record's location is in the detail panel and the outline. */
export function StuckList({ g, L, narrow = false, current }: { g: SessionGraph; L: GlanceLayout; narrow?: boolean; current?: string | undefined }) {
  const sel = useSelector();
  const listId = useId();
  const [all, setAll] = useState(false);
  const chat = g.source.kind === 'chat';
  const cap = narrow ? 3 : 5;
  const laneName = (id: string) => {
    const l = g.lanes.find((x) => x.id === id);
    return !l || l.id === g.lanes[0]?.id ? '' : l.agentType ?? l.name;
  };
  const episodeOf = (stepId: string) => g.episodes.find((e) => !e.parentId && e.stepIds.includes(stepId))?.title ?? '';
  const picked = L.blazes.find((b) => b.id === current)?.trouble.some((t) => (L.numbers.get(t.id) ?? 0) > cap) ?? false;
  const open = all || picked;
  const more = L.order.length - cap;
  return (
    <section className="region stuck" data-region="trouble" aria-labelledby="h-stuck">
      <h2 id="h-stuck" className="region-head">Where it got stuck <span>· {L.order.length === 1 ? '1 detected pattern' : `${L.order.length} detected patterns`}</span></h2>
      {L.order.length === 0 ? (
        <p className="stuck-none"><StatusGlyph status="ok" /><span>No trouble detected. {chat ? 'No corrections or regenerated answers.' : 'No failed runs, retries, reverts or interruptions.'}<span className="visually-hidden"> Status: none.</span></span></p>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics under list-style: none
        <ol id={listId} className="stuck-rows" role="list">
          {L.order.map((t, i) => {
            const n = L.numbers.get(t.id) ?? 0;
            const [lead, rest] = troubleText(t, chat);
            const step = g.steps.find((s) => s.id === t.stepIds[0]);
            const ep = episodeOf(t.stepIds[0] ?? '');
            const where = [chat ? '' : laneName(step?.laneId ?? ''), ep.length > 40 ? `${ep.slice(0, 39)}…` : ep].filter(Boolean).join(' · ');
            return (
              <li key={t.id} data-trouble-kind={t.kind} data-count={t.count} data-resolved={String(t.resolved)} data-n={n} hidden={!open && i >= cap}>
                <BlazeIcon kind={t.kind} resolved={t.resolved} badge={String(n)} />
                <span>
                  <span className="stuck-text">{sel ? <a href={sel.href(t.stepIds[0])} onClick={selectOnClick(() => sel.select(`trouble:${t.id}`))}><strong>{lead}</strong> {rest}</a> : <><strong>{lead}</strong> {rest}</>}<span className="visually-hidden">. Detected pattern {n}, {t.resolved ? 'resolved' : 'unresolved'}.</span></span>
                  {where && <span className="muted stuck-where">{where}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {more > 0 && !picked && (
        <button type="button" className="link-button stuck-all" aria-expanded={open} aria-controls={listId} onClick={() => setAll(!all)}>
          {open ? 'Show fewer patterns' : `Show all ${L.order.length} patterns`}
        </button>
      )}
      <p className="muted footnote">Detected patterns are found by rules, not by AI.</p>
    </section>
  );
}
