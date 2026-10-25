// The website's phone layout (docs/design/v7/preview/Phone.html): up to 639px wide the page follows the 390 canvas.
// home.css and gitlist.css use the same width in their `@media (max-width: 639px)` rules (usePhone.test.ts checks).
import { useSyncExternalStore } from 'react';

export const PHONE_MAX = 639;
export const PHONE_QUERY = `(max-width: ${PHONE_MAX}px)`;

const media = () => (typeof matchMedia === 'function' ? matchMedia(PHONE_QUERY) : undefined);
const subscribe = (cb: () => void) => {
  const m = media();
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
};
const phone = () => media()?.matches ?? false;

/** True while the viewport is phone-wide: the blocks the phone moves (the legend under the tabs, the outcome box above
 * the list) and the controls it drops (header buttons, the branch) follow it; sizes and gaps are CSS. */
export const usePhone = () => useSyncExternalStore(subscribe, phone, () => false);
