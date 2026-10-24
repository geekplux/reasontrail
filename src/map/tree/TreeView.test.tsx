// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SessionGraph } from '../../../shared/session/types';
import implementer from '../../sessions/samples/implementer-checks.graph.json';
import vff from '../../sessions/samples/verify-fail-fix.graph.json';
import { MIN_BOX } from '.';
import { TreeLegend } from './TreeLegend';
import { TreeView } from './TreeView';
import { treeFor, treeSummary } from './view';

afterEach(cleanup);
const VFF = vff as unknown as SessionGraph;
const t = treeFor(VFF, 1200, 520);

/** The tree with its hover state held like the home holds it. */
function Hovered({ g = VFF }: { g?: SessionGraph }) {
  const [hover, setHover] = useState<string>();
  return <TreeView g={g} width={1200} height={520} hover={hover} onHover={setHover} />;
}

describe('TreeView', () => {
  it('draws one twig per tool call and thinking step, one glyph per episode and one ◉ per lane answer', () => {
    const { container } = render(<TreeView g={VFF} width={1200} height={520} />);
    expect(container.querySelectorAll('path.tw')).toHaveLength(t.twigs.length);
    expect(container.querySelectorAll('path.tw.fail')).toHaveLength(t.twigs.filter((w) => w.kind === 'failed').length);
    expect(container.querySelectorAll('path.x')).toHaveLength(t.twigs.filter((w) => w.mark === 'x').length);
    expect(container.querySelectorAll('path.leaf')).toHaveLength(t.twigs.filter((w) => w.mark === 'leaf').length);
    expect(container.querySelectorAll('circle.bud')).toHaveLength(t.twigs.filter((w) => w.mark === 'bud').length);
    expect(container.querySelectorAll('path.b')).toHaveLength(t.ribbons.length);
    expect(container.querySelectorAll('.t-node')).toHaveLength(t.episodes.length + t.tips.filter((m) => m.kind === 'answer').length);
    expect(container.querySelectorAll('.t-node.tip-fail')).toHaveLength(1);
    expect(container.querySelectorAll('.t-node.tip-ok')).toHaveLength(1);
    expect(container.querySelectorAll('path.back')).toHaveLength(2);
    const texts = [...container.querySelectorAll('text')].map((el) => el.textContent);
    expect(texts).toEqual(expect.arrayContaining(['Task', '0 min', 'Verify phase 12', 'Failed: 1 gap', 'Verifier, 33 min', 'Re-verify phase 12', 'Passed', '7']));
  });

  it('is an image named by a factual summary; the list is the operable structure', () => {
    render(<TreeView g={VFF} width={1200} height={520} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toBe(treeSummary(VFF));
    expect(img.querySelector('[tabindex]')).toBeNull();
  });

  it('draws nothing below the minimum box, without crashing', () => {
    const { container } = render(<TreeView g={VFF} width={MIN_BOX.width - 1} height={520} />);
    expect(container.innerHTML).toBe('');
    const { container: thin } = render(<TreeView g={VFF} width={1200} height={MIN_BOX.height - 1} />);
    expect(thin.innerHTML).toBe('');
  });

  it('hover: a pointer within 12px of a twig keeps its episode path ink, fades the rest and shows the tooltip', () => {
    const { container } = render(<Hovered />);
    const svg = container.querySelector('svg.tree')!;
    const twig = t.twigs.find((w) => w.episodeId === 'e19' && w.kind === 'call')!;
    fireEvent.pointerMove(svg, { clientX: (twig.base.x + twig.tip.x) / 2, clientY: (twig.base.y + twig.tip.y) / 2 + 3, pointerType: 'mouse' });
    expect(svg.classList.contains('hvmode')).toBe(true);
    expect(container.querySelector('.hv-path.on')?.children.length).toBe(t.paths.e19?.length);
    expect([...container.querySelectorAll('path.b.hv')].length).toBeGreaterThan(0);
    expect(container.querySelectorAll('path.tw.hv')).toHaveLength(t.twigs.filter((w) => w.episodeId === 'e19').length);
    expect([...container.querySelectorAll('.tip text')].map((el) => el.textContent)).toEqual(['7', 'Edit zz-verify-scratch.test.ts +8 more', '20 steps, 6 tool calls, 15 min wait, 17 min']);
    expect(container.querySelector('.tip-box')?.getAttribute('rx')).toBe('10');
    fireEvent.pointerLeave(svg);
    expect(svg.classList.contains('hvmode')).toBe(false);
    expect(container.querySelector('.tip')).toBeNull();
    // The path stays drawn, transparent, so it fades out.
    expect(container.querySelector('.hv-path:not(.on)')?.children.length).toBe(t.paths.e19?.length);
  });

  it('hover: nothing farther than 12px; touch is left alone', () => {
    const { container } = render(<Hovered />);
    const svg = container.querySelector('svg.tree')!;
    fireEvent.pointerMove(svg, { clientX: 1190, clientY: 10, pointerType: 'mouse' });
    expect(svg.classList.contains('hvmode')).toBe(false);
    const twig = t.twigs.find((w) => w.episodeId === 'e19')!;
    fireEvent.pointerMove(svg, { clientX: twig.tip.x, clientY: twig.tip.y, pointerType: 'touch' });
    expect(svg.classList.contains('hvmode')).toBe(false);
  });

  it('draws another sample from its own data', () => {
    const { container } = render(<TreeView g={implementer as unknown as SessionGraph} width={1200} height={520} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Tree: 12 episodes, .*all by the main agent\.$/);
    expect(container.querySelectorAll('path.back')).toHaveLength(0);
  });
});

describe('TreeLegend', () => {
  it('lists the five glyphs, the three twigs and the width rule, as on the canvas', () => {
    const { container } = render(<TreeLegend />);
    expect([...container.querySelectorAll('.legend > span')].map((s) => s.textContent).filter(Boolean)).toEqual(['Task', 'Explore', 'Change', 'Verify', 'Answer', 'Command', 'Thinking', 'Failed', 'Width: tool calls']);
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(9);
  });
});
