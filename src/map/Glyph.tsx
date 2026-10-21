// Glyphs for the map and outline (DESIGN §8.2, §8.5, §8.6). Shape carries the meaning; colour only repeats it.
// All are decorative (aria-hidden): the text next to each glyph says the same thing.
import type { ReactNode } from 'react';
import type { Episode, StepStatus, Trouble } from '../../shared/session/types';

function Svg({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg className={`glyph ${className}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const KIND: Record<Episode['kind'], ReactNode> = {
  discuss: <path d="M4 2.5 L13.5 8 L4 13.5 Z" className="g-fill" />,
  explore: <circle cx="8" cy="8" r="5" className="g-line" />,
  change: <rect x="3" y="3" width="10" height="10" className="g-fill" />,
  verify: <path d="M8 2 L14 8 L8 14 L2 8 Z" className="g-line" />,
  delegate: (<><circle cx="8" cy="8" r="6" className="g-fill" /><circle cx="8" cy="8" r="2" className="g-paper" /></>),
  answer: (<><circle cx="8" cy="8" r="5.5" className="g-line" /><circle cx="8" cy="8" r="2" className="g-fill" /></>),
};

export function KindGlyph({ kind }: { kind: Episode['kind'] }) {
  return <Svg className="glyph-kind">{KIND[kind]}</Svg>;
}

/** Thinking with no stored text: a dotted, muted outline square (DESIGN §8.7). */
export function UnstoredGlyph() {
  return <Svg className="glyph-unstored"><rect x="3" y="3" width="10" height="10" className="g-line g-dotted" /></Svg>;
}

export type GlyphStatus = StepStatus | 'unknown';

/** Status glyphs are circles: ✓ ok, ✕ error, ‖ interrupted, hollow for unknown. */
export function StatusGlyph({ status }: { status: GlyphStatus }) {
  return (
    <Svg className={`glyph-status glyph-${status}`}>
      {status === 'ok' && (<><circle cx="8" cy="8" r="7" className="g-ok" /><path d="M4.8 8.2 L7 10.4 L11.2 5.8" className="g-mark" /></>)}
      {status === 'error' && (<><circle cx="8" cy="8" r="7" className="g-bad" /><path d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5" className="g-mark" /></>)}
      {status === 'interrupted' && (<><circle cx="8" cy="8" r="6.2" className="g-muted" /><path d="M6.5 5 V11 M9.5 5 V11" className="g-muted" /></>)}
      {status === 'unknown' && <circle cx="8" cy="8" r="6.2" className="g-muted" />}
    </Svg>
  );
}

const PLATE: Record<Trouble['kind'], string> = {
  'error-streak': 'M3.5 3.5 L7 7 M7 3.5 L3.5 7 M9 9 L12.5 12.5 M12.5 9 L9 12.5',
  retry: 'M12 8.5 A4 4 0 1 1 10.6 5 M11 2.5 V5.3 H8.2',
  revert: 'M5 5.5 H9.5 A3 3 0 0 1 9.5 11.5 H6 M7 3 L4.5 5.5 L7 8',
  rewind: 'M3.5 8 H10.5 M10.5 4 V12',
  interrupt: 'M6 4 V12 M10 4 V12',
  churn: 'M2.5 10.5 L5 5.5 L7.5 10.5 L10 5.5 L12.5 10.5',
};

/** A trouble plate: a square (squares are trouble, circles are status), filled while unresolved. */
export function PlateGlyph({ kind, resolved }: { kind: Trouble['kind']; resolved: boolean }) {
  return (
    <Svg className={`glyph-plate ${resolved ? 'is-resolved' : 'is-open'}`}>
      <rect x="1" y="1" width="14" height="14" rx="2" className="g-plate" />
      <path d={PLATE[kind]} className="g-plate-mark" />
    </Svg>
  );
}

/** A neutral "!" plate for a trouble count whose spots are all resolved: outlined in ink, no trouble colour. */
export function NeutralPlateGlyph() {
  return (
    <Svg className="glyph-plate is-neutral">
      <rect x="1" y="1" width="14" height="14" rx="2" className="g-plate" />
      <path d="M8 4 V9" className="g-plate-mark" />
      <circle cx="8" cy="11.8" r="1" className="g-plate-dot" />
    </Svg>
  );
}

export function InfoGlyph() {
  return (
    <Svg className="glyph-info">
      <circle cx="8" cy="8" r="6.5" className="g-line g-thin" />
      <path d="M8 7 V11.5" className="g-line g-thin" />
      <circle cx="8" cy="4.6" r="0.9" className="g-fill" />
    </Svg>
  );
}
