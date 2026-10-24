// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SessionGraph } from '../../shared/session/types';
import implementerChecks from '../sessions/samples/implementer-checks.graph.json';

/** The sample with trouble patterns and a long first request (the bundled default before v7). */
const defaultSessionGraph = implementerChecks as SessionGraph;
import { TaskCard } from './TaskCard';
import { taskCard } from './outline';

afterEach(cleanup);

describe('TaskCard', () => {
  it('shows a sample\'s authored title, and its raw first request and the model in Session details', () => {
    const g = defaultSessionGraph;
    const raw = taskCard(g).request.replace(/\*\*|`/g, '');
    render(<TaskCard g={g} sample title={g.displayTitle} />);
    expect(document.querySelector('.task-title')?.textContent).toBe('Build keyboard navigation and a screen-reader table (phase 5)');
    expect(screen.queryByRole('button', { name: 'more' })).toBeNull();
    expect(document.querySelector('.task-label')?.textContent).toBe('Task · Claude Code · sample');
    const toggle = screen.getByRole('button', { name: 'Session details' });
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(panel.hidden).toBe(true);
    expect(panel.querySelector('.task-raw')?.textContent).toBe(`First request${raw}`);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain(`model ${g.source.model ?? ''}`);
    expect(document.querySelectorAll('.task-meta .meta-item').length).toBeLessThanOrEqual(3);
  });

  it('shows the raw first request without a title, clamped until "more"', () => {
    render(<TaskCard g={defaultSessionGraph} />);
    expect(document.querySelector('.task-title')?.textContent).toBe(taskCard(defaultSessionGraph).request.replace(/\*\*|`/g, '').slice(0, 279) + '…');
    expect(screen.getByRole('button', { name: 'more' }).getAttribute('aria-expanded')).toBe('false');
  });
});
