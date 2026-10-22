import { describe, expect, it } from 'vitest';
import { sessionSamples } from '../sessions/samples';
import { lensSamples } from './lensSamples';
import { openingWords, plainText, splitSentences } from './sentences';

describe('splitSentences', () => {
  it('splits at sentence ends and line breaks, with offsets into the source', () => {
    const text = 'First one is here. Is this the second one? Yes!\n\n- **Bold:** a bullet with `code` in it.';
    const out = splitSentences(text);
    expect(out.map((s) => s.text)).toEqual(['First one is here.', 'Is this the second one?', 'Yes!', '- **Bold:** a bullet with `code` in it.']);
    for (const s of out) expect(text.slice(s.start, s.end)).toBe(s.text);
    expect(out.map((s) => s.zoomable)).toEqual([true, true, false, true]);
  });

  it('keeps decimals, versions and paths inside a sentence', () => {
    expect(splitSentences('It is 8.9 percent in v1.2 of src/a.ts now. Next.').map((s) => s.text)).toEqual(['It is 8.9 percent in v1.2 of src/a.ts now.', 'Next.']);
  });

  it('does not offer table rows, code fences or short fragments', () => {
    const out = splitSentences('| a | b | c | d |\n```ts long code fence here\n**What works now**');
    expect(out.map((s) => s.zoomable)).toEqual([false, false, false]);
  });

  it('handles empty text and text without an end mark', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('  no end mark here at all ')).toEqual([{ text: 'no end mark here at all', start: 2, end: 25, zoomable: true }]);
  });

  it.each(lensSamples)('$gardenId: the recorded sentence is one sentence of its step', async (l) => {
    const graph = await sessionSamples.find((s) => s.id === l.sampleId)!.load();
    const text = graph.steps.find((s) => s.id === l.stepId)?.text ?? '';
    expect(splitSentences(text).filter((s) => s.zoomable).map((s) => s.text)).toContain(l.sentence);
  });
});

describe('openingWords', () => {
  it('takes up to eight words and leaves at least two to predict', () => {
    expect(openingWords('Now the planner rewrites the plan for the reasoning map (phases 1–9 kept).')).toBe('Now the planner rewrites the plan for the');
    expect(openingWords('Four words in here.')).toBe('Four words');
    expect(openingWords('Two words')).toBe('Two');
  });

  it('drops markdown marks', () => {
    expect(plainText('- **Keyboard:** the `garden`   is one Tab stop.')).toBe('Keyboard: the garden is one Tab stop.');
    expect(openingWords('- **Keyboard:** the garden is one Tab stop.')).toBe('Keyboard: the garden is one');
  });
});
