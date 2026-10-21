// Trouble blazes (DESIGN §8.5): the numbered plate on the route or a lane, and the "Where it got stuck" list whose rows
// match the badges one to one. Every plate pairs its shape with a word; colour only repeats it.
import type { SessionGraph, Trouble } from '../../shared/session/types';
import { BlazeIcon, StatusGlyph } from './Glyph';
import type { Blaze, GlanceLayout } from './layout';
import { TROUBLE_LABEL, fileLabel } from './outline';
import { selectOnClick, useSelector } from './SelectContext';

/** Bold kind phrase + the rest of the summary: "Error streak:" "2 failed runs". */
export function troubleText(t: Trouble): [string, string] {
  const label = TROUBLE_LABEL[t.kind];
  const rest = t.summary.startsWith(`${label}:`) ? t.summary.slice(label.length + 1).trim() : t.summary;
  return [`${label}:`, rest];
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

export function StuckList({ g, L }: { g: SessionGraph; L: GlanceLayout }) {
  const sel = useSelector();
  const laneName = (id: string) => {
    const l = g.lanes.find((x) => x.id === id);
    return !l || l.id === g.lanes[0]?.id ? 'main' : l.agentType ?? l.name;
  };
  const episodeOf = (stepId: string) => g.episodes.find((e) => !e.parentId && e.stepIds.includes(stepId))?.title ?? '';
  return (
    <section className="region stuck" data-region="trouble" aria-labelledby="h-stuck">
      <h2 id="h-stuck" className="section-label">Where it got stuck <span>· {L.order.length === 1 ? '1 detected pattern' : `${L.order.length} detected patterns`}</span></h2>
      {L.order.length === 0 ? (
        <p className="stuck-none"><StatusGlyph status="ok" /><span>No trouble detected. No failed runs, retries, reverts or interruptions.<span className="visually-hidden"> Status: none.</span></span></p>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics under list-style: none
        <ol className="stuck-rows" role="list">
          {L.order.map((t) => {
            const n = L.numbers.get(t.id) ?? 0;
            const [lead, rest] = troubleText(t);
            const step = g.steps.find((s) => s.id === t.stepIds[0]);
            const ep = episodeOf(t.stepIds[0] ?? '');
            return (
              <li key={t.id} data-trouble-kind={t.kind} data-count={t.count} data-resolved={String(t.resolved)} data-n={n}>
                <BlazeIcon kind={t.kind} resolved={t.resolved} badge={String(n)} />
                <span>
                  <span className="stuck-text">{sel ? <a href={sel.href(t.stepIds[0])} onClick={selectOnClick(() => sel.select(`trouble:${t.id}`))}><strong>{lead}</strong> {rest}</a> : <><strong>{lead}</strong> {rest}</>}<span className="visually-hidden">. Detected pattern {n}, {t.resolved ? 'resolved' : 'unresolved'}.</span></span>
                  <span className="mono muted stuck-where">{[laneName(step?.laneId ?? ''), ep.length > 40 ? `${ep.slice(0, 39)}…` : ep, `${fileLabel(t.raw.file)}:${t.raw.line}`].filter(Boolean).join(' · ')}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="muted footnote">Detected patterns are found by rules, not by AI.</p>
    </section>
  );
}
