// The website's phone layout: up to 639px wide the page follows the 390 canvas.
// home.css uses the same width in its `@media (max-width: 639px)` rules (usePhone.test.tsx checks); the compact list
// follows its `compact` prop, not the viewport.
import { useSyncExternalStore } from 'react';

export const PHONE_MAX = 639;
export const PHONE_QUERY = `(max-width: ${PHONE_MAX}px)`;

// One MediaQueryList for the page, made on first use (not on every render). It is remade only if `matchMedia` itself is
// replaced, which happens in tests that stub it; in a browser it is made once.
let made: { from: typeof matchMedia; list: MediaQueryList } | undefined;
const media = (): MediaQueryList | undefined => {
  if (typeof matchMedia !== 'function') return undefined;
  if (made?.from !== matchMedia) made = { from: matchMedia, list: matchMedia(PHONE_QUERY) };
  return made.list;
};
const subscribe = (cb: () => void) => {
  const m = media();
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
};
const phone = () => media()?.matches ?? false;

/** True while the viewport is phone-wide: the blocks the phone moves (the legend under the tabs, the outcome box above
 * the list, the card's actions under the final answer) follow it; sizes and gaps are CSS. */
export const usePhone = () => useSyncExternalStore(subscribe, phone, () => false);
