// @vitest-environment happy-dom
// Phase 32b: selecting a step from the tree, the list or the URL; the tree's blue path, ring and callout; the detail
// panel; Previous / Next; Esc; the URL round trip through the site; a tab switch clears the selection.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Site } from '../Site';
import { highlight, type HitTarget } from '../map/tree';
import { TreeView } from '../map/tree/TreeView';
import type { Box } from '../map/tree/types';
import { treeCallout, treeFor } from '../map/tree/view';
import { defaultSessionGraph as g } from '../sessions/samples';
import { Home } from './Home';
import { selectableSteps } from './stepDetailData';

// The site prefetches its lazy pages when idle; here that import chain could still be loading when the file ends, and
// Vitest then fails the run on the late import (EnvironmentTeardownError). Nothing here tests the prefetch.
beforeAll(() => {
  vi.stubGlobal('requestIdleCallback', () => 0);
  vi.stubGlobal('cancelIdleCallback', () => {});
});
afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

const t = treeFor(g, 1200, 520);
const twig = (id: string) => t.twigs.find((w) => w.stepId === id)!;
const panel = () => document.querySelector<HTMLElement>('aside.detail');
const row = (key: string) => document.querySelector<HTMLElement>(`[data-row="${key}"]`);

describe('the tree with a selected step', () => {
  it('turns the path from the root to the step blue, dims the rest and rings the step with a callout', () => {
    const { container } = render(<TreeView g={g} width={1200} height={520} selected="s41" callout={['Inspect vitest config for log suppression', 'Exit code 2, 16 min']} />);
    const svg = container.querySelector('svg.tree')!;
    expect(svg.classList.contains('dim')).toBe(true);
    expect([...container.querySelectorAll('path.b.hi')].map((p) => p.getAttribute('d'))).toEqual(highlight(t, 's41'));
    expect(container.querySelectorAll('circle.ring')).toHaveLength(1);
    expect([...container.querySelectorAll('.callout text')].map((el) => el.textContent)).toEqual(['Inspect vitest config for log suppression', 'Exit code 2, 16 min']);
    expect(container.querySelector('.callout path.lead')).not.toBeNull();
    expect(container.querySelector('.t-num.on')?.textContent).toBe('6');
    expect(container.querySelectorAll('.t-node.on')).toHaveLength(1);
  });

  it('draws no selection for an id it does not draw', () => {
    const { container } = render(<TreeView g={g} width={1200} height={520} selected="nope" />);
    expect(container.querySelector('svg.tree.dim, .b.hi, .ring, .callout')).toBeNull();
  });

  it('rings the step without labels too (the phone), with no callout', () => {
    const { container } = render(<TreeView g={g} width={358} height={190} labels={false} selected="s41" callout={['Inspect vitest config for log suppression', 'Exit code 2, 16 min']} />);
    expect(container.querySelectorAll('circle.ring')).toHaveLength(1);
    expect(container.querySelector('.callout')).toBeNull();
  });

  it('keeps the hover tooltip off the selected step\'s callout and ring', () => {
    const lines: [string, string] = ['Inspect vitest config for log suppression', 'Exit code 2, 16 min'];
    const call = treeCallout(t, 's41', lines)!;
    const ring = { x0: call.ring.x - 10, y0: call.ring.y - 10, x1: call.ring.x + 10, y1: call.ring.y + 10 };
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const covered = t.episodes.filter((e) => {
      const { container, unmount } = render(<TreeView g={g} width={1200} height={520} selected="s41" callout={lines} hover={e.episodeId} />);
      const tip = container.querySelector('.tip');
      const [x, y] = (tip?.getAttribute('transform') ?? '').match(/[\d.]+/g)!.map(Number) as [number, number];
      const rect = tip!.querySelector('rect')!;
      const box = { x0: x, y0: y, x1: x + Number(rect.getAttribute('width')), y1: y + Number(rect.getAttribute('height')) };
      unmount();
      return hit(box, call.box) || hit(box, ring);
    });
    expect(covered.map((e) => e.episodeId)).toEqual([]);
  });

  it('picks the mark under a click or a tap', () => {
    const onPick = vi.fn<(hit: HitTarget) => void>();
    const { container } = render(<TreeView g={g} width={1200} height={520} onPick={onPick} />);
    const svg = container.querySelector('svg.tree')!;
    fireEvent.click(svg, { clientX: twig('s41').tip.x + 1, clientY: twig('s41').tip.y + 1 });
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'step', id: 's41', episodeId: 'e18' }));
    fireEvent.click(svg, { clientX: 1199, clientY: 519 });
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('Home: step selection', () => {
  it('opens the Step state from the URL: tree, list and detail panel', () => {
    const { container } = render(<Home session="verify-fail-fix" step="s41" onSession={() => {}} />);
    expect(container.querySelector('.hero-tree svg.tree.dim')).not.toBeNull();
    expect(container.querySelector('.hero-tree .callout')?.textContent).toBe('Inspect vitest config for log suppressionExit code 2, 16 min');
    expect(row('ep:e18')?.getAttribute('aria-expanded')).toBe('true');
    expect(row('step:s41')?.getAttribute('aria-selected')).toBe('true');
    const p = panel()!;
    expect(p.querySelector('.d-head p')?.textContent).toBe('Verify phase 12, episode 6, step 1 of 28');
    // Under the card's h2 title: the panel's title is an h3, its labels h4 (one level up each in the viewer).
    expect(screen.getByRole('heading', { level: 2, name: 'Verify phase 12, fix the audit gap, re-verify' }).id).toBe('sess-title');
    expect(p.querySelector('h3.d-h')?.textContent).toBe('Command failed');
    expect(p.querySelector('pre.cmd')?.textContent).toMatch(/^\$ cat vitest\.config\.\*/);
    expect([...p.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(['Output Exit code 2, no output', 'Next step 16 min']);
    expect(p.querySelector('.d-src')?.textContent).toBe('Source agent-ad0e51f3501a3ddc3.jsonl line 132');
    expect(container.querySelector('aside[aria-label="Outcome"]')).toBeNull();
    // No card inside a card: the panel holds no framed box but its pre blocks.
    expect(p.querySelector('.detail, .res, .frame')).toBeNull();
  });

  it('ignores a step id the sample does not list', () => {
    const { container } = render(<Home session="verify-fail-fix" step="s96" onSession={() => {}} />);
    expect(panel()).toBeNull();
    expect(container.querySelector('aside[aria-label="Outcome"]')).not.toBeNull();
    expect(container.querySelector('.hero-tree svg.tree.dim')).toBeNull();
  });

  it('selects from a tree click and from Enter on a list row, moving focus into the panel only from the tree', () => {
    const onStep = vi.fn<(stepId: string | undefined) => void>();
    const { container, rerender } = render(<Home session={null} onSession={() => {}} onStep={onStep} />);
    fireEvent.click(container.querySelector('.hero-tree svg.tree')!, { clientX: twig('s41').tip.x, clientY: twig('s41').tip.y });
    expect(onStep).toHaveBeenLastCalledWith('s41');
    rerender(<Home session={null} step="s41" onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement?.textContent).toBe('Command failed');
    rerender(<Home session={null} step={null} onSession={() => {}} onStep={onStep} />);
    // The episode stays open in the list; Enter on its next step selects that one.
    act(() => row('step:s43')!.focus());
    fireEvent.keyDown(row('step:s43')!, { key: 'Enter' });
    expect(onStep).toHaveBeenLastCalledWith('s43');
    rerender(<Home session={null} step="s43" onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement).toBe(row('step:s43'));
    expect(panel()?.querySelector('h3')?.textContent).toBe('Command');
  });

  it('moves focus to the title again on a second tree click', () => {
    const onStep = vi.fn<(stepId: string | undefined) => void>();
    const { container, rerender } = render(<Home session={null} onSession={() => {}} onStep={onStep} />);
    const svg = container.querySelector('.hero-tree svg.tree')!;
    fireEvent.click(svg, { clientX: twig('s41').tip.x, clientY: twig('s41').tip.y });
    rerender(<Home session={null} step="s41" onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement?.textContent).toBe('Command failed');
    act(() => row('step:s41')!.focus());
    fireEvent.click(svg, { clientX: twig('s43').tip.x, clientY: twig('s43').tip.y });
    expect(onStep).toHaveBeenLastCalledWith('s43');
    rerender(<Home session={null} step="s43" onSession={() => {}} onStep={onStep} />);
    expect(document.activeElement).toBe(panel()?.querySelector('h3'));
    expect(document.activeElement?.textContent).toBe('Command');
  });

  it('announces a step picked in the list or by Previous / Next; the panel itself is not a live region', () => {
    const onStep = vi.fn<(stepId: string | undefined) => void>();
    const live = () => document.querySelector('.frame [data-role="live"]')?.textContent?.trim();
    // Open episode 6 and close the panel (the episode stays open), then pick its first step from the list.
    const { rerender } = render(<Home session={null} step="s43" onSession={() => {}} onStep={onStep} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close step details' }));
    rerender(<Home session={null} step={null} onSession={() => {}} onStep={onStep} />);
    act(() => row('step:s41')!.focus());
    fireEvent.keyDown(row('step:s41')!, { key: 'Enter' });
    expect(onStep).toHaveBeenLastCalledWith('s41');
    expect(live()).toBe('Command failed: Inspect vitest config for log suppression, Verify phase 12, episode 6, step 1 of 28');
    rerender(<Home session={null} step="s41" onSession={() => {}} onStep={onStep} />);
    expect(panel()?.querySelector('[aria-live]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(live()).toMatch(/^Command: .+, Verify phase 12, episode 6, step 3 of 28$/);
  });

  it('steps with Previous / Next within the episode, and Esc closes the panel with focus back on the row', () => {
    const all = selectableSteps(g);
    const onStep = vi.fn<(stepId: string | undefined) => void>();
    render(<Home session={null} step="s41" onSession={() => {}} onStep={onStep} />);
    // s41 opens episode 6: Previous is greyed, as on the canvas.
    expect(screen.getByRole('button', { name: 'Previous step' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(onStep).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(onStep).toHaveBeenLastCalledWith('s43');
    fireEvent.keyDown(panel()!.querySelector('h3')!, { key: 'Escape' });
    expect(onStep).toHaveBeenLastCalledWith(undefined);
    expect(document.activeElement).toBe(row('step:s41'));
    cleanup();
    const first = all[0]!.step.stepId;
    render(<Home session={null} step={first} onSession={() => {}} onStep={onStep} />);
    expect(screen.getByRole('button', { name: 'Previous step' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close step details' }));
    expect(onStep).toHaveBeenLastCalledWith(undefined);
  });
});

describe('Site: the selected step in the URL', () => {
  const renderSite = (search: string) => {
    window.history.replaceState(null, '', `/${search}`);
    return render(<Site />);
  };

  const travel = async (to: 'back' | 'forward') => {
    await act(async () => {
      window.history[to]();
      await new Promise((r) => setTimeout(r, 20));
    });
  };

  it('pushes the first step and replaces the next, Back closes the panel like Esc, Forward reopens it, and a tab switch clears it', async () => {
    const { container } = renderSite('?session=verify-fail-fix');
    const depth = window.history.length;
    fireEvent.click(container.querySelector('.hero-tree svg.tree')!, { clientX: twig('s41').tip.x, clientY: twig('s41').tip.y });
    expect(window.location.search).toBe('?session=verify-fail-fix&step=s41');
    expect(panel()?.dataset.step).toBe('s41');
    expect(window.history.length).toBe(depth + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(window.location.search).toBe('?session=verify-fail-fix&step=s43');
    expect(window.history.length).toBe(depth + 1);
    // Back leaves the step: the panel closes and focus goes to the step's row, not the page heading.
    await travel('back');
    await waitFor(() => expect(panel()).toBeNull());
    expect(window.location.search).toBe('?session=verify-fail-fix');
    expect(document.activeElement).toBe(row('step:s43'));
    await travel('forward');
    await waitFor(() => expect(panel()?.dataset.step).toBe('s43'));
    expect(document.activeElement).toBe(row('step:s43'));
    fireEvent.click(screen.getByRole('tab', { name: 'Lint and typecheck fail, then pass' }));
    expect(window.location.search).toBe('?session=implementer-checks');
    expect(panel()).toBeNull();
    expect(container.querySelector('.hero-tree svg.tree.dim')).toBeNull();
  });
});
