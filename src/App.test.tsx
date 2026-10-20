// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { SOURCE_URL } from './components/AppShell';
import { buildTree, defaultExpanded } from './garden/buildTree';
import { GardenView } from './garden/GardenView';
import { PathReadout } from './garden/PathReadout';
import { branchWidth, formatValue } from './garden/scales';
import { defaultSample } from './samples';

const garden = buildTree(defaultSample, defaultExpanded(defaultSample));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

/** Renders the app and lets the recorded provider answer (microtasks) and the 100 ms URL debounce run. */
async function renderApp(search = '') {
  window.history.replaceState(null, '', `/${search}`);
  let out!: ReturnType<typeof render>;
  await act(async () => {
    out = render(<App />);
  });
  return out;
}
const settle = () => act(() => new Promise((r) => setTimeout(r, 150)));
const branch = (c: HTMLElement, key: string) => c.querySelector(`g[data-key="${key}"]`)!;

describe('App', () => {
  it('renders the root five branches with test hooks, markers and the remainder', async () => {
    const { container } = await renderApp();
    const svg = container.querySelector('[data-testid="garden"]');
    expect(svg?.getAttribute('data-ready')).toBe('true');
    expect(svg?.getAttribute('aria-label')).toMatch(/^Garden of next-token choices.*“ looked” 8\.9%.*; other tokens 77\.7%\.$/);
    expect(svg?.querySelector('title')).toBeNull();

    const width = (g: Element) => Number(g.querySelector('[data-role="branch-stroke"]')?.getAttribute('stroke-width'));
    const root = [...container.querySelectorAll('g[data-depth="1"]')].sort((a, b) => width(b) - width(a));
    expect(root.map((g) => g.querySelector('text')?.textContent)).toEqual(['·looked', '·entered', '·turned', '·the', '·stood']);
    expect(root.map((g) => g.getAttribute('data-marker'))).toEqual(['knot', 'bud', 'ring', 'ring', 'ring']);
    for (const g of container.querySelectorAll('g[data-key]')) {
      expect(Math.abs(width(g) - branchWidth(Number(g.getAttribute('data-p'))))).toBeLessThan(0.01); // data-p has 4 decimals
    }
    const remainder = container.querySelector('[data-role="remainder"][data-parent=""]');
    expect(remainder?.textContent).toBe('other 77.7%');
    expect(remainder?.getAttribute('pointer-events')).toBe('none');
    expect(remainder?.hasAttribute('tabindex')).toBe(false);
    expect(screen.getByText('Most likely:').parentElement?.textContent).toBe('Most likely: The old lighthouse keeper opened the door and·looked·out path 2.7%');
  });

  it('labels the selected branch without any pointer events, and the readout follows it', () => {
    const { container } = render(<GardenView garden={garden} selectedKey=" looked down" />);
    const g = container.querySelector('g[data-key=" looked down"]');
    const label = container.querySelector('[data-role="value-label"]');
    expect(label?.getAttribute('data-key')).toBe(' looked down');
    expect(label?.textContent).toBe(formatValue({ p: Number(g?.getAttribute('data-p')), pathP: Math.exp(-2.417 - 3.4), depth: 2 }));
    expect([...container.querySelectorAll('.on-path')].map((e) => e.getAttribute('data-key'))).toEqual([' looked down', ' looked']);
    cleanup();
    render(<PathReadout garden={garden} labelledKey=" looked down" />);
    expect(screen.getByText('Reading:').parentElement?.textContent).toBe('Reading: The old lighthouse keeper opened the door and·looked·down path 0.3%');
  });

  it('frames the garden with the shell: wordmark header, specimen label, footer', async () => {
    await renderApp();
    expect(screen.getByRole('link', { name: 'token-garden' }).textContent).toBe('token-garden');
    expect(screen.getByRole('banner').querySelector('a.header-link')?.getAttribute('href')).toBe(SOURCE_URL);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The lighthouse keeper');
    const specimen = screen.getByRole('region', { name: 'The lighthouse keeper' });
    expect(specimen.textContent).toContain('SmolLM2-135M (q8)');
    expect(specimen.textContent).toContain('k = 5');
    expect(specimen.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-19');
    // Nothing overflows without layout (happy-dom), so the scroll region is not a tab stop.
    expect(screen.getByRole('region', { name: 'Garden drawing' }).hasAttribute('tabindex')).toBe(false);
    expect(screen.getByRole('contentinfo').textContent).toContain('nothing you do with samples leaves your browser');
  });

  it('grows and collapses on click through the provider, with no network, and the URL follows the selection', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { container } = await renderApp();
    await act(async () => void fireEvent.click(branch(container, ' entered')));
    expect(branch(container, ' entered').getAttribute('data-state')).toBe('expanded');
    expect(branch(container, ' entered the')).not.toBeNull();
    expect(screen.getByText('Reading:')).not.toBeNull();
    await settle();
    expect(window.location.search).toBe('?path=1');
    await act(async () => void fireEvent.click(branch(container, ' entered')));
    expect(branch(container, ' entered').getAttribute('data-state')).toBe('expandable');
    await act(async () => void fireEvent.click(branch(container, ' turned')));
    expect(container.querySelector('.garden-note')?.textContent).toBe('○Not in this recording.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['?path=1.0', ' entered the', 'expanded', null],
    ['?path=9.9', null, 'expandable', "iPart of this link isn't in the recording."],
    ['?sample=nope&path=1', null, 'expandable', "iThat garden isn't here, so here is “The lighthouse keeper”."],
  ])('restores %s', async (search, selected, entered, notice) => {
    const { container } = await renderApp(search);
    expect(container.querySelector('[data-role="value-label"]')?.getAttribute('data-key') ?? null).toBe(selected);
    expect(branch(container, ' entered').getAttribute('data-state')).toBe(entered);
    expect(container.querySelector('.garden-figure > .inline-note')?.textContent ?? null).toBe(notice);
  });

  it('copies the link, or selects it in a text field when the clipboard is unavailable', async () => {
    await renderApp('?path=1');
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const button = screen.getByRole('button', { name: 'Copy link' });
    await act(async () => void fireEvent.click(button));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByText('Link copied')).not.toBeNull();
    await act(async () => void fireEvent.click(button));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Link to this view' }).value).toBe(window.location.href);
  });
});
