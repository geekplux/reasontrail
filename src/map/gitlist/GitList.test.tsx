// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LabelOverlay, SessionGraph } from '../../../shared/session/types';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { GitList, type ListSelection } from './GitList';

const G = vff as unknown as SessionGraph;
afterEach(cleanup);

const items = () => screen.getAllByRole('treeitem');
const focused = () => document.activeElement as HTMLElement;
const press = (key: string) => act(() => void fireEvent.keyDown(focused(), { key }));
const name = (el: Element | null) => el?.getAttribute('aria-label') ?? '';

describe('GitList keyboard (WAI-ARIA tree)', () => {
  it('is a tree with one tab stop that moves with ↑/↓/Home/End', () => {
    render(<GitList g={G} />);
    expect(screen.getByRole('tree', { name: 'Episodes in order' })).toBeTruthy();
    const all = items();
    expect(all.filter((el) => el.tabIndex === 0)).toHaveLength(1);
    expect(all[0]?.getAttribute('aria-level')).toBe('1');
    expect(all[0]?.getAttribute('aria-posinset')).toBe('1');
    expect(all[0]?.getAttribute('aria-setsize')).toBe(String(all.length));
    act(() => all[0]!.focus());
    press('ArrowDown');
    expect(name(focused())).toBe('Verify phase 12, verifier, 96 steps, starts at 0 min');
    expect(focused().tabIndex).toBe(0);
    expect(all[0]?.tabIndex).toBe(-1);
    press('End');
    expect(name(focused())).toBe('Session ends at 47 min');
    press('ArrowUp');
    expect(name(focused())).toBe('Passed, after 1 min');
    press('Home');
    expect(focused()).toBe(all[0]);
  });

  it('→ opens an episode, → again enters it, Enter selects a step, Esc clears it, then closes the episode', () => {
    const onSelect = vi.fn<(s: ListSelection) => void>();
    render(<GitList g={G} onSelect={onSelect} />);
    const ep6 = items().find((el) => name(el).startsWith('6 Read redact.test.ts +8 more'))!;
    expect(name(ep6)).toBe('6 Read redact.test.ts +8 more, explore, 1 failed command, 28 steps, starts at 16 min');
    act(() => ep6.focus());
    expect(ep6.getAttribute('aria-expanded')).toBe('false');
    press('ArrowRight');
    expect(ep6.getAttribute('aria-expanded')).toBe('true');
    expect(onSelect).toHaveBeenLastCalledWith({ episodeId: 'e18' });
    const steps = items().filter((el) => el.getAttribute('aria-level') === '2');
    expect(steps).toHaveLength(18);
    expect(steps[0]?.getAttribute('aria-setsize')).toBe('18');
    press('ArrowRight');
    expect(name(focused())).toBe('Inspect vitest config for log suppression, failed, Exit 2, 16 min');
    press('Enter');
    expect(onSelect).toHaveBeenLastCalledWith({ episodeId: 'e18', stepId: 's41' });
    expect(focused().getAttribute('aria-selected')).toBe('true');
    expect(focused().className).toContain('is-sel');
    press('Escape');
    expect(onSelect).toHaveBeenLastCalledWith({ episodeId: 'e18' });
    expect(focused().getAttribute('aria-selected')).toBe('false');
    press('ArrowLeft'); // from a step to its episode
    expect(focused()).toBe(ep6);
    press('ArrowRight');
    press('Escape'); // nothing selected: closes the episode, focus stays on it
    expect(ep6.getAttribute('aria-expanded')).toBe('false');
    expect(focused()).toBe(ep6);
    expect(items().some((el) => el.getAttribute('aria-level') === '2')).toBe(false);
  });

  it('← closes an open episode; opening another closes the first', () => {
    render(<GitList g={G} />);
    const find = (n: string) => items().find((el) => name(el).startsWith(n))!;
    act(() => find('6 Read').focus());
    press('ArrowRight');
    press('ArrowLeft');
    expect(find('6 Read').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(find('6 Read'));
    fireEvent.click(find('7 Edit'));
    expect(find('6 Read').getAttribute('aria-expanded')).toBe('false');
    expect(find('7 Edit').getAttribute('aria-expanded')).toBe('true');
  });

  it('reports the focused row for the tree highlight', () => {
    const onActive = vi.fn<(s: ListSelection | undefined) => void>();
    render(<GitList g={G} onActive={onActive} />);
    const ep = items().find((el) => name(el).startsWith('2 Read PLAN.md'))!;
    act(() => ep.focus());
    expect(onActive).toHaveBeenLastCalledWith({ episodeId: 'e14' });
    fireEvent.mouseLeave(ep);
    expect(onActive).toHaveBeenLastCalledWith(undefined);
  });

  it('shows AI titles as tags beside episode rows only when the overlay is on', () => {
    const overlay: LabelOverlay = { model: 'test-model', createdAt: '', labels: [{ stepId: 's41', label: 'dead end', confidence: 0.9 }], links: [] };
    const { container, rerender } = render(<GitList g={G} />);
    expect(container.querySelector('.ai-tag')).toBeNull();
    rerender(<GitList g={G} overlay={overlay} />);
    expect([...container.querySelectorAll('.ai-tag')].map((t) => t.textContent)).toEqual(['dead end']);
    expect(name(items().find((el) => name(el).startsWith('6 Read'))!)).toMatch(/AI labels, suggested by test-model: dead end \(1 step\)$/);
  });
});
