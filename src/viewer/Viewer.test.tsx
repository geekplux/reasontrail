// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { parseSession } from '../../shared/session/adapter';
import type { LabelOverlay, SessionGraph } from '../../shared/session/types';
import { loadGraph } from '../map/loadGraph';
import { defaultSessionGraph } from '../sessions/samples';
import { MAKER_URL, SITE_URL, Viewer, readStep } from './Viewer';

import basic from '../../fixtures/sessions/claude-code/basic.jsonl?raw';

const page = (graph: SessionGraph, meta: Record<string, unknown> = {}, labels?: LabelOverlay) => loadGraph(JSON.stringify({ graph, meta: { version: '0.1.0', ...meta }, ...(labels ? { labels } : {}) }));
const user = () => parseSession({ files: [{ path: 'basic.jsonl', text: basic }] });
const panel = () => document.querySelector<HTMLElement>('aside.detail');

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('local viewer', () => {
  it('draws the tree, the git-style list and the outcome under a wordmark-only header, with no old map', () => {
    const { container } = render(<Viewer loaded={page(defaultSessionGraph)} />);
    expect(container.querySelector('header.bar')?.textContent).toBe('Reasontrail');
    expect(container.querySelector('.hero-tree svg[role="img"]')?.getAttribute('aria-label')).toContain('Verify phase 12 (failed: 1 gap)');
    expect(container.querySelector('.hero-tree > .legend')).not.toBeNull();
    expect(screen.getByRole('tree', { name: 'Episodes in order' }).querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(3);
    expect(screen.getByRole('complementary', { name: 'Outcome' }).querySelectorAll('.res-row').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Verify phase 12, fix the audit gap, re-verify');
    expect(container.querySelector('[data-region], [role="application"], [role="tablist"], [role="tabpanel"]')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reasoning map');
  });

  it('shows a user session without the Sample tag, and Details and Share but no AI titles without labels in the page', () => {
    const { container } = render(<Viewer loaded={page(user())} />);
    expect(container.querySelector('.meta .tag')).toBeNull();
    expect(container.textContent).not.toContain('Sample');
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toContain('Details');
    expect(names).toContain('Share');
    expect(names).not.toContain('AI titles');
  });

  it('turns AI titles on and off when the page has them (`--ai`)', () => {
    const g = user();
    const labels: LabelOverlay = { model: 'test-model', createdAt: '', labels: [{ stepId: g.steps[0]!.id, label: 'plan', confidence: 0.9 }], links: [] };
    render(<Viewer loaded={page(g, {}, labels)} />);
    const ai = screen.getByRole('button', { name: 'AI titles' });
    expect(ai.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(ai);
    expect(ai.getAttribute('aria-pressed')).toBe('true');
  });

  it('ends with two plain links: Made with Reasontrail and geekplux.com', () => {
    render(<Viewer loaded={page(user())} />);
    const links = [...document.querySelectorAll('footer a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([['Made with Reasontrail', SITE_URL], ['geekplux.com', MAKER_URL]]);
  });

  it('keeps the selected step in the hash: a deep link opens it, a list pick writes it, Esc and Back close it', () => {
    expect(readStep('#step=s41')).toBe('s41');
    expect(readStep('#a=1&step=s%2041')).toBe('s 41');
    expect(readStep('#steps=s41')).toBeNull();
    window.history.replaceState(null, '', '/map.html#step=s41');
    render(<Viewer loaded={page(defaultSessionGraph)} />);
    expect(panel()?.getAttribute('data-step')).toBe('s41');
    expect(document.querySelector('.hero-tree circle.ring')).not.toBeNull();
    fireEvent.keyDown(panel()!.querySelector('h3')!, { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/map.html');
    // A step row in the open episode: Enter selects it and writes the hash.
    const step = document.querySelector<HTMLElement>('[data-row^="step:"]')!;
    fireEvent.keyDown(step, { key: 'Enter' });
    const id = step.getAttribute('data-row')!.slice('step:'.length);
    expect(window.location.hash).toBe(`#step=${id}`);
    expect(panel()?.getAttribute('data-step')).toBe(id);
    // Back (or a hash edited by hand) closes it again.
    act(() => {
      window.history.replaceState(null, '', '/map.html');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(panel()).toBeNull();
  });

  it('marks a shared copy in the meta line, where a sample has its tag', () => {
    render(<Viewer loaded={page(user(), { shared: { replaced: 4 } })} />);
    expect(document.querySelector('.meta .tag')?.textContent).toBe('Shared copy, redacted (4 items replaced)');
  });

  it('shows text, never markup, from the transcript; and a calm message for bad data', () => {
    const g = user();
    g.title = '</script><script>alert(1)</script>';
    const { container } = render(<Viewer loaded={page(g)} />);
    expect(container.querySelector('main script')).toBeNull();
    expect(container.textContent).toContain('</script><script>alert(1)</script>');
    cleanup();
    render(<Viewer loaded={loadGraph('{')} />);
    expect(screen.getByText('The session data in this page could not be read.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reasoning map');
  });
});
