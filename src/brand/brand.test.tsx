// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { LogoMark } from './LogoMark';
import { Wordmark } from './Wordmark';

afterEach(cleanup);

describe('LogoMark (v7 §3.4)', () => {
  it('draws the blue and orange halves and the vein in the page colour, hidden from assistive tech', () => {
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const [blue, orange, vein] = [...svg.querySelectorAll('path')];
    expect([blue?.getAttribute('d'), blue?.getAttribute('fill')]).toEqual(['M6 58C6 28 28 6 58 6Z', '#0090ff']);
    expect([orange?.getAttribute('d'), orange?.getAttribute('fill')]).toEqual(['M6 58C36 58 58 36 58 6Z', '#f76b15']);
    expect(vein?.getAttribute('stroke')).toBe('var(--slate-1)');
    expect(vein?.getAttribute('fill')).toBe('none');
    expect(vein?.getAttribute('stroke-width')).toBe('2.8');
  });
});

describe('Wordmark', () => {
  it('is the mark and the name, with no byline', () => {
    const { container } = render(<Wordmark />);
    expect(container.textContent).toBe('Reasontrail');
    expect(container.querySelector('.wordmark > svg.logo-mark')).not.toBeNull();
  });
});
