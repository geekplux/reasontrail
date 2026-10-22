// The quiet "Save shareable copy…" text button (DESIGN §13.1, V4). The dialog and its export code load on first use,
// so the first view's JS does not grow; focus returns to the button when the dialog closes.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { SessionGraph } from '../../shared/session/types';

const ShareDialog = lazy(() => import('./ShareDialog'));

/** `from`: where the viewer template comes from: the website's built `/viewer.html`, or this page itself (a local map). */
/** `prior`: items an already shared copy had replaced, carried into the new copy's ribbon. */
export function ShareAction({ graph, from, version, prior }: { graph: SessionGraph; from: 'site' | 'page'; version?: string | undefined; prior?: number | undefined }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  // Back to the button once the modal dialog has closed (while it is open, the rest of the page is inert).
  useEffect(() => {
    if (was.current && !open) button.current?.focus();
    was.current = open;
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button ref={button} type="button" className="text-button share-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>Save shareable copy…</button>
      {open && (
        <Suspense fallback={null}>
          <ShareDialog graph={graph} from={from} version={version} prior={prior} onClose={close} />
        </Suspense>
      )}
    </>
  );
}
