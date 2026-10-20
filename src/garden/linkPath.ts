import { GAP, STEM, TIP_INSET } from './metrics';

/** Centre y of each stroke in a fork's stacked bundle: strokes in order, each `w` tall, GAP apart, centred on `y`. */
export function bundle(y: number, widths: readonly number[]): number[] {
  const height = widths.reduce((s, w) => s + w, 0) + GAP * Math.max(0, widths.length - 1);
  let top = y - height / 2;
  return widths.map((w) => {
    const centre = top + w / 2;
    top += w + GAP;
    return centre;
  });
}

/** One link: a short straight stem out of the fork, then an S-curve that ends TIP_INSET before the child tip. */
export function linkPath(forkX: number, y0: number, tipX: number, y1: number): string {
  const x0 = forkX + STEM;
  const x1 = tipX - TIP_INSET;
  const m = (x0 + x1) / 2;
  return `M${forkX},${y0} H${x0} C${m},${y0} ${m},${y1} ${x1},${y1}`;
}
