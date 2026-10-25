// @vitest-environment happy-dom
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CAP_NOTE, LensFrame } from './LensFrame';
import { lensSamples } from './lensSamples';
import type { LensTarget } from './lensTarget';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

const liveOnly: LensTarget = { sentence: 'The build passes on the second try.', prompt: 'The build passes', stepId: 's9', where: 'Checks', sampleTitle: undefined, recorded: undefined };

async function renderLens(target: LensTarget) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <LensFrame target={target} focusOnOpen={false} onBack={() => {}} />
      </Suspense>,
    );
  });
}
const capLines = () => screen.queryAllByText(CAP_NOTE);

describe('LensFrame daily-cap note', () => {
  it('says live calls are capped per day next to the opt-in and while live growth is on', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await renderLens(liveOnly);
    expect(capLines()).toHaveLength(1);
    expect(capLines()[0]?.className).toBe('lens-cap');
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grow live with an open model' }));
    });
    expect(document.getElementById('lens-live')).not.toBeNull();
    expect(capLines()).toHaveLength(1);
  });

  it('keeps it with the opt-in in More options for a recorded sentence, and has no middle dot', async () => {
    const rec = lensSamples[0]!;
    await renderLens({ sentence: rec.sentence, prompt: '', stepId: rec.stepId, where: 'Checks', sampleTitle: undefined, recorded: rec });
    const cap = await screen.findAllByText(CAP_NOTE, {}, { timeout: 3000 });
    expect(cap).toHaveLength(1);
    expect(cap[0]!.closest('.lens-options')).not.toBeNull();
    expect(cap[0]!.previousElementSibling?.querySelector('button')?.textContent).toBe('Grow live with an open model');
    expect(CAP_NOTE).not.toContain('·');
  });
});
