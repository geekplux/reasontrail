// The website (PLAN phases 16, 19): the showcase home with a live sample map (`?session=<id>`, `?view=outline`), the
// drop zone (`?view=open`) and install (`?view=install`). Garden links (`?sample=…`) still open the next-token lens.
// Internal links change the URL in place, and everything the site can need later is fetched once it is idle, so the
// gallery and the drop zone keep working offline after the first load (PLAN phase 19, AC3).
import { lazy, Suspense, useCallback, useEffect, useState, type MouseEvent } from 'react';
import { readSiteState, writeView, type SiteView } from './app/urlState';
import { sessionSamples } from './sessions/samples';
import { Install } from './site/Install';
import { Showcase } from './site/Showcase';
import { SiteShell } from './site/SiteShell';

const Garden = lazy(() => import('./App').then((m) => ({ default: m.App })));
const loadIntake = () => import('./intake/DropZone');
const OpenSession = lazy(() => loadIntake().then((m) => ({ default: m.OpenSession })));
const GARDEN_PARAMS = /[?&](sample|path|t|seed)=/;

/** Fetches the lazy samples, the drop zone and its parse worker in the background. */
function prefetch() {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
  idle(() => {
    for (const s of sessionSamples.slice(1)) void s.load();
    void loadIntake().then(() => import('./intake/intake')).then((m) => m.warmIntake());
  });
}

export function Site() {
  const [search, setSearch] = useState(window.location.search);
  const [file, setFile] = useState<File | null>(null);
  const state = readSiteState(search);
  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (!state.garden) prefetch();
  }, [state.garden]);

  const go = useCallback((next: string, push = true) => {
    history[push ? 'pushState' : 'replaceState'](history.state, '', `${window.location.pathname}${next}`);
    setSearch(next);
  }, []);
  const onFile = useCallback((f: File) => {
    setFile(f);
    if (readSiteState(window.location.search).view !== 'open') go(writeView('', 'open'));
  }, [go]);

  if (state.garden) {
    return (
      <Suspense fallback={null}>
        <Garden />
      </Suspense>
    );
  }
  // Same-page links (`./`, `?view=…`, `./#how-to-read`) change the view without a page load.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest?.('a');
    const href = a?.getAttribute('href');
    if (!a || !href || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!/^(\.\/|\?)/.test(href) || GARDEN_PARAMS.test(href)) return;
    e.preventDefault();
    const url = new URL(href, window.location.href);
    go(url.search);
    requestAnimationFrame(() => (url.hash ? document.querySelector<HTMLElement>(url.hash)?.focus() : window.scrollTo(0, 0)));
  };
  const setView = (v: SiteView) => go(writeView(window.location.search, v), false);
  const page =
    state.view === 'open' ? (
      <Suspense fallback={<p className="page muted">Loading…</p>}>
        <OpenSession file={file} onFile={onFile} />
      </Suspense>
    ) : state.view === 'install' ? (
      <Install />
    ) : (
      <Showcase
        key={state.session ?? ''}
        session={state.session}
        view={state.view}
        onView={setView}
        onSession={(id) => go(`?session=${encodeURIComponent(id)}${state.view === 'outline' ? '&view=outline' : ''}`)}
      />
    );
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegated link clicks; links keep their own keyboard behaviour
    <div className="site" onClick={onClick}>
      <SiteShell onFile={onFile} home={state.view === 'map' && !state.session}>{page}</SiteShell>
    </div>
  );
}
