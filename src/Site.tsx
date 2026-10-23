// The website (PLAN phases 16, 19): the showcase home with a live sample map (`?session=<id>`, `?view=outline`), the
// drop zone (`?view=open`), the chat paste page (`?view=chat`) and install (`?view=install`). Garden links (`?sample=…`) open the zoom-in lens (phase 22),
// and so does "Zoom into this sentence" in the map's detail panel: the map stays mounted, hidden, under the lens, so
// Back (the lens's button or the browser's) shows it again with the same selection and focus (Z3).
// Internal links change the URL in place, and everything the site can need later is fetched once it is idle, so the
// gallery and the drop zone keep working offline after the first load (PLAN phase 19, AC3).
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { lensSearch, mapSearch, readSiteState, writeView, type SiteView } from './app/urlState';
import { loadDetailPanel } from './map/MapView';
import { loadShareDialog } from './share/ShareAction';
import { LensContext, type LensOpener, type LensTarget } from './lens/lensTarget';
import { sessionSamples } from './sessions/samples';
import { Install } from './site/Install';
import { Showcase } from './site/Showcase';
import { SiteShell, pageTitle } from './site/SiteShell';

const Lens = lazy(() => import('./lens/LensFrame').then((m) => ({ default: m.LensFrame })));
const loadIntake = () => import('./intake/DropZone');
const OpenSession = lazy(() => loadIntake().then((m) => ({ default: m.OpenSession })));
const GARDEN_PARAMS = /[?&](sample|path|t|seed)=/;
const HOME_TITLE = document.title;

/** Fetches the detail panel, the share dialog, the lazy samples, the drop zone and its parse worker in the background. */
function prefetch() {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
  idle(() => {
    void loadDetailPanel();
    void loadShareDialog().catch(() => {});
    for (const s of sessionSamples.slice(1)) void s.load();
    void loadIntake().then(() => import('./intake/intake')).then((m) => m.warmIntake());
  });
}

