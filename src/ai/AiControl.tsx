// The route header's quiet "AI labels" control ("AI titles" on the home's session card) (DESIGN §13.6, PLAN phase 21), loaded only when it is first used.
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
  /** The home's session card: the control keeps this one name ("AI titles") in every state, styled by `buttonClass`. */
  label?: string | undefined;
  buttonClass?: string | undefined;
}

export default function AiControl({ g, source, onOverlay, announce, label, buttonClass }: Props) {
  return 'overlay' in source ? <Toggle overlay={source.overlay} onOverlay={onOverlay} label={label} buttonClass={buttonClass} /> : <Live g={g} onOverlay={onOverlay} announce={announce} label={label} buttonClass={buttonClass} />;
}

type Named = Pick<Props, 'label' | 'buttonClass'>;

function Toggle({ overlay, onOverlay, initial = false, focusRef, label, buttonClass }: Named & { overlay: LabelOverlay; onOverlay: Props['onOverlay']; initial?: boolean; focusRef?: RefObject<HTMLButtonElement | null> }) {
  const [on, setOn] = useState(initial);
  // Shown on arrival when the user just asked for it (website); off by default otherwise (the viewer, DM34).
  useEffect(() => {
    if (initial) onOverlay(overlay);
  }, [initial, overlay, onOverlay]);
  const flip = () => {
    setOn(!on);
    onOverlay(on ? undefined : overlay);
  };
  if (label) {
    return (
      <span className="ai-home">
        <button ref={focusRef} type="button" className={buttonClass} aria-pressed={on} onClick={flip}>{label}</button>
      </span>
    );
  }
  return (
    <span className="ai-control">
      {/* One button, so the key never adds a header row: the dashed swatch says what a suggested label looks like. */}
      <button ref={focusRef} type="button" className="ai-button ai-toggle" aria-pressed={on} aria-label={`AI labels, suggested by ${overlay.model}`} onClick={flip}>
        <span className="ai-tag ai-swatch" aria-hidden="true" /> AI labels · suggested by <span className="ai-model">{overlay.model}</span>
      </button>
    </span>
  );
}

function Live({ g, onOverlay, announce, label, buttonClass }: Omit<Props, 'source'>) {
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
      ? (state.total > 1 ? `Labelling ${state.done + 1} of ${state.total}` : 'Asking a model for AI labels')
      : state.status === 'ready' ? 'AI labels added'
      : (state.status === 'unavailable' || state.status === 'error') && document.activeElement !== status.current ? state.message
      : state.status === 'idle' && prev === 'sending' ? 'AI labels cancelled; nothing was kept'
      : '';
    if (say && say !== said.current) announce(say);
    said.current = say;
  }, [state, announce]);

  if (state.status === 'ready') return <Toggle overlay={state.overlay} onOverlay={onOverlay} initial focusRef={button} label={label} buttonClass={buttonClass} />;
  const wrap = label ? 'ai-home' : 'ai-control'; // the home's wrapper keeps the card's 14px type
  if (state.status === 'sending') {
    return (
      <span className={wrap}>
        <span className="ai-status"><span className="ai-tag ai-swatch" aria-hidden="true" /> Labelling {Math.min(state.done + 1, state.total)} of {state.total}…</span>
        <button ref={button} type="button" className="ai-button" onClick={ai.cancel}>Cancel</button>
      </span>
    );
  }
  const note = state.status === 'unavailable' || state.status === 'error' ? state.message : '';
  return (
    <span className={wrap}>
      {note ? <span ref={status} tabIndex={-1} className="ai-status" data-ai-note={state.status}><InfoGlyph />{note}</span> : null}
      {state.status !== 'unavailable' && (
        <button ref={button} type="button" className={label ? buttonClass : 'ai-button'} aria-haspopup="dialog" onClick={() => ai.request()}>
          {label ?? (state.status === 'error' ? 'Try AI labels again' : 'AI labels…')}
        </button>
      )}
      {state.status === 'consent-needed' && (
        <ConsentDialog summary={state.summary} onSend={() => void ai.consent()} onCancel={ai.cancel} />
      )}
    </span>
  );
}
