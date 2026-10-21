// The route header's quiet "AI labels" control (DESIGN §13.6, PLAN phase 21), loaded only when it is first used.
// Website: consent dialog → "Labelling k of n" + Cancel → an overlay toggle, or a calm note. Local viewer (`--ai`):
// the overlay is already in the page, so it is only a toggle. Off by default; off restores the deterministic map.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { InfoGlyph } from '../map/Glyph';
import { ConsentDialog } from './ConsentDialog';
import { useStructure } from './useStructure';
import './ai.css';

export type AiSource = { live: true } | { overlay: LabelOverlay };

interface Props {
  g: SessionGraph;
  source: AiSource;
  onOverlay(overlay: LabelOverlay | undefined): void;
  announce(text: string): void;
}

export default function AiControl({ g, source, onOverlay, announce }: Props) {
  return 'overlay' in source ? <Toggle overlay={source.overlay} onOverlay={onOverlay} /> : <Live g={g} onOverlay={onOverlay} announce={announce} />;
}

function Toggle({ overlay, onOverlay, initial = false, focusRef }: { overlay: LabelOverlay; onOverlay: Props['onOverlay']; initial?: boolean; focusRef?: RefObject<HTMLButtonElement | null> }) {
  const [on, setOn] = useState(initial);
  // Shown on arrival when the user just asked for it (website); off by default otherwise (the viewer, DM34).
  useEffect(() => {
    if (initial) onOverlay(overlay);
  }, [initial, overlay, onOverlay]);
  const flip = () => {
    setOn(!on);
    onOverlay(on ? undefined : overlay);
  };
  return (
    <span className="ai-control">
      <button ref={focusRef} type="button" className="ai-button" aria-pressed={on} onClick={flip}>AI labels (suggested)</button>
      {on && <span className="ai-key"><span className="ai-tag ai-swatch" aria-hidden="true" /> dashed = suggested by {overlay.model}</span>}
    </span>
  );
}

function Live({ g, onOverlay, announce }: Omit<Props, 'source'>) {
  const ai = useStructure(g);
  const { state } = ai;
  const button = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const said = useRef('');
  // The user asked by activating the MapView placeholder that loaded this chunk: open the consent dialog once.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    ai.request();
  }, [ai]);
  useEffect(() => {
    const say = state.status === 'sending' ? 'Asking a model for AI labels' : state.status === 'ready' ? 'AI labels added' : state.status === 'unavailable' || state.status === 'error' ? state.message : '';
    if (say && say !== said.current) announce(say);
    said.current = say;
  }, [state, announce]);
  // The element focus came from (the placeholder, the dialog, Cancel) is gone after each step: focus this state's control.
  const last = useRef('');
  useEffect(() => {
    if (last.current === state.status) return;
    last.current = state.status;
    if (!document.activeElement || document.activeElement === document.body) (button.current ?? status.current)?.focus();
  });

  if (state.status === 'ready') return <Toggle overlay={state.overlay} onOverlay={onOverlay} initial focusRef={button} />;
  if (state.status === 'sending') {
    return (
      <span className="ai-control">
        <span className="ai-status"><span className="ai-tag ai-swatch" aria-hidden="true" /> Labelling {Math.min(state.done + 1, state.total)} of {state.total}…</span>
        <button ref={button} type="button" className="ai-button" onClick={ai.cancel}>Cancel</button>
      </span>
    );
  }
  const note = state.status === 'unavailable' || state.status === 'error' ? state.message : '';
  return (
    <span className="ai-control">
      {note ? <span ref={status} tabIndex={-1} className="ai-status" data-ai-note={state.status}><InfoGlyph />{note}</span> : null}
      {state.status !== 'unavailable' && (
        <button ref={button} type="button" className="ai-button" aria-haspopup="dialog" onClick={() => ai.request()}>
          {state.status === 'error' ? 'Try again' : 'AI labels…'}
        </button>
      )}
      {state.status === 'consent-needed' && (
        <ConsentDialog summary={state.summary} onSend={() => void ai.consent()} onCancel={ai.cancel} />
      )}
    </span>
  );
}
