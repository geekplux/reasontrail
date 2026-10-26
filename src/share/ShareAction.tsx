// The quiet "Save shareable copy…" text button (DESIGN §13.1, V4). The dialog and its export code are a separate chunk,
// so the first view's JS does not grow: it is fetched when the browser is idle after the button appears, and once it is
// here the dialog renders in the click's own frame. Focus returns to the button when the dialog closes.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import type { SessionGraph } from '../../shared/session/types';

type DialogType = typeof import('./ShareDialog').default;
let LoadedDialog: DialogType | null = null;
let loading: Promise<DialogType> | null = null;
/** Fetches the dialog's code once; a failed fetch may be retried by the next call. */
export const loadShareDialog = () =>
  (loading ??= import('./ShareDialog').then(
    (m) => (LoadedDialog = m.default),
    (err: unknown) => {
      loading = null;
      throw err;
    },
  ));
const LazyDialog = lazy(() => loadShareDialog().then((c) => ({ default: c })));
/** Picks the dialog component once per opening, so it never remounts when the code arrives while it is open. */
function ShareDialog(props: ComponentProps<DialogType>) {
  const [Dialog] = useState<DialogType>(() => LoadedDialog ?? (LazyDialog as unknown as DialogType));
  return <Dialog {...props} />;
}

/** If the dialog's chunk fails to load (offline website, stale deploy) or throws, say so instead of losing the page. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p className="share-load-error" role="alert">Could not open the share dialog</p> : this.props.children;
  }
}

/** `from`: where the viewer template comes from: the website's built `/viewer.html`, or this page itself (a local map). */
/** `prior`: items an already shared copy had replaced, carried into the new copy's ribbon. `label` and `className`: the
 * button's text and class where a page sets it differently (the v7 session card's "Share"). */
export function ShareAction({ graph, from, version, prior, label = 'Save shareable copy…', className = 'text-button share-button' }: { graph: SessionGraph; from: 'site' | 'page'; version?: string | undefined; prior?: number | undefined; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [tries, setTries] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  // Fetch the dialog's code in the background once the button is on screen, so a click opens it at once.
  useEffect(() => {
    if (LoadedDialog) return;
    const preload = () => void loadShareDialog().catch(() => {});
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 2_000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 200);
    return () => clearTimeout(id);
  }, []);
  // Back to the button once the modal dialog has closed (while it is open, the rest of the page is inert).
  useEffect(() => {
    if (was.current && !open) button.current?.focus();
    was.current = open;
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <button ref={button} type="button" className={className} aria-haspopup="dialog" onClick={() => {
        setTries((t) => t + 1);
        setOpen(true);
      }}>{label}</button>
      {open && (
        <Boundary key={tries}>
          <Suspense fallback={null}>
            <ShareDialog graph={graph} from={from} version={version} prior={prior} onClose={close} />
          </Suspense>
        </Boundary>
      )}
    </>
  );
}
