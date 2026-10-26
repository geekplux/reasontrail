// The home's hero tree (v7 §4.3, docs/design/v7/preview/Home.html): the sample's tree at the full content width with
// the legend inside the figure, top right. 1200 × 520 at desktop; it measures its width, keeps the legend's corner
// free and, below 960px, draws the bare silhouette (no text) at the phone's proportions. On the phone the legend goes
// under the sample tabs instead (`legend={false}`; Home draws it there). A session page (`fit`) trims the box to the
// drawing (at least 240px) and lists only the legend entries its tree draws.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { TreeLegend } from '../map/tree/TreeLegend';
import { legendKeys } from '../map/tree/view';
import { TreeView, type TreeViewProps } from '../map/tree/TreeView';
import type { Box, HitTarget } from '../map/tree/types';

const DESKTOP = { width: 1200, height: 520 };
/** Narrower than this, the tree drops its text and keeps the phone silhouette's 358 × 190 proportions. */
const LABELS_FROM = 960;

interface Measure { width: number; reserve: Box[] }

/** `onPick` also says whether the tree has its text (desktop) or is the bare silhouette (phone). `size`: another
 * height and text threshold than the home's (How to read a map's smaller figure). */
export function HeroTree({ id, g, hover, onHover, onPick, legend = true, size, fit = false, ...pick }: { id: string; g: SessionGraph | null; hover?: string | undefined; onHover(episodeId: string | undefined): void; onPick?(hit: HitTarget, labels: boolean): void; legend?: boolean; size?: { height: number; labelsFrom: number }; fit?: boolean } & Pick<TreeViewProps, 'selected' | 'callout' | 'tagged'>) {
  const fig = useRef<HTMLElement>(null);
  // The canvas size until measured (and where nothing is laid out, as in tests): no jump on the first desktop paint.
  const [m, setM] = useState<Measure>({ width: DESKTOP.width, reserve: [] });
  useLayoutEffect(() => {
    const el = fig.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const lg = el.querySelector<HTMLElement>('.legend');
      // The legend overlays the tree only where it is absolutely placed (desktop); its box plus 8px is kept free.
      const over = lg && getComputedStyle(lg).position === 'absolute' && lg.offsetWidth > 0;
      const reserve = over ? [{ x0: width - lg.offsetWidth - 8, y0: 0, x1: width, y1: lg.offsetHeight + 8 }] : [];
      setM((was) => (was.width === width && JSON.stringify(was.reserve) === JSON.stringify(reserve) ? was : { width, reserve }));
    };
    measure();
    // The legend's width changes when the web font arrives: measure again then, so the layout does not depend on
    // when it loaded.
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    if (typeof ResizeObserver === 'undefined') return () => { live = false; };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const lg = el.querySelector('.legend');
    if (lg) ro.observe(lg);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, []);
  const only = useMemo(() => (fit && g ? legendKeys(g) : undefined), [fit, g]);
  const labels = m.width >= (size?.labelsFrom ?? LABELS_FROM);
  const height = labels ? (size?.height ?? DESKTOP.height) : Math.round((m.width * 190) / 358);
  return (
    <figure className={fit ? 'hero-tree fit' : 'hero-tree'} id={id} ref={fig}>
      {legend && <TreeLegend {...(only ? { only } : {})} />}
      <div className="tree-wrap" aria-busy={g ? undefined : true}>
        {g && <TreeView g={g} width={m.width} height={height} labels={labels} reserve={m.reserve} fit={fit && labels} hover={hover} onHover={onHover} {...pick} {...(onPick ? { onPick: (h: HitTarget) => onPick(h, labels) } : {})} />}
      </div>
    </figure>
  );
}
