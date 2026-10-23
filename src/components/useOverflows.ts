import { useEffect, useRef, useState } from 'react';

/** Where a sideways-scrolling box is: null when nothing overflows, else at the start, in the middle or at the end. */
export type ScrollPosition = null | 'start' | 'middle' | 'end';

/**
 * Tracks whether an element's content is wider than its box (`scrollWidth > clientWidth`) and where it is scrolled,
 * re-checked on scroll (passive, once per frame) and whenever the element or its first child resizes (window resize
 * where ResizeObserver is missing). Used for the scroll cue and to make a scroll region a tab stop only when it scrolls.
 */
export function useOverflows<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [position, setPosition] = useState<ScrollPosition>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const max = el.scrollWidth - el.clientWidth;
      setPosition(max <= 0 ? null : el.scrollLeft <= 1 ? 'start' : el.scrollLeft >= max - 1 ? 'end' : 'middle');
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    check();
    el.addEventListener('scroll', onScroll, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    if (!observer) window.addEventListener('resize', check);
    for (const target of [el, el.firstElementChild]) if (target) observer?.observe(target);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', check);
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return [ref, position] as const;
}
