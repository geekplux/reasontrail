// The quiet "Save shareable copy…" text button (DESIGN §13.1, V4). The dialog and its export code load on first use,
// so the first view's JS does not grow; focus returns to the button when the dialog closes.
import { lazy, Suspense, useRef, useState } from 'react';
import type { SessionGraph } from '../../shared/session/types';

const ShareDialog = lazy(() => import('./ShareDialog'));

/** `from`: where the viewer template comes from: the website's built `/viewer.html`, or this page itself (a local map). */
export function ShareAction({ graph, from, version }: { graph: SessionGraph; from: 'site' | 'page'; version?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  return (
    <>
      <button ref={button} type="button" className="text-button share-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>Save shareable copy…</button>
      {open && (
        <Suspense fallback={null}>
          <ShareDialog graph={graph} from={from} version={version} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
