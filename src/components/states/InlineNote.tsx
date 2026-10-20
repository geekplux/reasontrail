import type { ReactNode } from 'react';

export type NoteVariant = 'info' | 'not-recorded' | 'error';

/** Each variant has its own glyph, so the kind of note never depends on colour (PLAN §3.6). */
const GLYPH: Record<NoteVariant, string> = { info: 'i', 'not-recorded': '○', error: '!' };

/** A calm, short note: glyph + text, announced politely when it appears. */
export function InlineNote({ variant, children, className }: { variant: NoteVariant; children: ReactNode; className?: string }) {
  return (
    <p role="status" className={className ? `inline-note ${className}` : 'inline-note'} data-variant={variant}>
      <span className="inline-note-glyph" aria-hidden="true">
        {GLYPH[variant]}
      </span>
      {children}
    </p>
  );
}
