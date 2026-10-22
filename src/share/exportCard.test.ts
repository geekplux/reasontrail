import { describe, expect, it } from 'vitest';
import { defaultSessionGraph } from '../sessions/samples';
import { CARD_H, CARD_W, cardLabel, cardShapes, cardSvg, cardTitle, fit, pathSegments, wrap, type Measure, type Shape } from './exportCard';

const measure: Measure = (text, font) => text.length * font.size * 0.5;
const colors = { paper: 'var(--p)', ink: 'var(--i)', muted: 'var(--m)', trouble: 'var(--t)', ok: 'var(--o)' };
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
    expect(svg).toMatch(/^<svg [^>]*width="1200" height="630"[^>]*role="img" aria-labelledby="card-title"><title id="card-title">Reasontrail map card: /);
    expect(svg).not.toMatch(/<script/);
  });

  it('draws the brand mark beside the wordmark, its route on the text baseline', () => {
    const reason = texts(shapes)[0]!;
    const marks = shapes.filter((x): x is Extract<Shape, { t: 'line' }> => x.t === 'line' && x.y1 < 100);
    expect(marks).toHaveLength(5);
    expect(marks[0]?.y1).toBeCloseTo(reason.y);
    expect(reason.x).toBeCloseTo(64 + 30 + 10.4);
  });

  it('ends the route in the answer mark and starts it at a trailhead dot', () => {
    const at = (cx: number) => shapes.filter((x) => x.t === 'circle' && x.cx === cx && x.cy === 360);
    expect(at(CARD_W - 64 - 10).map((x) => x.t === 'circle' && x.r)).toEqual([10, 4]);
    expect(at(64 + 8).map((x) => x.t === 'circle' && x.r)).toContain(8);
  });

  it('starts each glance row with a status glyph that is a shape, not only a colour', () => {
    const glyphs = shapes.filter((x): x is Extract<Shape, { t: 'circle' }> => x.t === 'circle' && x.r === 11);
    expect(glyphs).toHaveLength(3);
    // A hollow glyph has a stroke; a filled one carries a paper ✓ or ✕ (two lines each).
    expect(glyphs.every((g) => g.fill !== 'var(--p)' || g.width > 0)).toBe(true);
    const marks = shapes.filter((x) => x.t === 'line' && x.stroke === 'var(--p)');
    expect(marks).toHaveLength(2 * glyphs.filter((g) => g.fill !== 'var(--p)').length);
  });
});

describe('pathSegments and cardTitle', () => {
  it('reads absolute M/H/V/L paths', () => {
    expect(pathSegments('M4.5 20 H11 L19 12 V14')).toEqual([[4.5, 20, 11, 20], [11, 20, 19, 12], [19, 12, 19, 14]]);
  });

  it('keeps only the first sentence when the title opens with a placeholder and the sentence fits', () => {
    const font = { family: 'serif' as const, size: 20 };
    const long = '[secret:github-token] rotate it. Then '.concat('word '.repeat(40));
    expect(cardTitle(long, 400, font, measure)).toEqual(['[secret:github-token] rotate it.']);
    expect(cardTitle(`Plain ${long}`, 400, font, measure)).toEqual(wrap(`Plain ${long}`, 400, font, measure));
  });

  it('says open and resolved trouble counts in the label', () => {
    const g = structuredClone(defaultSessionGraph);
    g.trouble = [...g.trouble, ...g.trouble].map((t, i) => ({ ...t, resolved: i % 2 === 0 }));
    const k = g.trouble.filter((t) => t.resolved).length;
    expect(g.trouble.length).toBeGreaterThan(0);
    expect(cardLabel(g)).toContain(`${g.trouble.length - k} open, ${k} resolved`);
  });
});
