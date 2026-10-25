// The website's home (v7 §4, §13, docs/design/v7/preview/Home.html), top to bottom: the hero (headline, lede and the
// install command on the lede's last baseline), the sample's tree at the full content width with its legend, the sample
// tabs right under it, the session card, install, and "Made by GeekPlux". The header and footer are SiteShell's.
// A step selected in the tree or the list (or by `&step=` in the URL) highlights its path in the tree with a callout,
// opens its episode in the list and the detail panel in the card.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { COMMANDS, SKILL_CALL } from '../../shared/commands';
import { InlineNote } from '../components/states/InlineNote';
import type { ListSelection } from '../map/gitlist/GitList';
import type { HitTarget } from '../map/tree';
import { defaultSessionGraph, sessionSamples } from '../sessions/samples';
import { CommandLine } from './Install';
import { MAKER, MORE_SITES, shownUrl } from './moreSites';
import { HeroTree } from './HeroTree';
import { SessionCard } from './SessionCard';
import { findStep, stepFacts } from './stepDetail';
import { usePhone } from './usePhone';
import { TreeLegend } from '../map/tree/TreeLegend';

const CARD_ID = 'session';
const TREE_ID = 'hero-tree';

/** The sample tabs (§4.4): a segmented control under the tree, WAI-ARIA tabs with automatic activation. */
function SampleTabs({ current, onChoose }: { current: string; onChoose(id: string): void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = sessionSamples.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    tabs.current[to]?.focus();
    onChoose(sessionSamples[to]!.id);
  };
  return (
    <div className="tabs" role="tablist" aria-label="Sample sessions">
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
  // The hovered episode, from the tree (pointer) or the list (pointer or focus); a tab switch clears it. When the
  // pointer leaves, the focused list row's episode (if any) is shown again; when focus leaves the rows, the episode
  // under the pointer (if any).
  type Active = { id: string; episodeId: string } | undefined;
  const [hover, setHover] = useState<Active>();
  const [pointer, setPointer] = useState<Active>();
  const [focused, setFocused] = useState<Active>();
  // A tab switch drops the focused row too (adjusted during render, not in an effect).
  const [focusedOn, setFocusedOn] = useState(sample.id);
  if (focusedOn !== sample.id) {
    setFocusedOn(sample.id);
    setFocused(undefined);
  }
  const hovered = hover?.id === sample.id ? hover.episodeId : undefined;
  const of = (episodeId: string | undefined): Active => (episodeId ? { id: sample.id, episodeId } : undefined);
  const current = (a: Active): Active => (a?.id === sample.id ? a : undefined);
  const onActive = (episodeId: string | undefined, via: 'focus' | 'pointer') => {
    if (via === 'pointer') {
      setPointer(of(episodeId));
      setHover(of(episodeId) ?? current(focused));
      return;
    }
    setFocused(of(episodeId));
    setHover(of(episodeId) ?? current(pointer));
  };
  // The selection: the URL's step (when this sample lists it), else the episode open in the list.
  const picked = graph ? findStep(graph, step) : undefined;
  const [open, setOpen] = useState<{ id: string; episodeId: string }>();
  // The step last picked in the tree, and how the panel scrolls its title into view: just into view where the tree
  // has text (desktop), to the top under the phone's bare tree.
  const [treePick, setTreePick] = useState<{ stepId: string | undefined; block: 'nearest' | 'start' }>();
  const openEp = open?.id === sample.id ? open.episodeId : undefined;
  const selection: ListSelection = picked ? { episodeId: picked.episode.episodeId, stepId: picked.step.stepId } : openEp ? { episodeId: openEp } : {};
  const callout = useMemo<[string, string] | undefined>(() => (graph && picked ? [picked.step.label, stepFacts(graph, picked)] : undefined), [graph, picked]);
  const select = (next: ListSelection, fromTree?: { labels: boolean }) => {
    setTreePick(fromTree ? { stepId: next.stepId, block: fromTree.labels ? 'nearest' : 'start' } : undefined);
    setOpen(next.episodeId ? { id: sample.id, episodeId: next.episodeId } : undefined);
    if (next.stepId !== picked?.step.stepId) onStep?.(next.stepId);
  };
  const onPick = (hit: HitTarget, labels: boolean) => {
    const s = graph && hit.kind === 'step' ? findStep(graph, hit.id) : undefined;
    select(s ? { episodeId: s.episode.episodeId, stepId: s.step.stepId } : { episodeId: hit.episodeId }, { labels });
  };
  const card = graph ? (
    <SessionCard key={sample.id} id={CARD_ID} g={graph} sample branch={sample.branch} hover={hovered} onActive={(a, via) => onActive(a?.episodeId, via)}
      selection={selection} onSelect={(next) => select(next)} focusDetail={picked !== undefined && treePick?.stepId === picked.step.stepId && treePick.block} />
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
        <HeroTree id={TREE_ID} g={graph} hover={hovered} onHover={(e) => onActive(e, 'pointer')} selected={picked?.step.stepId} callout={callout} onPick={onPick} legend={!phone} />
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
