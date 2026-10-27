// The session card's "AI titles" control, loaded only when it is first used. Website: the
// consent dialog, then "Labelling k of n…" with Cancel, then an on/off toggle, or a calm note. Local viewer (`--ai`):
// the overlay is already in the page, so it is only a toggle. Off by default; off restores the plain map.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { AlertIcon, InfoIcon } from '../map/gitlist/marks';
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

const LABEL = 'AI titles';

export default function AiControl({ g, source, onOverlay, announce }: Props) {
  return 'overlay' in source ? <Toggle overlay={source.overlay} onOverlay={onOverlay} /> : <Live g={g} onOverlay={onOverlay} announce={announce} />;
}

function Toggle({ overlay, onOverlay, initial = false, focusRef }: { overlay: LabelOverlay; onOverlay: Props['onOverlay']; initial?: boolean; focusRef?: RefObject<HTMLButtonElement | null> }) {
  const [on, setOn] = useState(initial);
  // Shown on arrival when the user just asked for it (website); off by default otherwise (the viewer).
  useEffect(() => {
    if (initial) onOverlay(overlay);
  }, [initial, overlay, onOverlay]);
  const flip = () => {
    setOn(!on);
    onOverlay(on ? undefined : overlay);
  };
  return <button ref={focusRef} type="button" className="btn ghost" aria-pressed={on} onClick={flip}>{LABEL}</button>;
}

function Live({ g, onOverlay, announce }: Omit<Props, 'source'>) {
  const ai = useStructure(g);
  const { state } = ai;
  const button = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const said = useRef('');
  // The user asked by activating the card's placeholder button that loaded this chunk: open the consent dialog once.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    ai.request();
  }, [ai]);
  // The element focus came from (the placeholder, the dialog, Cancel) is gone after each step: focus this state's control.
  const last = useRef('');
  useEffect(() => {
    if (last.current === state.status) return;
    last.current = state.status;
    if (!document.activeElement || document.activeElement === document.body) (button.current ?? status.current)?.focus();
  });
  // After the focus move: a note that just took focus is read out already, so it is not announced twice.
  const was = useRef(state.status);
  useEffect(() => {
    const prev = was.current;
    was.current = state.status;
    const say = state.status === 'sending'
      ? (state.total > 1 ? `Labelling ${state.done + 1} of ${state.total}` : 'Asking a model for AI titles')
      : state.status === 'ready' ? 'AI titles added'
      : (state.status === 'unavailable' || state.status === 'error') && document.activeElement !== status.current ? state.message
      : state.status === 'idle' && prev === 'sending' ? 'AI titles cancelled; nothing was kept'
      : '';
    if (say && say !== said.current) announce(say);
    said.current = say;
  }, [state, announce]);

  if (state.status === 'ready') return <Toggle overlay={state.overlay} onOverlay={onOverlay} initial focusRef={button} />;
  if (state.status === 'sending') {
    return (
      <span className="ai-control">
        <span className="ai-status">Labelling {Math.min(state.done + 1, state.total)} of {state.total}…</span>
        <button ref={button} type="button" className="btn ghost" onClick={ai.cancel}>Cancel</button>
      </span>
    );
  }
  const note = state.status === 'unavailable' || state.status === 'error' ? state.message : '';
  return (
    <span className="ai-control">
      {note ? <span ref={status} tabIndex={-1} className="ai-status" data-ai-note={state.status}>{state.status === 'error' ? <AlertIcon size={14} /> : <InfoIcon />}{note}</span> : null}
      {state.status !== 'unavailable' && (
        <button ref={button} type="button" className="btn ghost" aria-haspopup="dialog" onClick={() => ai.request()}>{LABEL}</button>
      )}
      {state.status === 'consent-needed' && (
        <ConsentDialog summary={state.summary} onSend={() => void ai.consent()} onCancel={ai.cancel} />
      )}
    </span>
  );
}
