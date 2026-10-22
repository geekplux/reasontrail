// "Zoom into this sentence" (DESIGN §13.5, PLAN Z1): on an assistant's text in the detail panel, each sentence worth
// zooming into is a focusable chip (dotted underline on hover and focus, Enter or a click selects it), and one quiet
// button with the lens icon opens the lens on the selected one. Recorded sentences carry the lens mark and say they
// work offline; the others say they grow live after an opt-in. Nothing is fetched here.
import { useContext, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { LensIcon } from './LensIcon';
import { findLensSample } from './lensSamples';
import { LensContext } from './lensTarget';
import { openingWords, splitSentences } from './sentences';

/** The text with its sentences as chips, and the zoom button; null where the lens isn't offered. */
export function useLensSentences(text: string, stepId: string | null, where: string, onReveal: (chip: HTMLElement) => void): { content: ReactNode; action: ReactNode } | null {
  const lens = useContext(LensContext);
  const sentences = useMemo(() => (lens && stepId ? splitSentences(text) : []), [lens, stepId, text]);
  const recorded = useMemo(
    () => sentences.map((s) => (s.zoomable && lens?.sampleId && stepId ? findLensSample(lens.sampleId, stepId, s.text) : undefined)),
    [sentences, lens, stepId],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const chips = useRef(new Map<number, HTMLElement>());
  const noteId = useId();
  if (!lens || !stepId || !sentences.some((s) => s.zoomable)) return null;
  // The first sentence is picked until the reader picks another: always one they can see, even in a clamped text.
  const at = picked ?? sentences.findIndex((s) => s.zoomable);
  const sentence = sentences[at]!;
  const rec = recorded[at];

  const parts: ReactNode[] = [];
  let pos = 0;
  sentences.forEach((s, i) => {
    if (s.start > pos) parts.push(text.slice(pos, s.start));
    pos = s.end;
    if (!s.zoomable) return parts.push(s.text);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      setPicked(i);
    };
    parts.push(
      <span
        key={i}
        ref={(el) => void (el ? chips.current.set(i, el) : chips.current.delete(i))}
        className="lens-sentence"
        role="button"
        tabIndex={0}
        aria-pressed={i === at}
        onClick={() => setPicked(i)}
        onKeyDown={onKeyDown}
        onFocus={(e) => onReveal(e.currentTarget)}
      >
        {s.text}
        {recorded[i] && (
          <>
            <LensIcon className="lens-mark" />
            <span className="visually-hidden"> (recorded, works offline)</span>
          </>
        )}
      </span>,
    );
  });
  if (pos < text.length) parts.push(text.slice(pos));

  const zoom = () =>
    lens.open({
      sentence: sentence.text,
      prompt: openingWords(sentence.text),
      stepId,
      where,
      sampleTitle: lens.sampleTitle,
      recorded: rec,
      from: chips.current.get(at)?.getBoundingClientRect(),
    });
  return {
    content: parts,
    action: (
      <p className="lens-action">
        <button type="button" className="lens-link" aria-describedby={noteId} onClick={zoom}>
          <LensIcon />
          Zoom into this sentence
        </button>
        <span id={noteId} className="muted">{rec ? 'Recorded · works offline' : 'Not recorded · grows live if you opt in'}</span>
      </p>
    ),
  };
}
