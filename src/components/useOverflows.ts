import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether an element's content is wider than its box (`scrollWidth > clientWidth`), re-checked whenever the
 * element or its first child resizes (window resize where ResizeObserver is missing). Used to make a scroll region
 * a tab stop only when there is something to scroll.
 */
export function useOverflows<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth);
    check();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', check);
      return () => window.removeEventListener('resize', check);
    }
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return [ref, overflows] as const;
}
