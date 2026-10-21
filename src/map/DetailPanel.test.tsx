// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { parseSession } from '../../shared/session/adapter';
import { attachRaw } from '../../shared/session/raw';
import { MapView } from './MapView';
import { RawRecord } from './RawRecord';

import details from '../../fixtures/sessions/claude-code/details.jsonl?raw';

const files = [{ path: 'details.jsonl', text: details }];
const graph = () => attachRaw(parseSession({ files })!, files);

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const openFirst = () => {
  const item = screen.getByRole('application').querySelector<HTMLElement>('[tabindex="0"]') as HTMLElement;
  item.focus();
  fireEvent.keyDown(item, { key: 'Enter' });
  return item;
};
const row = (label: RegExp) => screen.getAllByRole('button').find((b) => b.closest('.step-rows') && label.test(b.textContent ?? '')) as HTMLElement;

describe('detail panel (M3, M9, G1)', () => {
  it('opens on Enter with focus on its title, announces, and writes ?step=', () => {
    render(<MapView graph={graph()} />);
    openFirst();
    const panel = screen.getByTestId('detail-panel');
    expect(panel.getAttribute('role')).toBe('region');
    expect(document.activeElement?.id).toBe(panel.getAttribute('aria-labelledby'));
    expect(screen.getByRole('status').textContent).toMatch(/^Details: /);
    expect(window.location.search).toMatch(/^\?step=s\d+$/);
  });

  it('renders an edit diff and the raw record as text, never as HTML', () => {
    const { container } = render(<MapView graph={graph()} link="hash" />);
    openFirst();
    // The episode with the edit may not be the first: walk the route until the step strip has it.
    for (let i = 0; i < 8 && !row(/Edit/); i++) {
      fireEvent.keyDown(screen.getByTestId('detail-panel'), { key: 'Escape' });
      const next = document.activeElement as HTMLElement;
      fireEvent.keyDown(next, { key: 'ArrowRight' });
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    }
    fireEvent.click(row(/Edit/));
    const del = [...container.querySelectorAll('.diff .d-del')].map((e) => e.textContent);
    const add = [...container.querySelectorAll('.diff .d-add')].map((e) => e.textContent);
    expect(del).toContain('−   // <img src=x onerror=alert(1)> must stay text');
    expect(add).toContain('+   // <img src=x onerror=alert(1)> must stay text; so must </script>');
    fireEvent.click(screen.getByRole('button', { name: 'Show raw' }));
    expect(container.querySelector('.raw-pre')?.textContent).toContain('"name":"Edit"');
    expect(container.querySelector('.detail-panel img, .detail-panel script, .detail-panel b')).toBeNull();
    expect(window.location.hash).toMatch(/^#step=s\d+$/);
  });

  it('moves between steps with arrows on the panel, and Esc returns focus to the map item', () => {
    render(<MapView graph={graph()} />);
    const item = openFirst();
    const title = document.activeElement as HTMLElement;
    const before = screen.getByTestId('detail-panel').querySelector('.step-block')?.getAttribute('data-step');
    fireEvent.keyDown(title, { key: 'ArrowRight' });
    expect(screen.getByTestId('detail-panel').querySelector('.step-block')?.getAttribute('data-step')).not.toBe(before);
    expect(screen.getByRole('status').textContent).toMatch(/^Step 2 of \d+: /);
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(screen.queryByTestId('detail-panel')).toBeNull();
    expect(document.activeElement).toBe(item);
  });

  it('reopens a deep link without moving focus, and shows unstored thinking honestly', () => {
    const g = graph();
    const thinking = g.steps.find((s) => s.kind === 'thinking');
    window.history.replaceState(null, '', `/#step=${thinking?.id}`);
    render(<MapView graph={g} link="hash" />);
    const panel = screen.getByTestId('detail-panel');
    expect(panel.textContent).toContain('thinking (text not stored)');
    expect(panel.querySelector('[data-honesty="detail"]')).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('Back that closes the panel puts focus on its map item; Forward from <body> focuses the title', () => {
    render(<MapView graph={graph()} />);
    const item = openFirst();
    const step = window.location.search;
    window.history.pushState(null, '', '/');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.queryByTestId('detail-panel')).toBeNull();
    expect(document.activeElement).toBe(item);
    (document.activeElement as HTMLElement).blur();
    window.history.pushState(null, '', `/${step}`);
    fireEvent(window, new PopStateEvent('popstate'));
    const panel = screen.getByTestId('detail-panel');
    expect(document.activeElement?.id).toBe(panel.getAttribute('aria-labelledby'));
  });

  it('Esc in the step strip closes the panel and returns focus; Enter on a row announces its position', () => {
    render(<MapView graph={graph()} />);
    const item = openFirst();
    const rows = screen.getAllByRole('button').filter((b) => b.closest('.step-rows'));
    fireEvent.click(rows[1] as HTMLElement);
    expect(screen.getByRole('status').textContent).toMatch(new RegExp(`^Step 2 of ${rows.length}: `));
    (rows[1] as HTMLElement).focus();
    fireEvent.keyDown(rows[1] as HTMLElement, { key: 'Escape' });
    expect(screen.queryByTestId('detail-panel')).toBeNull();
    expect(document.activeElement).toBe(item);
  });
});

describe('RawRecord (DM19)', () => {
  it('says "(redacted)" in the accessible text of every redaction, not only on hover', () => {
    const { container } = render(<RawRecord file="a/b.jsonl" line={3} text={'{"token":"[secret:github-token]","cwd":"~/x"}'} />);
    const marks = container.querySelectorAll('.redacted');
    expect(marks).toHaveLength(2);
    for (const m of marks) expect(m.textContent).toMatch(/ \(redacted\)$/);
    expect(container.querySelector('pre')?.textContent).toBe('{"token":"[secret:github-token] (redacted)","cwd":"~ (redacted)/x"}');
  });
});
