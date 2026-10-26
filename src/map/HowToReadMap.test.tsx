// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HowToReadMap } from './HowToReadMap';

afterEach(cleanup);

describe('How to read a map (v7 §7)', () => {
  it('is one figure (the real tree renderer on the default sample, with the legend) and two paragraphs', () => {
    const { container } = render(<HowToReadMap />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How to read a map');
    const figures = container.querySelectorAll('figure');
    expect(figures).toHaveLength(1);
    const tree = figures[0]!.querySelector('svg.tree[role="img"]');
    expect(tree?.getAttribute('aria-label')).toMatch(/^Tree: \d+ episodes, \d+ tool calls/);
    expect(tree?.getAttribute('height')).toBe('340');
    expect(tree?.querySelectorAll('path.tw').length).toBeGreaterThan(0);
    expect(figures[0]!.querySelector('.legend')?.textContent).toBe('TaskExploreChangeVerifyAnswerCommandThinkingFailedWidth: tool calls');
    const paragraphs = [...container.querySelectorAll('.how-text p')].map((p) => p.textContent ?? '');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatch(/trunk is the main agent.*limb.*branch is an episode.*Twigs are tool calls.*width/s);
    expect(paragraphs[1]).toMatch(/main rail.*subagent forks.*select a step/s);
    expect(container.textContent).not.toContain('·');
  });
});
