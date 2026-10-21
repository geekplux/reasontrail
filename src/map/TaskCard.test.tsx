// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defaultSessionGraph } from '../sessions/samples';
import { TaskCard } from './TaskCard';
import { taskCard } from './outline';

afterEach(cleanup);

describe('TaskCard', () => {
  it('shows a sample\'s authored title, and its raw first request under "more"', () => {
    const g = defaultSessionGraph;
    const raw = taskCard(g).request.replace(/\*\*|`/g, '');
    render(<TaskCard g={g} sample title={g.displayTitle} />);
    expect(document.querySelector('.task-title')?.textContent).toBe('Build keyboard navigation and a screen-reader table (phase 5)');
    expect(document.querySelector('.task-raw')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'more' }));
    expect(document.querySelector('.task-raw')?.textContent).toBe(`First request${raw}`);
  });

  it('shows the raw first request without a title, and keeps the model in its own droppable span', () => {
    render(<TaskCard g={defaultSessionGraph} />);
    expect(document.querySelector('.task-title')?.textContent).toBe(taskCard(defaultSessionGraph).request.replace(/\*\*|`/g, '').slice(0, 279) + '…');
    expect(document.querySelector('.task-label .task-model')?.textContent).toBe(` · ${defaultSessionGraph.source.model ?? ''}`);
  });
});
