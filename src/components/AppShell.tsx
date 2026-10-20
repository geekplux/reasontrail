import type { ReactNode } from 'react';
import { Wordmark } from '../brand/Wordmark';

export const SOURCE_URL = 'https://github.com/geekplux/token-garden';

/** Page frame: header with the wordmark (+ `actions`), the main area, and a footer (+ `footer`) with the privacy line and source link. */
export function AppShell({ children, actions, footer }: { children: ReactNode; actions?: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <header className="site-header">
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
        <p>Runs offline; nothing you do with samples leaves your browser.</p>
        <p>
          <a className="footer-link" href={SOURCE_URL}>
            Source on GitHub
          </a>
        </p>
      </footer>
    </>
  );
}
