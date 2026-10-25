// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { treeFor } from '../map/tree/view';
import { defaultSessionGraph, sessionSamples } from '../sessions/samples';
import { Home } from './Home';
import { SessionCard } from './SessionCard';
import { pageTitle } from './SiteShell';

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
    expect(container.querySelector('.hero-tree svg[role="img"]')?.getAttribute('aria-label')).toMatch(/^Tree: 19 episodes, 60 tool calls, 47 min\. /);
    expect(container.querySelector('.hero-tree > .legend')?.textContent).toBe('TaskExploreChangeVerifyAnswerCommandThinkingFailedWidth: tool calls');
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
    expect(meta.tagName).toBe('UL'); // one list item each, so a screen reader does not run them together
    expect([...meta.children].every((c) => c.tagName === 'LI')).toBe(true);
    expect(screen.getAllByRole('button').map((b) => b.textContent).filter((t) => ['AI titles', 'Details', 'Share'].includes(t ?? ''))).toEqual(['AI titles', 'Details', 'Share']);
  });

  it('draws the git-style list for every sample, so a tab switch swaps the list too', async () => {
    for (const sample of sessionSamples) {
      const g = await sample.load();
      const { unmount } = render(<SessionCard g={g} tag="Sample" />);
      const tree = screen.getByRole('tree', { name: 'Episodes in order' });
      const rows = [...tree.querySelectorAll('[role="treeitem"]')].map((el) => el.textContent);
      expect(rows[0]).toBe('Main agent, starts at 0 min');
      expect(rows.at(-1)).toMatch(/^Session ends at \d+ min$/);
      expect(document.body.textContent).not.toContain('not drawn yet');
      unmount();
    }
  });

  it('draws each sample\'s tree: a tab switch swaps the tree with the list and the outcome', async () => {
    const { container, rerender } = render(<Home session={null} onSession={() => {}} />);
    const label = () => container.querySelector('.hero-tree svg[role="img"]')?.getAttribute('aria-label');
    expect(label()).toContain('Verify phase 12 (failed: 1 gap)');
    rerender(<Home session="implementer-checks" onSession={() => {}} />);
    await waitFor(() => expect(label()).toBe('Tree: 12 episodes, 51 tool calls (3 failed), 49 min, all by the main agent.'));
    expect(document.getElementById('sess-title')?.textContent).toBe('Build keyboard navigation and a screen-reader table (phase 5)');
    rerender(<Home session="planner-pivot" onSession={() => {}} />);
    await waitFor(() => expect(label()).toMatch(/spawns 2 subagents: Rewrite plan for pivot \(failed\)/));
    expect(document.body.textContent).not.toContain('not drawn yet');
  });

  it('links hover both ways: a tree branch tints its list row, a list row lights its path in the tree', () => {
    const { container } = render(<Home session={null} onSession={() => {}} />);
    const svg = container.querySelector('.hero-tree svg.tree')!;
    const twig = treeFor(defaultSessionGraph, 1200, 520).twigs.find((w) => w.episodeId === 'e19')!;
    fireEvent.pointerMove(svg, { clientX: twig.tip.x, clientY: twig.tip.y, pointerType: 'mouse' });
    expect(svg.classList.contains('hvmode')).toBe(true);
    expect(container.querySelector('.tip')?.textContent).toContain('Edit zz-verify-scratch.test.ts +8 more');
    const row = () => container.querySelector('.gl-row.is-hv');
    expect(row()?.textContent).toMatch(/^Episode 7: Edit zz-verify-scratch\.test\.ts \+8 more/);
    expect(container.querySelector('.gl-svg .halo.hv')).not.toBeNull();
    fireEvent.pointerLeave(svg);
    expect(row()).toBeNull();
    expect(svg.classList.contains('hvmode')).toBe(false);

    const item = screen.getAllByRole('treeitem').find((el) => el.textContent?.startsWith('Episode 6:'))!;
    fireEvent.mouseEnter(item);
    expect(svg.classList.contains('hvmode')).toBe(true);
    expect(container.querySelector('.tip')?.textContent).toContain('Read redact.test.ts +8 more');
    fireEvent.mouseLeave(item);
    expect(svg.classList.contains('hvmode')).toBe(false);
    act(() => item.focus());
    expect(svg.classList.contains('hvmode')).toBe(true);
    act(() => item.blur());
    expect(svg.classList.contains('hvmode')).toBe(false);
  });

  it('falls back to the focused list row when the pointer leaves the tree or the list', () => {
    const { container } = render(<Home session={null} onSession={() => {}} />);
    const svg = container.querySelector('.hero-tree svg.tree')!;
    const tipNum = () => container.querySelector('.tip text')?.textContent;
    const item = screen.getAllByRole('treeitem').find((el) => el.textContent?.startsWith('Episode 6:'))!;
    act(() => item.focus());
    expect(tipNum()).toBe('6');
    const twig = treeFor(defaultSessionGraph, 1200, 520).twigs.find((w) => w.episodeId === 'e19')!;
    fireEvent.pointerMove(svg, { clientX: twig.tip.x, clientY: twig.tip.y, pointerType: 'mouse' });
    expect(tipNum()).toBe('7');
    fireEvent.pointerLeave(svg);
    expect(tipNum()).toBe('6');
    const other = screen.getAllByRole('treeitem').find((el) => el.textContent?.startsWith('Episode 7:'))!;
    fireEvent.mouseEnter(other);
    expect(tipNum()).toBe('7');
    fireEvent.mouseLeave(other);
    expect(tipNum()).toBe('6');
    act(() => item.blur());
    expect(svg.classList.contains('hvmode')).toBe(false);
  });

  it('falls back to the episode under the pointer when focus leaves the list', () => {
    const { container } = render(<Home session={null} onSession={() => {}} />);
    const svg = container.querySelector('.hero-tree svg.tree')!;
    const tipNum = () => container.querySelector('.tip text')?.textContent;
    const item = screen.getAllByRole('treeitem').find((el) => el.textContent?.startsWith('Episode 6:'))!;
    const twig = treeFor(defaultSessionGraph, 1200, 520).twigs.find((w) => w.episodeId === 'e19')!;
    fireEvent.pointerMove(svg, { clientX: twig.tip.x, clientY: twig.tip.y, pointerType: 'mouse' });
    act(() => item.focus());
    expect(tipNum()).toBe('6');
    act(() => item.blur());
    expect(tipNum()).toBe('7');
    fireEvent.pointerLeave(svg);
    expect(svg.classList.contains('hvmode')).toBe(false);
  });

  it('clears an in-progress hover when the tab changes', async () => {
    const { container, rerender } = render(<Home session={null} onSession={() => {}} />);
    const svg = () => container.querySelector('.hero-tree svg.tree')!;
    const twig = treeFor(defaultSessionGraph, 1200, 520).twigs.find((w) => w.episodeId === 'e19')!;
    fireEvent.pointerMove(svg(), { clientX: twig.tip.x, clientY: twig.tip.y, pointerType: 'mouse' });
    expect(svg().classList.contains('hvmode')).toBe(true);
    rerender(<Home session="implementer-checks" onSession={() => {}} />);
    await waitFor(() => expect(svg().getAttribute('aria-label')).toMatch(/^Tree: 12 episodes/));
    expect(svg().classList.contains('hvmode')).toBe(false);
    expect(container.querySelector('.tip')).toBeNull();
    expect(container.querySelector('.gl-row.is-hv')).toBeNull();
  });

  it('drops the AI titles on a tab switch: A on, B, back to A is the plain map with AI titles off', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { steps: { id: string }[] };
      return Response.json({ model: 'fake-model', cached: false, labels: body.steps.map((st) => ({ stepId: st.id, label: 'evidence', confidence: 0.8 })), links: [] });
    }));
    // Plain selectors: role queries over the whole home (tree, list) are slow when polled.
    const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name);
    try {
      const { container, rerender } = render(<Home session={null} onSession={() => {}} />);
      const plain = () => `${container.querySelector('.gl')?.outerHTML}${container.querySelector('.hero-tree svg')?.outerHTML}`;
      const before = plain();
      fireEvent.click(button('AI titles')!);
      // The control and its consent dialog load on first use.
      const send = await waitFor(() => button('Send') ?? Promise.reject(new Error('no consent dialog yet')), { timeout: 10_000 });
      await act(async () => fireEvent.click(send));
      await waitFor(() => expect(container.querySelector('.gl .ai-tag')).toBeTruthy());
      expect(button('AI titles')?.getAttribute('aria-pressed')).toBe('true');
      rerender(<Home session="implementer-checks" onSession={() => {}} />);
      await waitFor(() => expect(document.getElementById('sess-title')?.textContent).toBe('Build keyboard navigation and a screen-reader table (phase 5)'));
      expect(container.querySelector('.ai-tag, .ai-ring, .ai-by')).toBeNull();
      rerender(<Home session={null} onSession={() => {}} />);
      await waitFor(() => expect(plain()).toBe(before));
      expect(container.querySelector('.ai-tag, .ai-ring, .ai-by')).toBeNull();
      expect(button('AI titles')?.getAttribute('aria-pressed')).not.toBe('true');
    } finally {
      vi.unstubAllGlobals();
    }
  }, 20_000);

  it('says so when a sample fails to load, instead of loading forever', async () => {
    const sample = sessionSamples[1]!;
    const load = vi.spyOn(sample, 'load').mockRejectedValueOnce(new Error('offline'));
    render(<Home session={sample.id} onSession={() => {}} />);
    await waitFor(() => expect(document.getElementById('session')?.textContent).toBe('!This sample did not load. Reload the page to try again.'));
    expect(document.body.textContent).not.toContain('Loading the sample');
    load.mockRestore();
  });

  it('names the tab of another page with an en dash, not a middle dot', () => {
    expect(pageTitle('Install')).toBe('Install – Reasontrail');
  });

  it('shows the Sample tag only for a built-in sample', () => {
    const { container } = render(<SessionCard g={defaultSessionGraph} />);
    expect(container.querySelector('.tag')).toBeNull();
  });

  it('wires the tabs to the tree and the session card, the card being the tab panel', () => {
    render(<Home session={null} onSession={() => {}} />);
    const [first] = screen.getAllByRole('tab');
    const ids = first!.getAttribute('aria-controls')!.split(' ');
    expect(ids).toEqual(['hero-tree', 'session']);
    expect(document.getElementById('hero-tree')?.tagName).toBe('FIGURE');
    expect(screen.getByRole('tabpanel', { name: 'Verify phase 12, fix the audit gap, re-verify' }).id).toBe('session');
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

  it('scrolls the tab focused by an arrow key into the track\'s view, and the selected tab on load, sideways only', () => {
    const into = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    const was = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = into;
    try {
      // The track (16..374) cuts the third tab (463..715), as on a 390 phone with ?session=planner-pivot.
      const rect = (left: number, right: number) => () => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON() {} });
      const track = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute('role') === 'tablist') return rect(16, 374)();
        return this.getAttribute('aria-selected') === 'true' ? rect(463, 715)() : rect(20, 200)();
      });
      render(<Home session="planner-pivot" onSession={() => {}} />);
      expect(screen.getByRole('tablist').scrollLeft).toBe(715 - 374 + 4);
      expect(into).not.toHaveBeenCalled(); // the page itself does not scroll on load
      track.mockRestore();
      const [first] = screen.getAllByRole('tab');
      act(() => void fireEvent.keyDown(first!, { key: 'ArrowRight' }));
      expect(into).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
      expect(into.mock.contexts.at(-1)).toBe(screen.getAllByRole('tab')[1]);
    } finally {
      HTMLElement.prototype.scrollIntoView = was;
    }
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
