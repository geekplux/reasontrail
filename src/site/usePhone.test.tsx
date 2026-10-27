// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import homeCss from './home.css?raw';
import listCss from '../map/gitlist/gitlist.css?raw';
import { Home } from './Home';
import { SiteShell } from './SiteShell';
import { PHONE_QUERY, usePhone } from './usePhone';

/** A viewport `phone` or not, through matchMedia; `resize(phone)` crosses the breakpoint and fires `change`. */
function viewport(phone: boolean) {
  const lists = new Map<string, { matches: boolean; media: string; on: Set<() => void>; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void }>();
  const list = (q: string) => {
    let m = lists.get(q);
    if (!m) {
      const on = new Set<() => void>();
      m = { matches: phone && q === PHONE_QUERY, media: q, on, addEventListener: (_t, f) => on.add(f), removeEventListener: (_t, f) => on.delete(f) };
      lists.set(q, m);
    }
    return m;
  };
  vi.stubGlobal('matchMedia', list);
  return (next: boolean) => act(() => {
    const m = list(PHONE_QUERY);
    m.matches = next;
    for (const f of [...m.on]) f();
  });
}
const row = (key: string) => document.querySelector<HTMLElement>(`[data-row="${key}"]`);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const Probe = () => <p>{usePhone() ? 'phone' : 'wide'}</p>;

describe('usePhone', () => {
  it('follows the phone media query, and is false where there is no matchMedia', () => {
    render(<Probe />);
    expect(screen.getByText('wide')).toBeTruthy();
    cleanup();
    viewport(true);
    render(<Probe />);
    expect(screen.getByText('phone')).toBeTruthy();
  });

  it('is the width the phone rules in home.css use', () => {
    expect(homeCss).toContain(`@media ${PHONE_QUERY}`);
    expect(listCss).not.toMatch(/@media/); // the compact list follows the `compact` prop, not the viewport
  });
});

