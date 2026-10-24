/**
 * The Reasontrail mark, "veined leaf" (docs/design/v7/PROMPT.md §3.4): a leaf split along its midrib into a blue half
 * and an orange half (Radix blue-9 and orange-9, the same in light and dark), with a branching vein cut out of it in
 * the page background (`--slate-1`), so it adapts to the theme. Each tool call is a leaf; the leaf holds the trail.
 * public/favicon.svg and public/logo.svg carry the same geometry; keep them in sync.
 */
export const LEAF = {
  blue: { d: 'M6 58C6 28 28 6 58 6Z', fill: '#0090ff' },
  orange: { d: 'M6 58C36 58 58 36 58 6Z', fill: '#f76b15' },
  vein: 'M8 56L56 8M20 44C17 38 16 31 17 25M31 33C37 35 43 35 49 33M41 23C39 19 39 15 40 11',
  veinWidth: 2.8,
} as const;

/** TEMPORARY: the pre-v7 trail mark, still drawn by the share card (src/share/exportCard.ts) until its restyle. */
export const TRAIL_MARK = {
  route: 'M4.5 20 H11 L19 12 H22',
  spur: 'M11 20 H19.5',
  bar: 'M21.5 16.5 V23.5',
} as const;

export function LogoMark({ className = 'logo-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={LEAF.blue.d} fill={LEAF.blue.fill} />
      <path d={LEAF.orange.d} fill={LEAF.orange.fill} />
      <path d={LEAF.vein} fill="none" stroke="var(--slate-1)" strokeWidth={LEAF.veinWidth} strokeLinecap="round" />
    </svg>
  );
}
