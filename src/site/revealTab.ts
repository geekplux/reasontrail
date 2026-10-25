/** Scrolls a sideways-scrolling tab track (the phone's sample tabs) so `tab` shows whole, `pad` px inside the track's
 * edges. Only `scrollLeft` changes, so the page itself never scrolls (unlike `scrollIntoView` on load). */
export function revealTab(track: HTMLElement, tab: HTMLElement, pad = 4) {
  const t = track.getBoundingClientRect();
  const b = tab.getBoundingClientRect();
  if (b.right > t.right - pad) track.scrollLeft += b.right - t.right + pad;
  else if (b.left < t.left + pad) track.scrollLeft -= t.left + pad - b.left;
}
