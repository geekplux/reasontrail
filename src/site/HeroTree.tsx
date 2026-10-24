// The home's hero tree (v7 §4.3, docs/design/v7/preview/Home.html): the sample's tree at the full content width with
// the legend inside the figure, top right. 1200 × 520 at desktop; it measures its width, keeps the legend's corner
// free and, below 960px, draws the bare silhouette (no text) at the phone's proportions.
import { useLayoutEffect, useRef, useState } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { TreeLegend } from '../map/tree/TreeLegend';
import { TreeView, type TreeViewProps } from '../map/tree/TreeView';
import type { Box } from '../map/tree/types';

const DESKTOP = { width: 1200, height: 520 };
/** Narrower than this, the tree drops its text and keeps the phone silhouette's 358 × 190 proportions. */
const LABELS_FROM = 960;

interface Measure { width: number; reserve: Box[] }

export function HeroTree({ id, g, hover, onHover, ...pick }: { id: string; g: SessionGraph | null; hover?: string | undefined; onHover(episodeId: string | undefined): void } & Pick<TreeViewProps, 'selected' | 'callout' | 'onPick'>) {
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
  const labels = m.width >= LABELS_FROM;
  const height = labels ? DESKTOP.height : Math.round((m.width * 190) / 358);
  return (
    <figure className="hero-tree" id={id} ref={fig}>
      <TreeLegend />
      <div className="tree-wrap" aria-busy={g ? undefined : true}>
        {g && <TreeView g={g} width={m.width} height={height} labels={labels} reserve={m.reserve} hover={hover} onHover={onHover} {...pick} />}
      </div>
    </figure>
  );
}
