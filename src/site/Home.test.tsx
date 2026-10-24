// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defaultSessionGraph } from '../sessions/samples';
import { Home } from './Home';
import { SessionCard } from './SessionCard';

afterEach(cleanup);

describe('Home (v7 §4, §12)', () => {
  it('draws the canvas blocks in order, with the default sample first and no middle dot anywhere', () => {
    const { container } = render(<Home session={null} onSession={() => {}} />);
    const blocks = [...container.querySelectorAll('.home > *')].map((el) => el.className.split(' ')[0]);
    expect(blocks).toEqual(['hero', 'frame', 'install', 'more']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('See how your coding agent got there.');
    expect(screen.getAllByRole('tab').map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
      ['A verifier fails, a fix passes', 'true'],
      ['Lint and typecheck fail, then pass', 'false'],
      ['A change request rewrites the plan', 'false'],
    ]);
    expect(container.querySelector('.hero-tree svg[role="img"]')?.getAttribute('aria-label')).toMatch(/^Tree: /);
    const labels = [...container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
    expect(`${container.textContent}${labels.join('')}`).not.toContain('·');
  });

  it('puts nothing above the session title; the meta line ends with the Sample tag', () => {
    render(<Home session={null} onSession={() => {}} />);
    const title = screen.getByRole('heading', { level: 2, name: 'Verify phase 12, fix the audit gap, re-verify' });
    expect(title.previousElementSibling).toBeNull();
    expect(title.parentElement?.previousElementSibling).toBeNull();
    const meta = title.nextElementSibling!;
    expect([...meta.children].map((c) => c.textContent)).toEqual(['Claude Code', '47 min total', '3 subagents', '60 tool calls', 'phase-12-structure-redact', 'Sample']);
    expect(screen.getAllByRole('button').map((b) => b.textContent).filter((t) => ['AI titles', 'Details', 'Share'].includes(t ?? ''))).toEqual(['AI titles', 'Details', 'Share']);
  });

  it('shows the Sample tag only for a built-in sample', () => {
    const { container } = render(<SessionCard g={defaultSessionGraph} />);
    expect(container.querySelector('.tag')).toBeNull();
  });

  it('moves between sample tabs with the arrow keys', () => {
    const onSession = vi.fn<(id: string) => void>();
    render(<Home session={null} onSession={onSession} />);
    const [first] = screen.getAllByRole('tab');
    expect(first?.tabIndex).toBe(0);
    act(() => void fireEvent.keyDown(first!, { key: 'ArrowLeft' }));
    expect(onSession).toHaveBeenLastCalledWith('planner-pivot');
    act(() => void fireEvent.keyDown(first!, { key: 'ArrowRight' }));
    expect(onSession).toHaveBeenLastCalledWith('implementer-checks');
  });

  it('toggles Details and the full final answer', () => {
    render(<Home session={null} onSession={() => {}} />);
    const details = screen.getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(details);
    expect(document.getElementById(details.getAttribute('aria-controls')!)?.hidden).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Read the full answer' }));
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
  });
});
