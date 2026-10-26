import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '../site/SiteShell';

export { SOURCE_URL } from '../site/SiteShell';

/** The next-token garden's page frame: the website's header (+ `actions`, the garden's Copy link) and footer, with the
 * garden's notes (`footer`) and the privacy line at the end of the page. `privacy`: replaces the offline line once
 * live growth is on (L6). */
export function AppShell({ children, actions, footer, privacy }: { children: ReactNode; actions?: ReactNode; footer?: ReactNode; privacy?: string | undefined }) {
  return (
    <>
      <SiteHeader actions={actions} />
      <main className="site-main garden-page">
        {children}
        <div className="garden-notes">
          {footer}
          <p>{privacy ?? 'Runs offline; nothing you do with samples leaves your browser.'}</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
