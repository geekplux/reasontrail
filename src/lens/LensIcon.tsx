/**
 * The lens icon: the original seed-and-fork mark, kept for the zoom-in lens. A seed, a stem, and a
 * fork into three branches whose stroke widths (4, 2.5, 1.25) are the lens's own encoding: thicker = more likely.
 */
export const MARK_BRANCHES = [
  { d: 'M12 16C18 16 18 7 24.5 7', width: 4, node: [26.5, 7, 2.25] },
  { d: 'M12 16H24.5', width: 2.5, node: [26.5, 16, 1.75] },
  { d: 'M12 16C18 16 18 25 24.5 25', width: 1.25, node: [26.5, 25, 1.4] },
] as const;

export function LensIcon({ className = 'lens-icon', title }: { className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: false })}
    >
      <circle cx={5} cy={16} r={3} fill="currentColor" stroke="none" />
      <path d="M5 16H12" strokeWidth={4} />
      {MARK_BRANCHES.map(({ d, width, node: [cx, cy, r] }) => (
        <g key={d}>
          <path d={d} strokeWidth={width} />
          <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
        </g>
      ))}
    </svg>
  );
}
