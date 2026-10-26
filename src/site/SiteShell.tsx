// The website's chrome (v7 §4.1, §4.8, docs/design/v7/preview/Home.html): the header bar with the wordmark, three nav
// links and the one primary button; the footer with the wordmark and its links (both also frame the next-token garden
// lens, AppShell); and the drop overlay shown while a file is dragged anywhere over the page.
import { useEffect, useState, type ReactNode } from 'react';
import './site.css';
import './home.css';
import { LogoMark } from '../brand/LogoMark';
import { Wordmark } from '../brand/Wordmark';
import type { SiteView } from '../app/urlState';
import { usePhone } from './usePhone';
import { ThemeButton } from './theme/ThemeButton';

export const SOURCE_URL = 'https://github.com/geekplux/reasontrail';
export const PRIVACY = 'Parsed in your browser. Nothing is uploaded.';
/** The tab title of a page other than home: "Install – Reasontrail" (an en dash). */
export const pageTitle = (what: string) => `${what} – Reasontrail`;
const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

/** Shows the overlay while files are dragged over the window, and hands a dropped file to `onFile`. */
function useFileDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e) || --depth > 0) return;
      depth = 0;
      setOver(false);
    };
    const allow = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFile(file);
    };
    const all = [['dragenter', enter], ['dragleave', leave], ['dragover', allow], ['drop', drop]] as const;
    for (const [type, fn] of all) window.addEventListener(type, fn);
    return () => {
      for (const [type, fn] of all) window.removeEventListener(type, fn);
    };
  }, [onFile]);
  return over;
}

const HOW = '?view=how';

/** The header bar (v7 §4.1): the wordmark, three nav links, `actions` (the garden's Copy link), the theme button, the
 * one primary button.
 * `view`: the website page shown, for `aria-current` (none in the lens). */
export function SiteHeader({ view, actions }: { view?: SiteView | undefined; actions?: ReactNode }) {
  const phone = usePhone();
  const current = (v: SiteView) => (view === v ? 'page' : undefined);
  return (
    <header className="v7 bar">
      <a className="brand" href="./" aria-current={view === 'map' ? 'page' : undefined}><Wordmark /></a>
      <nav className="nav" aria-label="Site">
        <a href={HOW} aria-current={current('how')}>How to read a map</a>
        <a href="./#install">Install</a>
        <a href={SOURCE_URL}>GitHub</a>
      </nav>
      {actions}
      <ThemeButton />
      <a className="btn primary" href="?view=open" aria-current={current('open')}>{phone ? 'Open session' : 'Open a session'}</a>
    </header>
  );
}

/** The footer (v7 §4.8): the wordmark and its links. */
export const SiteFooter = () => (
  <footer className="v7 foot">
    <a className="brand" href="./"><Wordmark /></a>
    <nav aria-label="More">
      <a href={HOW}>How to read a map</a>
      <a href="?sample=">Next-token garden</a>
      <a href={SOURCE_URL}>GitHub</a>
      <span>MIT licence</span>
    </nav>
  </footer>
);

export function SiteShell({ children, onFile, view }: { children: ReactNode; onFile(file: File): void; view: SiteView }) {
  const dragging = useFileDrop(onFile);
  return (
    <>
      <SiteHeader view={view} />
      <main className="site-main">{children}</main>
      <SiteFooter />
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <LogoMark />
          <p className="strong">Drop a .jsonl to map it</p>
          <p className="muted">{PRIVACY}</p>
        </div>
      )}
    </>
  );
}
