// Reasontrail logo, round 2: abstract and in colour. Colours are Radix blue-9 and orange-9 (the same value in light and
// dark) plus slate-12 for ink, so the mark keeps its contrast on both themes and never relies on hue alone: each part
// also differs in lightness and shape.
const C = { blue: '#0090ff', orange: '#f76b15', amber: '#ffc53d', ink: 'var(--ink)' };
// A tapered blade: wide at the base, pointed at the tip, bent by `bend` (positive bends left of travel).
function blade(x, y, deg, L, w, bend = 0, fill = C.ink, extra = '') {
  const b = bend;
  return `<path d="M0 ${-w / 2}C${L * 0.35} ${-w / 2 - b * 0.6} ${L * 0.75} ${-b} ${L} ${-b * 0.9}C${L * 0.75} ${-b + w * 0.12} ${L * 0.35} ${w / 2 - b * 0.4} 0 ${w / 2}Z" transform="translate(${x} ${y}) rotate(${deg})" fill="${fill}"${extra}/>`;
}
const leaf = (x, y, deg, L, w, fill, extra = '') => `<path d="M0 0C${L * 0.25} ${-w * 0.66} ${L * 0.7} ${-w * 0.62} ${L} 0C${L * 0.7} ${w * 0.62} ${L * 0.25} ${w * 0.66} 0 0Z" transform="translate(${x} ${y}) rotate(${deg})" fill="${fill}"${extra}/>`;
const mul = ' style="mix-blend-mode: var(--blend)"';
export const LOGOS2 = {
  // A. Fan: three blades leave one root at different angles and lengths, like the session forking into subagents.
  fan: blade(6, 56, -18, 54, 13, 4, C.blue, mul) + blade(6, 56, -52, 46, 12, 5, C.orange, mul) + blade(6, 56, -80, 34, 10, 3, C.ink, mul),
  // B. Sprout: three leaves from one point, overlapping where the work overlaps. Each tool call is a leaf.
  sprout: leaf(32, 60, -90, 56, 26, C.blue, mul) + leaf(32, 60, -128, 44, 24, C.orange, mul) + leaf(32, 60, -52, 40, 22, C.ink, mul),
  // C. Rings: growth rings around the root in the corner; time spreads outward, the last ring is the answer.
  rings: `<path d="M4 4A56 56 0 0 1 60 60" fill="none" stroke="${C.blue}" stroke-width="10"/><path d="M4 20A40 40 0 0 1 44 60" fill="none" stroke="${C.orange}" stroke-width="10"/><path d="M4 36A24 24 0 0 1 28 60" fill="none" stroke="var(--ink)" stroke-width="10"/><circle cx="8" cy="56" r="5" fill="var(--ink)"/>`,
  // D. Split: one ink stroke rises and splits, the blue limb runs on, the orange limb curls back: a fork and a return.
  split: `<path d="M18 62C20 46 24 36 32 28" fill="none" stroke="var(--ink)" stroke-width="9" stroke-linecap="round"/><path d="M32 28C38 22 46 14 58 6" fill="none" stroke="${C.blue}" stroke-width="9" stroke-linecap="round"${mul}/><path d="M32 28C26 20 16 16 8 20C2 23 4 32 12 32" fill="none" stroke="${C.orange}" stroke-width="9" stroke-linecap="round"${mul}/>`,
};
export const logo2 = (k, size = 20, cls = 'logo') => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${LOGOS2[k]}</svg>`;

// Round 2b.
// E. Strands: five strands run together as one trunk, then part: two rise (blue), one runs on (ink), two fall
// (orange). Leonardo's rule drawn literally: a branch is the strands that leave the trunk.
{
  const strands = [];
  const ys = [-6.4, -3.2, 0, 3.2, 6.4];
  const ends = [[58, 8], [54, 16], [60, 32], [54, 48], [58, 56]];
  const col = [C.blue, C.blue, 'var(--ink)', C.orange, C.orange];
  ys.forEach((dy, i) => {
    const [ex, ey] = ends[i];
    strands.push(`<path d="M4 ${32 + dy}H20C30 ${32 + dy} ${36 + Math.abs(dy) * 0.4} ${32 + dy * 1.6} ${(ex + 30) / 2} ${(ey + 32 + dy) / 2}S${ex - 4} ${ey} ${ex} ${ey}" fill="none" stroke="${col[i]}" stroke-width="${[2.4, 2.8, 3.6, 2.8, 2.4][i]}" stroke-linecap="round"/>`);
  });
  LOGOS2.strands = strands.join('');
}
// F. Veined leaf: one leaf, two colours, its vein a branching tree cut out of it. A tool call that holds the whole trail.
LOGOS2.vein = `<path d="M6 58C6 28 28 6 58 6Z" fill="${C.blue}"/><path d="M6 58C36 58 58 36 58 6Z" fill="${C.orange}"/><path d="M8 56L56 8M20 44C17 38 16 31 17 25M31 33C37 35 43 35 49 33M41 23C39 19 39 15 40 11" fill="none" stroke="var(--bg)" stroke-width="2.8" stroke-linecap="round"/>`;
// G. Canopy: a short dark trunk under three overlapping crowns, sized by the work each carried.
LOGOS2.canopy = `<path d="M26 62C27 52 28 46 30 40h4C35 46 36 52 38 62Z" fill="var(--ink)"/><circle cx="22" cy="30" r="16" fill="${C.orange}"${mul}/><circle cx="40" cy="24" r="20" fill="${C.blue}"${mul}/><circle cx="34" cy="42" r="9" fill="var(--ink)"${mul}/>`;

// H. Leaf trail: four leaves along an unseen path, each larger than the last, ink to orange to blue: a session's steps
// growing into an answer.
LOGOS2.trail = leaf(4, 58, -30, 14, 8, 'var(--ink)') + leaf(16, 46, -75, 18, 10, C.orange) + leaf(26, 34, -20, 22, 12, C.orange) + leaf(36, 26, -62, 28, 15, C.blue);
