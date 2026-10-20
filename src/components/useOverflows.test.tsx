// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOverflows } from './useOverflows';

function Scroller() {
  const [ref, overflows] = useOverflows<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="scroller" role="region" aria-label="Scroller" tabIndex={overflows ? 0 : undefined}>
      <svg />
    </div>
  );
}

/** No layout in the test DOM; stub the two widths the hook reads. */
function setWidths(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useOverflows', () => {
  it('is a tab stop only while the content is wider than the box, re-checked by ResizeObserver', () => {
    let notify = () => {};
    const observed: Element[] = [];
    const disconnect = vi.fn<() => void>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect = disconnect;
      },
    );
    setWidths(800, 1000);
    const { unmount } = render(<Scroller />);
    const el = screen.getByTestId('scroller');
    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(observed).toEqual([el, el.firstElementChild]);

    setWidths(800, 390);
    act(() => notify());
    expect(el.getAttribute('tabindex')).toBe('0');

    setWidths(800, 1000);
    act(() => notify());
    expect(el.hasAttribute('tabindex')).toBe(false);

    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('falls back to window resize without ResizeObserver and removes the listener on unmount', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    setWidths(800, 1000);
    const { unmount } = render(<Scroller />);
    const el = screen.getByTestId('scroller');
    setWidths(800, 390);
    act(() => void window.dispatchEvent(new Event('resize')));
    expect(el.getAttribute('tabindex')).toBe('0');

    const remove = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
