// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MapView } from '../map/MapView';
import { sessionSamples } from '../sessions/samples';
import { LensContext, type LensOpener, type LensTarget } from './lensTarget';

const pivot = () => sessionSamples.find((s) => s.id === 'planner-pivot')!.load();

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

async function panelAt(step: string, opener: LensOpener | null) {
  window.history.replaceState(null, '', `/?session=planner-pivot&step=${step}`);
  const graph = await pivot();
  const map = <MapView graph={graph} />;
  render(opener ? <LensContext.Provider value={opener}>{map}</LensContext.Provider> : map);
  return screen.getByTestId('detail-panel');
}

describe('Zoom into this sentence (Z1)', () => {
  it('opens the lens on a recorded sentence: marked offline, picked by default when first', async () => {
    const open = vi.fn<(t: LensTarget) => void>();
    const panel = await panelAt('s12', { sampleId: 'planner-pivot', sampleTitle: 'Plan', open });
    const chip = panel.querySelector<HTMLElement>('.lens-sentence')!;
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.getAttribute('tabindex')).toBe('0');
    expect(chip.textContent).toContain('(recorded, works offline)');
    expect(screen.getByText('Recorded · works offline')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom into this sentence' }));
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ stepId: 's12', recorded: expect.objectContaining({ gardenId: 'lens-planner-pivot-1' }) }));
  });

  it('picks another sentence with Enter; one with no recording offers live growth', async () => {
    const open = vi.fn<(t: LensTarget) => void>();
    const panel = await panelAt('s108', { sampleId: 'planner-pivot', sampleTitle: 'Plan', open });
    const chips = [...panel.querySelectorAll<HTMLElement>('.lens-sentence')];
    expect(chips.length).toBeGreaterThan(3);
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Not recorded · grows live if you opt in')).toBeTruthy();
    fireEvent.keyDown(chips[2]!, { key: 'Enter' });
    expect(chips[2]!.getAttribute('aria-pressed')).toBe('true');
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom into this sentence' }));
    const target = open.mock.lastCall![0];
    expect(target).toMatchObject({ stepId: 's108', recorded: undefined, sampleTitle: 'Plan', sentence: chips[2]!.textContent });
    expect(target.sentence.replace(/[`*]/g, '').startsWith(target.prompt)).toBe(true);
  });

  it('is one tab stop: arrow keys, Home and End pick and focus another sentence (A5, A6)', async () => {
    const panel = await panelAt('s108', { sampleId: 'planner-pivot', sampleTitle: 'Plan', open: () => {} });
    const chips = [...panel.querySelectorAll<HTMLElement>('.lens-sentence')];
    expect(chips.map((c) => c.getAttribute('tabindex'))).toEqual(chips.map((_, i) => (i === 0 ? '0' : '-1')));
    fireEvent.keyDown(chips[0]!, { key: 'ArrowRight' });
    expect(chips[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(chips[1]!.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(chips[1]);
    fireEvent.keyDown(chips[1]!, { key: 'End' });
    expect(document.activeElement).toBe(chips.at(-1));
    fireEvent.keyDown(chips.at(-1)!, { key: 'ArrowDown' });
    expect(chips.at(-1)!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(chips.at(-1)!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(chips.at(-2));
    fireEvent.keyDown(chips.at(-2)!, { key: 'Home' });
    expect(document.activeElement).toBe(chips[0]);
    expect(document.getElementById(chips[0]!.getAttribute('aria-describedby')!)?.textContent).toBe('Arrow keys pick another sentence.');
    const zoom = screen.getByRole('button', { name: 'Zoom into this sentence' });
    const described = zoom.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual([chips[0]!.textContent, 'Not recorded · grows live if you opt in']);
  });

  it('is not offered without the website lens, nor on a tool step', async () => {
    let panel = await panelAt('s108', null);
    expect(panel.querySelector('.lens-sentence')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom into this sentence' })).toBeNull();
    cleanup();
    const graph = await pivot();
    const tool = graph.steps.find((s) => s.kind === 'tool-call')!;
    panel = await panelAt(tool.id, { sampleId: 'planner-pivot', sampleTitle: 'Plan', open: () => {} });
    expect(screen.queryByRole('button', { name: 'Zoom into this sentence' })).toBeNull();
  });
});
