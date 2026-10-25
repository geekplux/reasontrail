// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { revealTab } from './revealTab';

/** An element with a fixed client rect (left, width), horizontally only. */
const at = (left: number, width: number) => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left, right: left + width, top: 0, bottom: 40, width, height: 40, x: left, y: 0, toJSON() {} });
  return el;
};

describe('revealTab', () => {
  it('scrolls a tab cut at the right edge into view, 4px inside the track', () => {
    const track = at(16, 358); // 16..374
    track.scrollLeft = 0;
    revealTab(track, at(463, 252)); // 463..715, the planner-pivot tab on a 390 phone
    expect(track.scrollLeft).toBe(715 - 374 + 4);
  });

  it('scrolls back for a tab cut at the left edge, and leaves a tab in view alone', () => {
    const track = at(16, 358);
    track.scrollLeft = 300;
    revealTab(track, at(-40, 120));
    expect(track.scrollLeft).toBe(300 - (16 + 4 + 40));
    track.scrollLeft = 50;
    revealTab(track, at(100, 120));
    expect(track.scrollLeft).toBe(50);
  });
});
