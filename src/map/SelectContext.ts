// How the glance rows, "Where it got stuck" and the destination link to the detail panel (DESIGN §10.3): each target is
// a real link (`?step=` / `#step=`) that the map intercepts to select it. Absent outside the map (the outline).
import { createContext, useContext, type MouseEvent } from 'react';

export interface Selector {
  /** Open the details of a map item (`ep:…`, `blaze:…`, `files`), optionally on one step. */
  select(item: string, step?: string): void;
  /** The item that holds a step (for links to a step); `raw` opens its raw record too. */
  selectStep(stepId: string, raw?: boolean): void;
  /** `?step=…` or `#step=…` for a step. */
  href(stepId?: string): string;
}

export const SelectContext = createContext<Selector | null>(null);
export const useSelector = () => useContext(SelectContext);

/** Click handler for a link that selects in place (a modified click still opens the link). */
export const selectOnClick = (run: () => void) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  run();
};