describe('Home on the phone', () => {
  it('puts the legend under the tabs and the outcome box above the list, the final answer under it', () => {
    viewport(true);
    const { container } = render(<Home session={null} onSession={() => {}} />);
    expect(container.querySelector('.hero-tree > .legend')).toBeNull();
    expect(container.querySelector('.under > .tabs + .legend')).toBeTruthy();
    const order = [...container.querySelector('.frame')!.children].map((el) => el.className.split(' ')[0]);
    expect(order.filter((c) => c !== 'visually-hidden')).toEqual(['sess', 'cols', 'sess-r', 'details']);
    expect([...container.querySelector('.frame > .cols')!.children].map((el) => el.className.split(' ').at(-1))).toEqual(['side', 'is-compact', 'final']);
    expect(container.querySelector('.cols > .side .res')).toBeTruthy();
    expect(container.querySelector('.cols > .final h3')?.textContent).toBe('Final answer');
    expect(container.querySelector('.gl.is-compact')).toBeTruthy();
  });

  it('has no header buttons, and the meta line leaves out the branch and ends with the Sample tag', () => {
    viewport(true);
    const { container } = render(<Home session={null} onSession={() => {}} />);
    expect(container.querySelector('.sess button')).toBeNull();
    expect([...container.querySelector('.meta')!.children].map((c) => c.textContent)).toEqual(['Claude Code', '47 min total', '3 subagents', '60 tool calls', 'Sample']);
  });

  it('keeps AI titles, Details and Share in a row after the final answer; Details names the branch (WCAG 1.4.10)', () => {
    viewport(true);
    const { container } = render(<Home session={null} onSession={() => {}} />);
    const actions = container.querySelector('.frame > .cols + .sess-r')!;
    expect([...actions.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['AI titles', 'Details', 'Share']);
    expect([...actions.querySelectorAll('button')].every((b) => b.className === 'btn ghost')).toBe(true);
    const details = screen.getByRole('button', { name: 'Details' });
    const box = document.getElementById(details.getAttribute('aria-controls')!)!;
    expect(box.previousElementSibling).toBe(actions); // it opens under the row
    expect(box.hidden).toBe(true);
    fireEvent.click(details);
    expect(box.hidden).toBe(false);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(box.querySelector('.meta .code')?.textContent).toBe('phase-12-structure-redact');
    expect(box.querySelector('.request')?.textContent).toBeTruthy();
  });

  it('moves focus to the panel title when the list opens a step, and back to the row on Esc', () => {
    viewport(true);
    const onStep = vi.fn<(stepId: string | undefined) => void>();
    const { rerender } = render(<Home session={null} step="s43" onSession={() => {}} onStep={onStep} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close step details' }));
    rerender(<Home session={null} step={null} onSession={() => {}} onStep={onStep} />);
    act(() => row('step:s41')!.focus());
    fireEvent.keyDown(row('step:s41')!, { key: 'Enter' });
    expect(onStep).toHaveBeenLastCalledWith('s41');
    rerender(<Home session={null} step="s41" onSession={() => {}} onStep={onStep} />);
    const title = document.querySelector('aside.detail h3');
    expect(document.activeElement).toBe(title);
    // Next keeps focus on its button; Esc closes and puts focus back on the step's row.
    const next = screen.getByRole('button', { name: 'Next step' });
    act(() => next.focus());
    fireEvent.click(next);
    rerender(<Home session={null} step="s43" onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: 'Escape' });
    rerender(<Home session={null} step={null} onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement).toBe(row('step:s43'));
  });

  it('keeps focus on Previous after a list pick, Next, then Previous', () => {
    viewport(true);
    const onStep = vi.fn<(stepId: string | undefined) => void>();
    const { rerender } = render(<Home session={null} onSession={() => {}} onStep={onStep} />);
    const ep = [...document.querySelectorAll<HTMLElement>('.gl-episode')].find((r) => /^Episode 6\b/.test(r.textContent ?? ''))!;
    fireEvent.click(ep);
    act(() => row('step:s41')!.focus());
    fireEvent.keyDown(row('step:s41')!, { key: 'Enter' });
    rerender(<Home session={null} step="s41" onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement).toBe(document.querySelector('aside.detail h3'));
    const next = screen.getByRole('button', { name: 'Next step' });
    act(() => next.focus());
    fireEvent.click(next);
    rerender(<Home session={null} step={onStep.mock.lastCall![0] ?? null} onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement).toBe(next);
    const prev = screen.getByRole('button', { name: 'Previous step' });
    act(() => prev.focus());
    fireEvent.click(prev);
    expect(onStep).toHaveBeenLastCalledWith('s41');
    rerender(<Home session={null} step="s41" onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement).toBe(prev);
  });

  it('keeps the list, the panel, the final answer and focus when the viewport crosses the breakpoint', () => {
    const resize = viewport(false);
    const { container } = render(<Home session={null} step="s41" onSession={() => {}} />);
    const list = container.querySelector('.gl')!;
    const panel = container.querySelector('aside.detail')!;
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const prev = screen.getByRole('button', { name: 'Previous step' });
    act(() => row('step:s43')!.focus());
    resize(true);
    // The same nodes, now in the phone's order: the panel above the list, the final answer under it.
    expect(container.querySelector('.gl')).toBe(list);
    expect(container.querySelector('aside.detail')).toBe(panel);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBe(prev);
    expect([...container.querySelector('.cols')!.children].map((el) => el.className.split(' ').at(-1))).toEqual(['detail', 'is-compact', 'final']);
    expect(document.activeElement).toBe(row('step:s43'));
    expect(container.querySelector('.gl-episode[aria-expanded="true"]')?.textContent).toMatch(/^Episode 6/);
    // Details stays open: its button is in the row under the final answer.
    expect(document.getElementById(screen.getByRole('button', { name: 'Details' }).getAttribute('aria-controls')!)?.hidden).toBe(false);
    // The actions row is one node moved between the header and the place after the list: focus on Details in the
    // phone's row stays on the same button, now in the header.
    const row390 = container.querySelector('.frame > .cols + .sess-r');
    const details = screen.getByRole('button', { name: 'Details' });
    act(() => details.focus());
    resize(false);
    expect(container.querySelector('.gl')).toBe(list);
    expect(container.querySelector('aside.detail')).toBe(panel);
    expect(container.querySelector('.sess > .sess-r')).toBe(row390);
    expect(document.activeElement).toBe(details);
    expect(document.activeElement?.closest('.sess')).toBeTruthy();
  });

  it('keeps the final answer open, and focus on its button, across the breakpoint', () => {
    const resize = viewport(false);
    const { container } = render(<Home session={null} onSession={() => {}} />);
    const more = screen.getByRole('button', { name: 'Read the full answer' });
    fireEvent.click(more);
    act(() => more.focus());
    resize(true);
    expect(container.querySelector('.cols > .final .answer.is-full')).toBeTruthy();
    expect(document.activeElement).toBe(more);
    resize(false);
    expect(container.querySelector('.cols > .final .answer.is-full')).toBeTruthy();
    expect(document.activeElement).toBe(more);
  });

  it('labels the header button "Open session"', () => {
    viewport(true);
    render(<SiteShell view="map" onFile={() => {}}><p /></SiteShell>);
    expect(screen.getByRole('link', { name: 'Open session' })).toBeTruthy();
    cleanup();
    viewport(false);
    render(<SiteShell view="map" onFile={() => {}}><p /></SiteShell>);
    expect(screen.getByRole('link', { name: 'Open a session' })).toBeTruthy();
  });
});
