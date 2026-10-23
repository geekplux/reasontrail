/**
 * The Reasontrail mark (DESIGN §4.1): a trailhead dot (the task), a route that turns 45° (the route), a thinner spur
 * that ends in a bar (a dead end) and a destination ring (the outcome). Follows the theme via currentColor.
 * public/favicon.svg and public/logo.svg carry the same geometry; keep them in sync.
 */
export const TRAIL_MARK = {
  route: 'M4.5 20 H11 L19 12 H22',
  spur: 'M11 20 H19.5',
  bar: 'M21.5 16.5 V23.5',
} as const;

/** @deprecated The seed mark lives on as the lens icon; import it from `../lens/LensIcon`. */
export { MARK_BRANCHES } from '../lens/LensIcon';

export function LogoMark({ className = 'logo-mark', title }: { className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: false })}
    >
      <circle cx={4.5} cy={20} r={3.5} fill="currentColor" stroke="none" />
      <path d={TRAIL_MARK.route} strokeWidth={3.5} strokeLinejoin="round" />
      <path d={TRAIL_MARK.spur} strokeWidth={2} />
      <path d={TRAIL_MARK.bar} strokeWidth={2} />
      <circle cx={26.5} cy={12} r={4} strokeWidth={2.5} />
      <circle cx={26.5} cy={12} r={1.5} fill="currentColor" stroke="none" />
    </svg>
  );
}
