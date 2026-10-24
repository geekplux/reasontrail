import { describe, expect, it } from 'vitest';
import { defaultSessionGraph } from '../sessions/samples';
import { CARD_H, CARD_W, balance, cardLabel, cardShapes, cardSvg, cardTitle, fit, onTrouble, wrap, type Measure, type Shape } from './exportCard';

const measure: Measure = (text, font) => text.length * font.size * 0.5;
const colors = { paper: 'var(--p)', ink: 'var(--i)', muted: 'var(--m)', trouble: 'var(--t)', ok: 'var(--o)' };
const fonts = { sans: 'sans-serif', mono: 'monospace' };
const texts = (s: Shape[]) => s.flatMap((x) => (x.t === 'text' ? [x] : []));

describe('wrap and fit', () => {
  it('wraps to two lines and ends a cut line with an ellipsis', () => {
    const font = { family: 'sans' as const, size: 20 };
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

  it('has the wordmark, a title of at most 2 lines, three glance rows in 24 px and the redacted mark', () => {
    const t = texts(shapes);
    expect(t[0]?.text).toBe('Reasontrail');
    const title = t.filter((x) => x.font.family === 'sans' && x.font.size === 48);
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(2);
    expect(t.filter((x) => x.font.size === 24 && x.font.weight === 600 && x.x > 64 + 20)).toHaveLength(3);
    expect(t.at(-1)?.text).toBe('Redacted copy');
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
    expect(svg).toContain('<path transform="translate(62 42) scale(0.625)" d="M6 58C6 28 28 6 58 6Z" fill="#0090ff"/>');
  });

  it('draws the veined leaf before the wordmark: blue and orange halves, the vein in the page colour', () => {
    const name = texts(shapes)[0]!;
    const leaf = shapes.filter((x): x is Extract<Shape, { t: 'path' }> => x.t === 'path');
    expect(leaf.map((p) => [p.fill, p.stroke])).toEqual([['#0090ff', 'none'], ['#f76b15', 'none'], ['none', 'var(--p)']]);
    expect(leaf.every((p) => p.x + 64 * p.k < name.x)).toBe(true);
  });

  it('ends the route in the answer mark and starts it at a trailhead dot', () => {
    const at = (cx: number) => shapes.filter((x) => x.t === 'circle' && x.cx === cx && x.cy === 360);
    expect(at(CARD_W - 64 - 10).map((x) => x.t === 'circle' && x.r)).toEqual([10, 4]);
    expect(at(64 + 8).map((x) => x.t === 'circle' && x.r)).toContain(8);
  });

  it('starts each glance row with a glyph that is a shape, not only a colour, as on the map', () => {
    // The verify row: a status disc or ring; the trouble row: a "!" plate; the files row: a filled square.
    const glyphs = shapes.filter((x): x is Extract<Shape, { t: 'circle' }> => x.t === 'circle' && x.r === 11);
    expect(glyphs).toHaveLength(1);
    expect(glyphs.every((g) => g.fill !== 'var(--p)' || g.width > 0)).toBe(true);
    const open = defaultSessionGraph.trouble.some((t) => !t.resolved);
    const marks = shapes.filter((x) => x.t === 'line' && x.stroke === 'var(--p)');
    expect(marks).toHaveLength(2 * glyphs.filter((g) => g.fill !== 'var(--p)').length + (open ? 1 : 0));
  });
});

describe('cardTitle', () => {
  it('keeps only the first sentence when the title opens with a placeholder and the sentence fits', () => {
    const font = { family: 'sans' as const, size: 20 };
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

describe('card polish (phase 25)', () => {
  const font = { family: 'sans' as const, size: 20 };
  it('never leaves one lone word on the last title line (SC1)', () => {
    expect(balance(['one two three', 'four'], 200, font, measure)).toEqual(['one two', 'three four']);
    expect(balance(['one two', 'three four'], 200, font, measure)).toEqual(['one two', 'three four']);
    expect(balance(['one', 'two'], 200, font, measure)).toEqual(['one', 'two']);
  });
  it('writes alt text without doubled stops (SD4)', () => {
    const label = cardLabel({ ...defaultSessionGraph, displayTitle: 'A title…' });
    expect(label).not.toMatch(/…\.|\.\./);
    expect(label).toMatch(/^Reasontrail map card: A title\. /);
  });
  it('draws the trouble and files rows with the map\'s square glyphs (SC2)', () => {
    const shapes = cardShapes(defaultSessionGraph, colors, measure);
    expect(shapes.filter((x) => x.t === 'rect' && x.w === 14 && x.fill === 'var(--i)')).toHaveLength(1);
    expect(shapes.some((x) => x.t === 'rect' && x.w === 20)).toBe(true);
  });
});

describe('marks on the trouble fill', () => {
  const light = { paper: '#fcfcfd', ink: '#1c2024', muted: '#60646c', trouble: '#f76b15', ok: '#0090ff' };
  const dark = { paper: '#111113', ink: '#edeef0', muted: '#b0b4ba', trouble: '#f76b15', ok: '#0090ff' };
  it('uses whichever of ink and paper contrasts more with orange-9', () => {
    expect(onTrouble(light)).toBe(light.ink);
    expect(onTrouble(dark)).toBe(dark.paper);
  });
  it('draws the open blaze numbers in ink in the light theme', () => {
    const g = structuredClone(defaultSessionGraph);
    g.trouble = g.trouble.map((t) => ({ ...t, resolved: false }));
    const badges = texts(cardShapes(g, light, measure)).filter((t) => t.font.size === 18 && t.font.family === 'sans');
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((b) => b.fill === light.ink)).toBe(true);
  });
});
