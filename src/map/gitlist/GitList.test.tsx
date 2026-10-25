// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LabelOverlay, SessionGraph } from '../../../shared/session/types';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { GitList, type ListSelection } from './GitList';
import { STEP_ROWS_MAX, episodeSteps } from './rows';

const G = vff as unknown as SessionGraph;
const IMPL = implementer as unknown as SessionGraph;
afterEach(cleanup);

const items = () => screen.getAllByRole('treeitem');
const focused = () => document.activeElement as HTMLElement;
const press = (key: string) => act(() => void fireEvent.keyDown(focused(), { key }));
/** The row's accessible name: its text, visually hidden words included. */
const name = (el: Element | null) => el?.textContent ?? '';
/** What a sighted user reads: the text without the visually hidden words. */
const shown = (el: Element) => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('.visually-hidden').forEach((v) => v.remove());
  return copy.textContent ?? '';
};
const row = (start: string) => items().find((el) => name(el).startsWith(start))!;
const attrs = (el: Element, ...names: string[]) => names.map((n) => el.getAttribute(n));

describe('GitList keyboard (WAI-ARIA tree)', () => {
  it('is a tree with one tab stop that moves with ↑/↓/Home/End', () => {
    render(<GitList g={G} />);
    expect(screen.getByRole('tree', { name: 'Episodes in order' })).toBeTruthy();
    const all = items();
    expect(all.filter((el) => el.tabIndex === 0)).toHaveLength(1);
    expect(all[0]?.getAttribute('aria-level')).toBe('1');
    expect(all[0]?.getAttribute('aria-posinset')).toBe('1');
    expect(all[0]?.getAttribute('aria-setsize')).toBe('5'); // Main agent, three subagent lanes, Session ends
    act(() => all[0]!.focus());
    press('ArrowDown');
    expect(name(focused())).toBe('Verify phase 12, Verifier, 96 steps, starts at 0 min');
    expect(focused().tabIndex).toBe(0);
    expect(all[0]?.tabIndex).toBe(-1);
    press('End');
    expect(name(focused())).toBe('Session ends at 47 min');
    press('ArrowUp');
    expect(name(focused())).toBe('Passed, after 1 min, 1 step, at 47 min');
    press('Home');
    expect(focused()).toBe(all[0]);
  });

  it('→ opens an episode, → again enters it, Enter selects a step, Esc clears it, then closes the episode', () => {
    const onSelect = vi.fn<(s: ListSelection) => void>();
    render(<GitList g={G} onSelect={onSelect} />);
    const ep6 = items().find((el) => name(el).startsWith('Episode 6: Read redact.test.ts +8 more'))!;
    expect(name(ep6)).toBe('Episode 6: Read redact.test.ts +8 more, explore, 1 failed command, 28 steps, starts at 16 min');
    act(() => ep6.focus());
    expect(ep6.getAttribute('aria-expanded')).toBe('false');
    press('ArrowRight');
    expect(ep6.getAttribute('aria-expanded')).toBe('true');
    expect(onSelect).toHaveBeenLastCalledWith({ episodeId: 'e18' });
    const steps = items().filter((el) => el.getAttribute('aria-level') === '3');
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
    expect(items().some((el) => el.getAttribute('aria-level') === '3')).toBe(false);
  });

  it('nests a subagent under its lane row: episodes and verdict at level 2, ← goes back to the lane', () => {
    render(<GitList g={G} />);
    const lane = row('Verify phase 12, Verifier');
    expect(attrs(lane, 'aria-level', 'aria-expanded', 'aria-posinset', 'aria-setsize')).toEqual(['1', 'true', '2', '5']);
    expect(row('Main agent').getAttribute('aria-expanded')).toBeNull();
    const ep1 = row('Episode 1:');
    expect(attrs(ep1, 'aria-level', 'aria-posinset', 'aria-setsize', 'aria-selected')).toEqual(['2', '1', '9', null]);
    expect(attrs(row('Failed: 1 gap'), 'aria-level', 'aria-posinset', 'aria-setsize')).toEqual(['2', '9', '9']);
    act(() => lane.focus());
    press('ArrowRight');
    expect(focused()).toBe(ep1);
    press('ArrowDown');
    press('ArrowLeft');
    expect(focused()).toBe(lane);
  });

  it('keeps main-lane episodes at level 1 and their steps at level 2', () => {
    render(<GitList g={IMPL} />);
    const ep = row('Episode 2:');
    expect(attrs(ep, 'aria-level', 'aria-posinset', 'aria-setsize')).toEqual(['1', '3', '14']);
    fireEvent.click(ep);
    const steps = items().filter((el) => el.getAttribute('aria-level') === '2');
    expect(steps).toHaveLength(episodeSteps(IMPL, 'e1').length);
    expect(steps.every((el) => el.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(ep.getAttribute('aria-selected')).toBeNull(); // open, so aria-expanded alone says so
  });

  it('a leaf episode (the answer) does not open: → stays, Enter selects it in place', () => {
    const onSelect = vi.fn<(s: ListSelection) => void>();
    render(<GitList g={IMPL} onSelect={onSelect} />);
    const answer = row('Episode 12:');
    expect(name(answer)).toBe('Episode 12: Answer, 12 min wait, 1 step, starts at 49 min'); // no ", answer" after "Answer"
    expect(answer.getAttribute('aria-expanded')).toBeNull();
    act(() => answer.focus());
    press('ArrowRight');
    expect(focused()).toBe(answer);
    expect(onSelect).not.toHaveBeenCalled();
    press('Enter');
    expect(onSelect).toHaveBeenLastCalledWith({ episodeId: 'e11' });
    expect(answer.getAttribute('aria-selected')).toBe('true');
    expect(answer.getAttribute('aria-expanded')).toBeNull();
    press('ArrowRight');
    expect(focused()).toBe(answer);
    expect(items().some((el) => el.getAttribute('aria-level') === '2')).toBe(false);
  });

  it('rings a selected leaf episode, not only tints it', () => {
    const { container } = render(<GitList g={IMPL} />);
    const rings = () => container.querySelectorAll('.gl-svg .ring[r="10.5"]').length;
    expect(rings()).toBe(0);
    fireEvent.click(row('Episode 12:'));
    expect(rings()).toBe(1);
    fireEvent.click(row('Episode 2:'));
    expect(rings()).toBe(0); // an episode with steps shows them instead
  });

  it('draws a selected failed step\'s ✕ on its own slate-1 halo, inside the ring (3:1 off the row\'s tint)', () => {
    const { container } = render(<GitList g={G} selection={{ episodeId: 'e18', stepId: 's41' }} />);
    const x = container.querySelector('.gl-svg .x')!;
    const halo = x.previousElementSibling!;
    expect(halo.getAttribute('class')).toBe('halo');
    expect(Number(halo.getAttribute('r'))).toBeGreaterThanOrEqual(3 * Math.SQRT2 + 0.75); // covers the ✕'s round-capped arms
    expect(x.nextElementSibling?.getAttribute('class')).toBe('ring');
  });

  it('keeps the hover tint on the halo after a click opens and closes the episode', () => {
    const { container } = render(<GitList g={G} />);
    const ep = row('Episode 6: Read');
    fireEvent.mouseEnter(ep);
    const key = [...container.querySelectorAll('[data-halo]')].find((h) => h.classList.contains('hv'))!.getAttribute('data-halo')!;
    const tint = () => container.querySelector(`[data-halo="${key}"]`)!.getAttribute('class');
    fireEvent.click(ep);
    expect(tint()).toBe('halo on hv'); // .on wins in the CSS
    fireEvent.click(row('Episode 6: Read'));
    expect(tint()).toBe('halo hv');
    fireEvent.mouseLeave(row('Episode 6: Read'));
    expect(tint()).toBe('halo');
  });

  it('reads a failure and a wait as one line: "1 failed command, 12 min wait"', () => {
    render(<GitList g={IMPL} />);
    const sub = row('Episode 4:').querySelector('.gl-sub')!;
    expect(shown(sub)).toBe('1 failed command, 12 min wait');
    expect([...sub.children].filter((c) => !c.classList.contains('visually-hidden'))).toHaveLength(2); // ⚠ and the text
    expect(name(row('Episode 4:'))).toContain(', 1 failed command, 12 min wait, 20 steps');
  });

  it('truncates long lane names in their column', () => {
    const { container } = render(<GitList g={G} />);
    expect([...container.querySelectorAll('.gl-lane .gl-title.t-lane > .gl-text')].map((t) => t.textContent)).toEqual(['Main agent', 'Verify phase 12', 'Fix phase 12 audit gap', 'Re-verify phase 12']);
  });

  it('forgets the open episode and focus when it gets another session', () => {
    const { rerender } = render(<GitList g={G} />);
    fireEvent.click(row('Episode 6:'));
    act(() => row('Episode 6:').focus());
    expect(items().filter((el) => el.getAttribute('aria-expanded') === 'true')).toHaveLength(4); // three lanes and episode 6
    rerender(<GitList g={structuredClone(G)} />);
    expect(row('Episode 6:').getAttribute('aria-expanded')).toBe('false');
    expect(items().filter((el) => el.tabIndex === 0).map(name)).toEqual(['Main agent, starts at 0 min']);
    rerender(<GitList g={IMPL} />);
    expect(items().filter((el) => el.getAttribute('aria-expanded') === 'true')).toHaveLength(0);
  });
});

describe('GitList long episodes', () => {
  // implementer-checks with episode 2 carrying the steps of episodes 2, 4 and 9 (42 rows) or 2 and 4 (24 rows).
  const long = (ids: string[]) => {
    const g = structuredClone(IMPL);
    const e1 = g.episodes.find((e) => e.id === 'e1')!;
    e1.stepIds = ids.flatMap((id) => g.episodes.find((e) => e.id === id)!.stepIds);
    return g;
  };

  it(`lists ${STEP_ROWS_MAX} steps, then "Show N more steps"; Enter shows the rest and focuses step ${STEP_ROWS_MAX + 1}`, () => {
    const g = long(['e1', 'e3', 'e8']);
    const all = episodeSteps(g, 'e1');
    expect(all.length).toBeGreaterThan(STEP_ROWS_MAX + 5);
    render(<GitList g={g} />);
    act(() => row('Episode 2:').focus());
    press('ArrowRight');
    const level2 = () => items().filter((el) => el.getAttribute('aria-level') === '2');
    expect(level2()).toHaveLength(STEP_ROWS_MAX + 1);
    const more = level2().at(-1)!;
    expect(name(more)).toBe(`Show ${all.length - STEP_ROWS_MAX} more steps`);
    const ep = row('Episode 2:');
    const total = g.episodes.find((e) => e.id === 'e1')!.stepIds.length;
    expect(name(ep)).toContain(`, ${total} steps, ${STEP_ROWS_MAX} shown,`);
    expect(shown(ep)).not.toContain('shown');
    act(() => more.focus());
    press('Enter');
    expect(level2()).toHaveLength(all.length);
    expect(name(row('Episode 2:'))).toContain(`, ${total} steps${all.length < total ? `, ${all.length} shown` : ''},`);
    expect(focused()).toBe(level2()[STEP_ROWS_MAX]);
    expect(focused().getAttribute('aria-posinset')).toBe(String(STEP_ROWS_MAX + 1));
  });

  it('keeps a selected step past the cut-off visible', () => {
    const g = long(['e1', 'e3', 'e8']);
    const all = episodeSteps(g, 'e1');
    const pick = all[STEP_ROWS_MAX + 2]!;
    render(<GitList g={g} selection={{ episodeId: 'e1', stepId: pick.stepId }} />);
    const level2 = items().filter((el) => el.getAttribute('aria-level') === '2');
    expect(level2).toHaveLength(all.length);
    expect(level2[STEP_ROWS_MAX + 2]?.getAttribute('aria-selected')).toBe('true');
    expect(items().some((el) => name(el).startsWith('Show '))).toBe(false);
  });

  it(`lists every step when ${STEP_ROWS_MAX + 5} or fewer`, () => {
    const g = long(['e1', 'e3']);
    const all = episodeSteps(g, 'e1');
    expect(all.length).toBeGreaterThan(STEP_ROWS_MAX);
    expect(all.length).toBeLessThanOrEqual(STEP_ROWS_MAX + 5);
    render(<GitList g={g} />);
    fireEvent.click(row('Episode 2:'));
    expect(items().filter((el) => el.getAttribute('aria-level') === '2')).toHaveLength(all.length);
    expect(items().some((el) => name(el).startsWith('Show '))).toBe(false);
  });

  it('← closes an open episode; opening another closes the first', () => {
    render(<GitList g={G} />);
    const find = (n: string) => items().find((el) => name(el).startsWith(`Episode ${n}`))!;
    act(() => find('6: Read').focus());
    press('ArrowRight');
    press('ArrowLeft');
    expect(find('6: Read').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(find('6: Read'));
    fireEvent.click(find('7: Edit'));
    expect(find('6: Read').getAttribute('aria-expanded')).toBe('false');
    expect(find('7: Edit').getAttribute('aria-expanded')).toBe('true');
  });

  it('reports the focused row for the tree highlight', () => {
    const onActive = vi.fn<(s: ListSelection | undefined, via: 'focus' | 'pointer') => void>();
    render(<GitList g={G} onActive={onActive} />);
    const ep = items().find((el) => name(el).startsWith('Episode 2: Read PLAN.md'))!;
    act(() => ep.focus());
    expect(onActive).toHaveBeenLastCalledWith({ episodeId: 'e14' }, 'focus');
    fireEvent.mouseLeave(ep);
    expect(onActive).toHaveBeenLastCalledWith(undefined, 'pointer');
    act(() => ep.blur());
    expect(onActive).toHaveBeenLastCalledWith(undefined, 'focus');
  });

  it('shows AI titles as tags beside episode rows only when the overlay is on', () => {
    const overlay: LabelOverlay = { model: 'test-model', createdAt: '', labels: [{ stepId: 's41', label: 'dead end', confidence: 0.9 }], links: [] };
    const { container, rerender } = render(<GitList g={G} />);
    expect(container.querySelector('.ai-tag')).toBeNull();
    rerender(<GitList g={G} overlay={overlay} />);
    expect([...container.querySelectorAll('.ai-tag')].map((t) => t.textContent)).toEqual(['dead end']);
    expect(name(items().find((el) => name(el).startsWith('Episode 6:'))!)).toContain(', AI labels, suggested by test-model: dead end (1 step), 1 failed command');
  });
});

describe('GitList compact (the phone, Phone.html)', () => {
  it('drops the header, # and Start columns from view but keeps the numbers and times for screen readers', () => {
    const { container } = render(<GitList g={G} compact />);
    expect(container.querySelector('.gl.is-compact')).toBeTruthy();
    expect(container.querySelector('.gl-head, .gl-num, .gl-at')).toBeNull();
    expect((container.querySelector('.gl') as HTMLElement).style.height).toBe('1104px');
    const ep7 = row('Episode 7: ');
    expect(name(ep7)).toBe('Episode 7: Edit zz-verify-scratch.test.ts +8 more, change, 15 min wait, 20 steps, starts at 17 min');
    expect(shown(ep7)).toBe('Edit zz-verify-scratch.test.ts +8 more15 min wait20');
  });
});
