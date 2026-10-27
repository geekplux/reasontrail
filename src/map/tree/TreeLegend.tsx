// The tree's legend (as on the design canvas), 12px: the five episode glyphs, then the twigs (command with its
// leaf, thinking, failed with ✕) and what width means. Thinking is slate-9 like the tree's thinking twigs. `only`: the
// entries to show (an opened session lists only what its tree draws); the home shows them all, as the canvas does.
import type { ReactNode } from 'react';
import { KindGlyph } from '../gitlist/marks';
import type { GlyphKind } from '../gitlist/rows';
import type { LegendKey } from './view';

const KINDS: [GlyphKind, string][] = [['discuss', 'Task'], ['explore', 'Explore'], ['change', 'Change'], ['verify', 'Verify'], ['answer', 'Answer']];
const mark = (w: number, children: ReactNode) => <svg className="g" width={w} height="12" viewBox={`0 0 ${w} 12`} aria-hidden="true" focusable="false">{children}</svg>;
const TWIGS: [LegendKey, ReactNode, string][] = [
  ['command', mark(14, <><path d="M2 10 7 5" fill="none" stroke="var(--slate-12)" strokeWidth="1" /><path d="M0 0Q2.6 -2 5.2 0Q2.6 2 0 0Z" transform="translate(7 5) rotate(-45)" fill="var(--slate-12)" /></>), 'Command'],
  ['thinking', mark(14, <path d="M2 10 5.5 6.5" fill="none" stroke="var(--slate-9)" strokeWidth="1" />), 'Thinking'],
  ['failed', mark(14, <><path d="M2 10 8 4" fill="none" stroke="var(--orange-10)" strokeWidth="1" /><path d="M8 1.5l4 4M12 1.5l-4 4" fill="none" stroke="var(--orange-10)" strokeWidth="1.4" /></>), 'Failed'],
  ['width', mark(18, <path d="M1 3.5 17 5.6v.8L1 8.5z" fill="var(--slate-11)" />), 'Width: tool calls'],
];

export function TreeLegend({ only }: { only?: ReadonlySet<LegendKey> } = {}) {
  const has = (k: LegendKey) => !only || only.has(k);
  const kinds = KINDS.filter(([k]) => has(k));
  const twigs = TWIGS.filter(([k]) => has(k));
  return (
    <p className="legend" aria-hidden="true">
      {kinds.map(([k, name]) => <span key={k}><KindGlyph kind={k} />{name}</span>)}
      {kinds.length > 0 && twigs.length > 0 && <span className="lg-gap" />}
      {twigs.map(([k, glyph, name]) => <span key={k}>{glyph}{name}</span>)}
    </p>
  );
}
