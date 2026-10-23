import type { ReactNode } from 'react';
import { Wordmark } from '../brand/Wordmark';

export const SOURCE_URL = 'https://github.com/geekplux/reasontrail';

/** Page frame: header with the wordmark (+ `actions`), the main area, and a footer (+ `footer`) with the privacy line and
 * source link. The header has the website's wordmark size and outer margins (DESIGN §18, L1). `privacy`: replaces the
 * offline line once live growth is on (L6). */
export function AppShell({ children, actions, footer, privacy }: { children: ReactNode; actions?: ReactNode; footer?: ReactNode; privacy?: string | undefined }) {
  return (
    <>
      <header className="site-header showcase-header">
        <a className="brand" href="./">
          <Wordmark />
        </a>
        <div className="header-actions">
          {actions}
          <a className="header-link" href={SOURCE_URL}>
            GitHub
          </a>
        </div>
      </header>
      <main className="site-main">{children}</main>
      <footer className="site-footer">
        {footer}
        <p>{privacy ?? 'Runs offline; nothing you do with samples leaves your browser.'}</p>
        <p>
          <a className="footer-link" href={SOURCE_URL}>
            Source on GitHub
          </a>
        </p>
      </footer>
    </>
  );
}
