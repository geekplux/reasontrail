// The website's chrome (DESIGN §13.3, §13.4, §18): wordmark, one quiet link and one primary button (How to read and
// GitHub live in the footer, and How to read in the map's honesty label too, keeping CL2's six first-view controls); a left-aligned
// footer with the privacy line; and the drop overlay shown while a file is dragged anywhere over the page.
import { useEffect, useState, type ReactNode } from 'react';
import './site.css';
import { LogoMark } from '../brand/LogoMark';
import { Wordmark } from '../brand/Wordmark';
import { SOURCE_URL } from '../components/AppShell';

export const PRIVACY = 'Parsed in your browser. Nothing is uploaded.';
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

export function SiteShell({ children, onFile, home }: { children: ReactNode; onFile(file: File): void; home: boolean }) {
  const dragging = useFileDrop(onFile);
  return (
    <>
      <header className="site-header showcase-header">
        {home ? <Wordmark /> : <a className="brand" href="./" aria-label="Reasontrail home"><Wordmark /></a>}
        <nav className="site-nav" aria-label="Site">
          <a className="header-link" href="?view=install">Install</a>
        </nav>
        <a className="button primary" href="?view=open">Map your own session</a>
      </header>
      <main className="site-main">{children}</main>
      <footer className="site-footer showcase-footer">
        <p>{PRIVACY} · MIT · <a className="footer-link" href={SOURCE_URL}>Source on GitHub</a></p>
        <p>
          <a className="footer-link" href="./#how-to-read">How to read a map</a> ·{' '}
          <a className="footer-link" href="?view=install">Install</a> · Zoom into the words:{' '}
          <a className="footer-link" href="?sample=">the next-token garden</a>
        </p>
      </footer>
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
