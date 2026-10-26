// The v7 glyphs and status icons (docs/design/v7/gen7.mjs): ▶ task, ○ explore, ■ change, ◇ verify, ◉ answer on a
// 12-unit grid, and the verdict icons. Shape carries the meaning; the hue only repeats it. All are decorative.
import type { ReactNode } from 'react';
import type { GlyphKind, VerdictTone } from './rows';

const SHAPE: Record<GlyphKind, ReactNode> = {
  discuss: <path d="M2.5 1.5 10.5 6l-8 4.5z" fill="currentColor" />,
  explore: <circle cx="6" cy="6" r="4.25" fill="var(--bg, none)" stroke="currentColor" strokeWidth="1.5" />,
  change: <rect x="1.75" y="1.75" width="8.5" height="8.5" fill="currentColor" />,
  verify: <path d="M6 1 11 6 6 11 1 6z" fill="var(--bg, none)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  answer: (<><circle cx="6" cy="6" r="4.75" fill="var(--bg, none)" stroke="currentColor" strokeWidth="1.5" /><circle cx="6" cy="6" r="2" fill="currentColor" /></>),
};

/** An episode glyph, `size` px, centred on (x, y) when placed inside an SVG. */
export function KindGlyph({ kind, size = 12, x, y, className = '' }: { kind: GlyphKind; size?: number; x?: number; y?: number; className?: string }) {
  const at = x === undefined || y === undefined ? {} : { x: x - size / 2, y: y - size / 2 };
  return <svg className={`g ${className}`} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false" {...at}>{SHAPE[kind]}</svg>;
}

const svg = (size: number, children: ReactNode) => <svg className="ic" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">{children}</svg>;

/** ⚠ on orange: a failure. */
export const AlertIcon = ({ size = 16 }: { size?: number }) => svg(size, <><path d="M8 1.5 15 14H1z" fill="var(--orange-9)" stroke="var(--orange-9)" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 6v3.5" fill="none" stroke="var(--on-orange-9)" strokeWidth="1.6" strokeLinecap="round" /><circle cx="8" cy="11.6" r="0.95" fill="var(--on-orange-9)" /></>);
/** ✓ on blue: passed. */
export const OkIcon = ({ size = 16 }: { size?: number }) => svg(size, <><circle cx="8" cy="8" r="7" fill="var(--blue-9)" /><path d="m4.75 8.25 2.1 2.1 4.4-4.6" fill="none" stroke="var(--slate-1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>);
/** A dashed ring: no result known. */
export const UnknownIcon = ({ size = 16 }: { size?: number }) => svg(size, <circle cx="8" cy="8" r="6.25" fill="none" stroke="var(--slate-9)" strokeWidth="1.4" strokeDasharray="2 2.2" />);
/** A git commit. */
const CommitIcon = ({ size = 16 }: { size?: number }) => svg(size, <><path d="M1.5 8h3M11.5 8h3" fill="none" stroke="var(--slate-12)" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="3.25" fill="none" stroke="var(--slate-12)" strokeWidth="1.5" /></>);
/** An ink ✓: done, with no verdict. */
const DoneIcon = ({ size = 16 }: { size?: number }) => svg(size, <><circle cx="8" cy="8" r="6.25" fill="none" stroke="var(--slate-12)" strokeWidth="1.4" /><path d="m5 8.25 2 2 4-4.25" fill="none" stroke="var(--slate-12)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>);

export function VerdictIcon({ tone, size = 14 }: { tone: VerdictTone; size?: number }) {
  if (tone === 'fail') return <AlertIcon size={size} />;
  if (tone === 'ok') return <OkIcon size={size} />;
  if (tone === 'commit') return <CommitIcon size={size} />;
  if (tone === 'done') return <DoneIcon size={size} />;
  return <UnknownIcon size={size} />;
}

/** An ink ⓘ: a note. */
export const InfoIcon = ({ size = 14 }: { size?: number }) => svg(size, <><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--slate-11)" strokeWidth="1.4" /><path d="M8 7v4.5" fill="none" stroke="var(--slate-11)" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="4.6" r="0.9" fill="var(--slate-11)" /></>);
