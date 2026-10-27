// The website's home, top to bottom: the hero (headline, lede and the
// install command on the lede's last baseline), the sample's tree at the full content width with its legend, the sample
// tabs right under it, the session card, install, and "Made by GeekPlux". The header and footer are SiteShell's.
// A step selected in the tree or the list (or by `&step=` in the URL) highlights its path in the tree with a callout,
// opens its episode in the list and the detail panel in the card.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { COMMANDS, SKILL_CALL } from '../../shared/commands';
import { InlineNote } from '../components/states/InlineNote';
import { defaultSessionGraph, sessionSamples } from '../sessions/samples';
import { CommandLine } from './Install';
import { MAKER, MORE_SITES, shownUrl } from './moreSites';
import { HeroTree } from './HeroTree';
import { SessionCard } from './SessionCard';
import { revealTab } from './revealTab';
import { usePhone } from './usePhone';
import { useSessionMap } from './useSessionMap';
import { TreeLegend } from '../map/tree/TreeLegend';

const CARD_ID = 'session';
const TREE_ID = 'hero-tree';

/** The sample tabs: a segmented control under the tree, WAI-ARIA tabs with automatic activation. Where the
 * track scrolls sideways (the phone), the selected tab is kept in view: on load (a `?session=` link), on a switch and
 * when the arrow keys move focus. */
function SampleTabs({ current, onChoose }: { current: string; onChoose(id: string): void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const track = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tab = tabs.current[sessionSamples.findIndex((s) => s.id === current)];
    if (track.current && tab) revealTab(track.current, tab);
  }, [current]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = sessionSamples.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    tabs.current[to]?.focus();
    tabs.current[to]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    onChoose(sessionSamples[to]!.id);
  };
  return (
    <div ref={track} className="tabs" role="tablist" aria-label="Sample sessions">
      {sessionSamples.map((s, i) => (
        <button
          key={s.id}
          ref={(el) => {
            tabs.current[i] = el;
          }}
          type="button"
          role="tab"
          className="tab"
          aria-selected={s.id === current}
          aria-controls={`${TREE_ID} ${CARD_ID}`}
          tabIndex={s.id === current ? 0 : -1}
          onClick={() => onChoose(s.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {s.short}
        </button>
      ))}
    </div>
  );
}

/** `step`: the selected step from the URL (ignored when the sample does not list it); `onStep` writes it. */
export function Home({ session, onSession, step = null, onStep }: { session: string | null; onSession(id: string): void; step?: string | null; onStep?(stepId: string | undefined): void }) {
  const sample = sessionSamples.find((s) => s.id === session) ?? sessionSamples[0]!;
  const phone = usePhone();
  const unknown = session !== null && sample.id !== session;
  // Loaded graphs are kept per sample id, so a tab switch re-renders the card without remounting the tabs.
  const [loaded, setLoaded] = useState<{ id: string; graph: SessionGraph } | null>(sample.id === sessionSamples[0]?.id ? { id: sample.id, graph: defaultSessionGraph } : null);
  const [failed, setFailed] = useState<string>();
  const graph = loaded?.id === sample.id ? loaded.graph : null;
  useEffect(() => {
    if (graph) return;
    let live = true; // a late answer for a sample left behind must not replace the current one
    sample.load().then(
      (g) => live && setLoaded({ id: sample.id, graph: g }),
      () => live && setFailed(sample.id),
    );
    return () => {
      live = false;
    };
  }, [graph, sample]);
  const { hovered, onActive, picked, selection, callout, select, onPick, focusDetail, overlay, onOverlay, tagged } = useSessionMap(sample.id, graph, step, onStep);
  const card = graph ? (
    <SessionCard key={sample.id} id={CARD_ID} g={graph} tag="Sample" branch={sample.branch} hover={hovered} onActive={(a, via) => onActive(a?.episodeId, via)}
      selection={selection} onSelect={(next) => select(next)} focusDetail={focusDetail} overlay={overlay} onOverlay={onOverlay} tabs />
  ) : failed === sample.id ? (
    <div className="frame" id={CARD_ID}>
      <InlineNote variant="error">This sample did not load. Reload the page to try again.</InlineNote>
    </div>
  ) : (
    <p className="frame muted" id={CARD_ID}>Loading the sample…</p>
  );
  return (
    <div className="v7 home">
      <section className="hero" aria-labelledby="hero-h">
        <div className="hero-top">
          <div>
            <h1 id="hero-h" tabIndex={-1}>See how your coding agent got there.</h1>
            <p className="lede">Every session as a tree: subagents are limbs, episodes are branches, tool calls are twigs.</p>
          </div>
          <CommandLine command={COMMANDS.installSkill} label="the skill install command" />
        </div>
        <HeroTree id={TREE_ID} g={graph} hover={hovered} onHover={(e) => onActive(e, 'pointer')} selected={picked?.step.stepId} callout={callout} onPick={onPick} tagged={tagged} legend={!phone} />
        <div className="under">
          <SampleTabs current={sample.id} onChoose={onSession} />
          {phone && <TreeLegend />}
        </div>
      </section>
      {unknown && <InlineNote variant="info">That session isn&apos;t here, so here is “{sample.title}”.</InlineNote>}
      {card}
      <section className="install" id="install" tabIndex={-1} aria-labelledby="install-h">
        <div>
          <h2 id="install-h">Map your own sessions</h2>
          <p className="muted">Install the skill once, then ask your agent to map the current session. It opens in your browser; nothing is uploaded.</p>
        </div>
        <div>
          <CommandLine command={COMMANDS.installSkill} label="the skill install command" big />
          <dl className="agents">
            <div><dt>Claude Code</dt><dd className="code">{SKILL_CALL.slash}</dd></div>
            <div><dt>Grok Build</dt><dd className="code">{SKILL_CALL.slash}</dd></div>
            <div><dt>Codex</dt><dd className="code">{SKILL_CALL.codex}</dd></div>
          </dl>
        </div>
      </section>
      <section className="more" aria-labelledby="more-h">
        <div className="maker">
          <h2 id="more-h">Made by {MAKER.name}</h2>
          <p className="muted">{MAKER.line}</p>
          <a className="url" href={MAKER.url}>{shownUrl(MAKER.url)}</a>
        </div>
        <ul className="sites">
          {MORE_SITES.map((s) => (
            <li key={s.name}>
              <a href={s.url}>
                <span className="strong">{s.name}</span>
                <span className="muted">{s.line}</span>
                <span className="url">{shownUrl(s.url)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
