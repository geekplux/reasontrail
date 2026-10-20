// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from './App';

afterEach(cleanup);

describe('App', () => {
  it('renders the prompt and the root five branches with test hooks', () => {
    const { container } = render(<App />);
    expect(screen.getByText('The old lighthouse keeper opened the door and')).toBeTruthy();
    const svg = container.querySelector('[data-testid="garden"]');
    expect(svg?.getAttribute('data-ready')).toBe('true');
    expect(svg?.getAttribute('aria-label')).toMatch(/Garden of next-token choices/);

    const root = [...container.querySelectorAll('g[data-depth="1"]')];
    expect(root.map((g) => g.querySelector('text')?.textContent)).toEqual([
      ' looked',
      ' entered',
      ' turned',
      ' the',
      ' stood',
    ]);
    const ps = root.map((g) => Number(g.getAttribute('data-p')));
    expect([...ps].sort((a, b) => b - a)).toEqual(ps);
    const widths = root.map((g) => Number(g.querySelector('[data-role="branch-stroke"]')?.getAttribute('stroke-width')));
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeLessThan(widths[i - 1]!);
    expect(root[0]?.getAttribute('data-state')).toBe('expanded');
    expect(root[0]?.querySelector('title')?.textContent).toBe('“ looked” 8.9%');
    expect(svg?.getAttribute('aria-label')).toContain('“ looked” 8.9%'); // same token form as the tooltip
  });

  it('frames the garden with the shell: wordmark header, specimen label, footer', () => {
    render(<App />);
    expect(screen.getByRole('banner').textContent).toBe('token-garden');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The lighthouse keeper');
    const specimen = screen.getByRole('region', { name: 'The lighthouse keeper' });
    expect(specimen.textContent).toContain('SmolLM2-135M (q8)');
    expect(specimen.textContent).toContain('k = 5');
    expect(specimen.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-19');
    expect(screen.getByRole('region', { name: 'Garden drawing' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('contentinfo').textContent).toContain('nothing you do with samples leaves your browser');
  });
});
