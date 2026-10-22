import { describe, expect, it } from 'vitest';
import { defaultSessionGraph } from '../sessions/samples';
import { CARD_H, CARD_W, cardLabel, cardShapes, cardSvg, fit, wrap, type Measure, type Shape } from './exportCard';

const measure: Measure = (text, font) => text.length * font.size * 0.5;
const colors = { paper: 'var(--p)', ink: 'var(--i)', muted: 'var(--m)', trouble: 'var(--t)' };
const fonts = { serif: 'serif', ui: 'sans-serif', mono: 'monospace' };
const texts = (s: Shape[]) => s.flatMap((x) => (x.t === 'text' ? [x] : []));

describe('wrap and fit', () => {
  it('wraps to two lines and ends a cut line with an ellipsis', () => {
    const font = { family: 'serif' as const, size: 20 };
    const lines = wrap('one two three four five six seven eight nine ten', 100, font, measure);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
    expect(lines.every((l) => measure(l, font) <= 100)).toBe(true);
    expect(fit('short', 100, font, measure)).toBe('short');
  });
});

describe('cardShapes', () => {
  const shapes = cardShapes(defaultSessionGraph, colors, measure);

  it('fills the 1200×630 paper and keeps every text inside it', () => {
    expect(shapes[0]).toEqual({ t: 'rect', x: 0, y: 0, w: CARD_W, h: CARD_H, fill: 'var(--p)' });
    for (const t of texts(shapes)) {
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(CARD_H);
      const w = measure(t.text, t.font);
      const left = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + w).toBeLessThanOrEqual(CARD_W);
    }
  });

  it('has the wordmark, a serif title of at most 2 lines, three glance rows in 24 px and the redacted mark', () => {
    const t = texts(shapes);
    expect(t.slice(0, 2).map((x) => x.text).join('')).toBe('reasontrail');
    const title = t.filter((x) => x.font.family === 'serif' && x.font.size === 48);
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(2);
    expect(t.filter((x) => x.font.size === 24 && x.font.weight === 600 && x.x > 64 + 20)).toHaveLength(3);
    expect(t.at(-1)?.text).toBe('Redacted copy · reasontrail');
  });

  it('numbers each blaze, and marks open ones by fill shape as well as colour', () => {
    const badges = shapes.filter((s): s is Extract<Shape, { t: 'circle' }> => s.t === 'circle' && s.r === 20);
    expect(badges.length).toBeGreaterThan(0);
    const open = defaultSessionGraph.trouble.some((x) => !x.resolved);
    expect(badges.some((b) => b.fill === 'var(--t)')).toBe(open);
  });

  it('writes an SVG of the same size with an accessible label', () => {
    const svg = cardSvg(shapes, fonts, cardLabel(defaultSessionGraph));
    expect(svg).toMatch(/^<svg [^>]*width="1200" height="630"[^>]*role="img" aria-label="Reasontrail map card: /);
    expect(svg).not.toMatch(/<script/);
  });
});
