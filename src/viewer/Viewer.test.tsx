// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { parseSession } from '../../shared/session/adapter';
import { HONESTY_TEXT } from '../map/HonestyLabel';
import { loadGraph } from '../map/loadGraph';
import { Viewer } from './Viewer';

import basic from '../../fixtures/sessions/claude-code/basic.jsonl?raw';
import trouble from '../../fixtures/sessions/claude-code/trouble.jsonl?raw';

const fixture = (name: 'basic' | 'trouble') => {
  const graph = parseSession({ files: [{ path: `${name}.jsonl`, text: name === 'basic' ? basic : trouble }] });
  return JSON.stringify({ graph, meta: { version: '0.1.0' } });
};

afterEach(cleanup);

describe('local viewer', () => {
  it('renders the four regions as plain document structure with the honesty label in the task card', () => {
    const { container } = render(<Viewer loaded={loadGraph(fixture('trouble'))} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.split(' ·')[0]?.trim())).toEqual(['Task', 'At a glance', 'Route', 'Destination']);
    expect([...container.querySelectorAll('[data-region]')].map((r) => r.getAttribute('data-region'))).toEqual(['task', 'glance', 'route', 'outcome']);
    const task = container.querySelector('[data-region="task"]');
    expect(task?.querySelector('[data-honesty]')?.textContent).toContain(HONESTY_TEXT);
    expect(task?.querySelector('[data-honesty] a')?.textContent).toBe('How to read this map');
    expect(container.querySelector('[role="tree"], [role="treeitem"], [role="grid"], [role="listbox"], [role="menu"]')).toBeNull();
    expect(container.querySelectorAll('[data-trouble-kind]').length).toBeGreaterThan(0);
    expect(screen.getByText('Generated on your machine · nothing was uploaded')).toBeTruthy();
  });

  it('shows an episode\'s steps behind a disclosure button', () => {
    const { container } = render(<Viewer loaded={loadGraph(fixture('basic'))} />);
    const button = screen.getAllByRole('button', { name: /^Steps \(\d+\)$/ })[0] as HTMLElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector(`#${CSS.escape(button.getAttribute('aria-controls') ?? '')} li`)).not.toBeNull();
  });

  it('shows text, never markup, from the transcript; and a calm message for bad data', () => {
    const payload = JSON.parse(fixture('basic'));
    payload.graph.steps[0].text = '</script><script>alert(1)</script>';
    const { container } = render(<Viewer loaded={loadGraph(JSON.stringify(payload))} />);
    expect(container.querySelector('main script')).toBeNull();
    expect(container.textContent).toContain('</script><script>alert(1)</script>');
    cleanup();
    render(<Viewer loaded={loadGraph('{')} />);
    expect(screen.getByText('The session data in this page could not be read.')).toBeTruthy();
  });

  it('marks shared copies in a labelled region, under one page heading', () => {
    const payload = { ...JSON.parse(fixture('basic')), meta: { version: '0.1.0', shared: { replaced: 4 } } };
    render(<Viewer loaded={loadGraph(JSON.stringify(payload))} />);
    expect(screen.getByRole('region', { name: 'Shared copy' }).textContent).toBe('Shared copy · redacted (4 items replaced)');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reasoning map');
    cleanup();
    render(<Viewer loaded={loadGraph('{')} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reasoning map');
  });

  it('shows no "more" button for a one-line request', () => {
    render(<Viewer loaded={loadGraph(fixture('basic'))} />);
    expect(screen.queryByRole('button', { name: 'more' })).toBeNull();
  });

  it('says where skipped lines are behind a native disclosure', () => {
    const { container } = render(<Viewer loaded={loadGraph(fixture('basic'))} />);
    const details = container.querySelector('[data-region="task"] details');
    expect(details?.querySelector('summary')?.textContent).toBe('Show where');
    expect(details?.querySelector('p')?.textContent).toBe('line 36, line 39');
  });
});