export function Site() {
  const [search, setSearch] = useState(window.location.search);
  const [file, setFile] = useState<File | null>(null);
  const state = readSiteState(search);
  // The sentence last opened from the map (kept for Forward). A live-only lens (`?lens=live`) exists only in memory.
  const [lens, setLens] = useState<LensTarget | null>(null);
  const lensView = state.lens ? lens !== null && !lens.recorded : state.garden;
  const sampleParam = new URLSearchParams(search).get('sample');
  const lensTarget = lens && (lens.recorded ? lens.recorded.gardenId === sampleParam : state.lens) ? lens : null;
  // The map is kept mounted under a lens it opened; a lens opened by a link has no map under it until Back.
  const [mapSeen, setMapSeen] = useState(!lensView);
  const saved = useRef<{ opener: HTMLElement | null; y: number; title: string } | null>(null);
  // A link or a dropped file changed the view: focus its heading once it is drawn (the drop zone is lazy, so it asks
  // again when it mounts). The gallery and the view switch keep focus where it is; Back and Forward too, unless the
  // focused element went away with the old view (focus fell to <body>).
  const navigated = useRef(false);
  const popped = useRef(false);
  const focusTitle = useCallback(() => {
    const lost = popped.current && (!document.activeElement || document.activeElement === document.body);
    const h1 = navigated.current || lost ? document.querySelector<HTMLElement>('main h1') : null;
    if (!h1) return;
    navigated.current = false;
    popped.current = false;
    h1.focus();
  }, []);
  useEffect(focusTitle, [search, focusTitle]);
  // The drop zone names its own tab (the file's name once it is mapped).
  useEffect(() => {
    if (!lensView && state.view !== 'open' && state.view !== 'chat' && !saved.current) document.title = state.view === 'install' ? pageTitle('Install') : HOME_TITLE;
  }, [lensView, state.view]);
  useEffect(() => {
    const sync = () => {
      popped.current = true;
      setSearch(window.location.search);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (!lensView) prefetch();
  }, [lensView]);

  const go = useCallback((next: string, push = true) => {
    history[push ? 'pushState' : 'replaceState'](history.state, '', `${window.location.pathname}${next}`);
    setSearch(next);
  }, []);
  // A live lens can't come back from a reload: its map shows instead, and the address bar says so.
  useEffect(() => {
    if (state.lens && !lensView) history.replaceState(history.state, '', `${window.location.pathname}${mapSearch(window.location.search)}`);
  }, [state.lens, lensView]);
  // Back on the map: its focus, scroll and title as they were (the map kept its selection while hidden).
  const wasLens = useRef(lensView);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('tg-lens', lensView);
    if (wasLens.current && !lensView && saved.current) {
      const { opener, y, title } = saved.current;
      saved.current = null;
      document.title = title;
      window.scrollTo({ top: y, behavior: 'instant' });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    }
    wasLens.current = lensView;
  }, [lensView]);
  const opener = useMemo<LensOpener>(() => {
    const sample = state.view === 'map' || state.view === 'outline' ? (sessionSamples.find((s) => s.id === state.session) ?? sessionSamples[0]) : undefined;
    return {
      sampleId: sample?.id ?? null,
      sampleTitle: sample?.title,
      open: (target) => {
        const active = document.activeElement;
        saved.current = { opener: active instanceof HTMLElement ? active : null, y: window.scrollY, title: document.title };
        setLens(target);
        setMapSeen(true);
        const next = lensSearch(window.location.search, target.recorded?.gardenId ?? null);
        history.pushState({ ...(history.state as object | null), tgLens: true }, '', `${window.location.pathname}${next}`);
        setSearch(next);
      },
    };
  }, [state.view, state.session]);
  // The lens's Back: the map entry it came from, or (a lens opened by a link) the map of the same session and step.
  const back = useCallback(() => {
    if ((history.state as { tgLens?: boolean } | null)?.tgLens) return history.back();
    navigated.current = true;
    go(mapSearch(window.location.search));
  }, [go]);
  const onFile = useCallback((f: File) => {
    setFile(f);
    const at = readSiteState(window.location.search).view;
    if (at === 'open' || at === 'chat') return;
    navigated.current = true;
    go(writeView('', 'open'));
  }, [go]);

  // Same-page links (`./`, `?view=…`, `./#how-to-read`) change the view without a page load.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest?.('a');
    const href = a?.getAttribute('href');
    if (!a || !href || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!/^(\.\/|\?)/.test(href) || GARDEN_PARAMS.test(href)) return;
    e.preventDefault();
    const url = new URL(href, window.location.href);
    navigated.current = !url.hash;
    const same = url.search === search;
    go(url.search);
    if (same) focusTitle(); // no re-render, so no effect: the heading is already drawn
    requestAnimationFrame(() => {
      const el = url.hash ? document.querySelector<HTMLElement>(url.hash) : null;
      if (!url.hash) return window.scrollTo(0, 0);
      // A folded section (How to read a map) opens, with focus on its summary.
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.querySelector('summary')?.focus();
      } else el?.focus();
    });
  };
  const setView = (v: SiteView) => go(writeView(window.location.search, v), false);
  const page =
    state.view === 'open' || state.view === 'chat' ? (
      <Suspense fallback={<p className="page muted">Loading…</p>}>
        <OpenSession key={state.view} file={file} onFile={onFile} onMount={focusTitle} chat={state.view === 'chat'} />
      </Suspense>
    ) : state.view === 'install' ? (
      <Install />
    ) : (
      <Showcase
        session={state.session}
        view={state.view}
        onView={setView}
        onSession={(id) => go(`?session=${encodeURIComponent(id)}${state.view === 'outline' ? '&view=outline' : ''}`)}
      />
    );
  return (
    <>
      {!lensView || mapSeen ? (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegated link clicks; links keep their own keyboard behaviour
        <div className="site" onClick={onClick} hidden={lensView}>
          <LensContext.Provider value={opener}>
            <SiteShell onFile={onFile} home={state.view === 'map' && !state.session} view={state.view}>{page}</SiteShell>
          </LensContext.Provider>
        </div>
      ) : null}
      {lensView ? (
        <Suspense fallback={<p className="page muted" role="status">Opening the lens…</p>}>
          <Lens target={lensTarget} focusOnOpen={lensTarget !== null} onBack={back} />
        </Suspense>
      ) : null}
    </>
  );
}
