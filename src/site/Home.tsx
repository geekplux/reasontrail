// The website's home (v7 §4, §13, docs/design/v7/preview/Home.html), top to bottom: the hero (headline, lede and the
// install command on the lede's last baseline), the sample's tree at the full content width with its legend, the sample
// tabs right under it, the session card, install, and "Made by GeekPlux". The header and footer are SiteShell's.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { COMMANDS, SKILL_CALL } from '../../shared/commands';
import { InlineNote } from '../components/states/InlineNote';
import { defaultSessionGraph, sessionSamples } from '../sessions/samples';
import { CommandLine } from './Install';
import { MAKER, MORE_SITES, shownUrl } from './moreSites';
import { SessionCard } from './SessionCard';
import { LEGEND_HTML, TREE_SVG } from './static/reference';

const CARD_ID = 'session';
const TREE_ID = 'hero-tree';
const DRAWN = sessionSamples[0]?.id; // TEMPORARY: the one sample with a static tree and list until phases 30 and 32

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

export function Home({ session, onSession }: { session: string | null; onSession(id: string): void }) {
  const sample = sessionSamples.find((s) => s.id === session) ?? sessionSamples[0]!;
  const unknown = session !== null && sample.id !== session;
  // Loaded graphs are kept per sample id, so a tab switch re-renders the card without remounting the tabs.
  const [loaded, setLoaded] = useState<{ id: string; graph: SessionGraph } | null>(sample.id === sessionSamples[0]?.id ? { id: sample.id, graph: defaultSessionGraph } : null);
  const graph = loaded?.id === sample.id ? loaded.graph : null;
  useEffect(() => {
    if (graph) return;
    let live = true; // a late answer for a sample left behind must not replace the current one
    void sample.load().then((g) => live && setLoaded({ id: sample.id, graph: g }));
    return () => {
      live = false;
    };
  }, [graph, sample]);
  const drawn = sample.id === DRAWN;
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
        <figure className="hero-tree" id={TREE_ID}>
          {/* TEMPORARY: the canvas's static tree for the default sample; the tree renderer replaces it in phase 32. */}
          <p className="legend" dangerouslySetInnerHTML={{ __html: LEGEND_HTML }} />
          {drawn ? <div className="tree-wrap" dangerouslySetInnerHTML={{ __html: TREE_SVG }} /> : <p className="tree-wrap muted">This sample&apos;s tree is not drawn yet.</p>}
        </figure>
        <div className="under">
          <SampleTabs current={sample.id} onChoose={onSession} />
        </div>
      </section>
      {unknown && <InlineNote variant="info">That session isn&apos;t here, so here is “{sample.title}”.</InlineNote>}
      {graph ? <SessionCard key={sample.id} id={CARD_ID} g={graph} sample branch={sample.branch} drawn={drawn} /> : <p className="frame muted" id={CARD_ID}>Loading the sample…</p>}
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
