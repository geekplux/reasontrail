// The tree's legend (docs/design/v7/gen7.mjs LEGEND), 12px: the five episode glyphs, then the twigs (command with its
// leaf, thinking, failed with ✕) and what width means. Thinking is slate-9 like the tree's thinking twigs.
import type { ReactNode } from 'react';
import { KindGlyph } from '../gitlist/marks';
import type { GlyphKind } from '../gitlist/rows';

const KINDS: [GlyphKind, string][] = [['discuss', 'Task'], ['explore', 'Explore'], ['change', 'Change'], ['verify', 'Verify'], ['answer', 'Answer']];
const mark = (w: number, children: ReactNode) => <svg className="g" width={w} height="12" viewBox={`0 0 ${w} 12`} aria-hidden="true" focusable="false">{children}</svg>;

export function TreeLegend() {
  return (
    <p className="legend" aria-hidden="true">
      {KINDS.map(([k, name]) => <span key={k}><KindGlyph kind={k} />{name}</span>)}
      <span className="lg-gap" />
      <span>{mark(14, <><path d="M2 10 7 5" fill="none" stroke="var(--slate-12)" strokeWidth="1" /><path d="M0 0Q2.6 -2 5.2 0Q2.6 2 0 0Z" transform="translate(7 5) rotate(-45)" fill="var(--slate-12)" /></>)}Command</span>
      <span>{mark(14, <path d="M2 10 5.5 6.5" fill="none" stroke="var(--slate-9)" strokeWidth="1" />)}Thinking</span>
      <span>{mark(14, <><path d="M2 10 8 4" fill="none" stroke="var(--orange-10)" strokeWidth="1" /><path d="M8 1.5l4 4M12 1.5l-4 4" fill="none" stroke="var(--orange-10)" strokeWidth="1.4" /></>)}Failed</span>
      <span>{mark(18, <path d="M1 3.5 17 5.6v.8L1 8.5z" fill="var(--slate-11)" />)}Width: tool calls</span>
    </p>
  );
}
