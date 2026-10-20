import type { ReactNode } from 'react';
import { MARKER_R } from '../../garden/metrics';

export type NoteVariant = 'info' | 'not-recorded' | 'error';

/** Each variant has its own glyph, so the kind of note never depends on colour (PLAN §3.6). */
const GLYPH: Record<NoteVariant, ReactNode> = {
  info: 'i',
  // The hollow r 4 ring of a not-recorded branch tip.
  'not-recorded': (
    <svg width={12} height={12} viewBox="-6 -6 12 12" className="inline-note-ring">
      <circle r={MARKER_R} />
    </svg>
  ),
  error: '!',
};

/** A calm, short note: glyph + text, announced politely when it appears. `as="span"` for use inside a paragraph. */
export function InlineNote({ variant, children, className, as: Tag = 'p' }: { variant: NoteVariant; children: ReactNode; className?: string; as?: 'p' | 'span' }) {
  return (
    <Tag role="status" className={className ? `inline-note ${className}` : 'inline-note'} data-variant={variant}>
      <span className="inline-note-glyph" aria-hidden="true">
        {GLYPH[variant]}
      </span>
      {children}
    </Tag>
  );
}
