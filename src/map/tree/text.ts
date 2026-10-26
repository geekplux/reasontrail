// Deterministic text widths for label placement (no DOM): Geist's advance widths for printable ASCII at weight 500,
// in hundredths of an em, measured once in Chrome from the self-hosted Geist variable font (canvas measureText at
// 1000px, kerning off; docs/DECISIONS.md 2026-10-24). Weight 400 is ~2.5% narrower and 600 ~2.5% wider on average;
// digits are tabular (`tnum`), so they share one width. Anything else counts as a wide 0.66 em. The result carries a
// 4% margin, so a placed box is never narrower than the rendered text.
const ASCII = [
  24, 23, 36, 52, 64, 81, 65, 19, 29, 29, 43, 56, 21, 42, 21, 49, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 30, 30, 55, 54, 55, 57,
  93, 69, 69, 71, 70, 61, 60, 71, 72, 28, 61, 66, 58, 89, 75, 75, 66, 75, 68, 65, 57, 69, 69, 97, 63, 59, 56, 36, 47, 36, 44, 56,
  26, 57, 61, 56, 61, 58, 41, 61, 59, 26, 28, 61, 28, 89, 59, 59, 61, 61, 39, 54, 41, 59, 56, 83, 61, 55, 55, 40, 27, 40, 52,
];
const WEIGHT = { 400: 0.98, 500: 1, 600: 1.03 } as const;

/** Width in px of `text` set in Geist at `size` px and `weight`. */
export function textWidth(text: string, size: 12 | 14, weight: 400 | 500 | 600): number {
  let em = 0;
  for (const ch of text) em += ASCII[(ch.codePointAt(0) ?? 0) - 32] ?? 66;
  return (em / 100) * size * WEIGHT[weight] * 1.04;
}
