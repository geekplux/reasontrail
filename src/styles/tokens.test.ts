import { describe, expect, it } from 'vitest';
import { contrast, deltaE, parseHex, type Cvd } from './colorMath';
import css from './tokens.css?raw';
import favicon from '../../public/favicon.svg?raw';
import logo from '../../public/logo.svg?raw';
import indexHtml from '../../index.html?raw';

/** Extracts `--tg-*: #hex` declarations from a CSS fragment. */
function colours(fragment: string): Record<string, string> {
  return Object.fromEntries([...fragment.matchAll(/--tg-([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map((m) => [m[1], m[2]]));
}
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const themes = { light: colours(css.slice(0, darkStart)), dark: colours(css.slice(darkStart)) };
type Theme = keyof typeof themes;
const c = (theme: Theme, name: string) => {
  const hex = themes[theme][name];
  if (!hex) throw new Error(`--tg-${name} missing in ${theme} theme`);
  return hex;
};

// PLAN §3.2: contrast of each token on --tg-paper.
const CONTRAST: Record<Theme, Record<string, number>> = {
  light: {
    surface: 1.09, ink: 14.1, 'ink-muted': 6.5, rule: 1.35, 'branch-lo': 4.1, 'branch-mid': 6.3,
    'branch-hi': 9.7, accent: 4.5, focus: 5.6, error: 6.5,
  },
  dark: {
    surface: 1.09, ink: 15.3, 'ink-muted': 8.4, rule: 1.46, 'branch-lo': 6.5, 'branch-mid': 10.4,
    'branch-hi': 14.4, accent: 8.5, focus: 8.4, error: 8.2,
  },
};
const TEXT = ['ink', 'ink-muted', 'accent', 'error'];
const MARKS = ['branch-lo', 'branch-mid', 'branch-hi', 'focus'];

// PLAN §3.2 CVD table: the rows that must stay >= 20 under every vision type.
const DISTINCT: [Theme, string, string][] = [
  ['light', 'accent', 'branch-hi'],
  ['light', 'accent', 'branch-lo'],
  ['light', 'focus', 'branch-hi'],
  ['dark', 'accent', 'branch-hi'],
  ['dark', 'focus', 'branch-hi'],
];
const VISION: (Cvd | undefined)[] = [undefined, 'protanopia', 'deuteranopia', 'tritanopia'];

describe('colorMath', () => {
  it('computes WCAG contrast at the known extremes', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(parseHex('#1F4535')).toEqual([31, 69, 53]);
  });

  it('keeps greys grey under every simulation and separates red from green in normal vision only', () => {
    for (const v of VISION) expect(deltaE('#808080', '#808080', v)).toBeLessThan(1e-9);
    expect(deltaE('#d62728', '#2ca02c')).toBeGreaterThan(deltaE('#d62728', '#2ca02c', 'deuteranopia'));
  });
});

describe.each(Object.keys(themes) as Theme[])('tokens.css %s theme', (theme) => {
  it.each(Object.entries(CONTRAST[theme]))('--tg-%s has contrast %s on paper (±0.1)', (name, expected) => {
    expect(Math.abs(contrast(c(theme, name), c(theme, 'paper')) - expected)).toBeLessThanOrEqual(0.1);
  });

  const pairs = ['paper', 'surface'].flatMap((bg) => [
    ...TEXT.map((fg) => [fg, bg, 4.5] as const),
    ...MARKS.map((fg) => [fg, bg, 3] as const),
  ]);
  it.each(pairs)('--tg-%s on --tg-%s reaches %s:1 (text AA, marks 3:1)', (fg, bg, min) => {
    expect(contrast(c(theme, fg), c(theme, bg))).toBeGreaterThanOrEqual(min);
  });
});

describe('CVD distance (CIE76 ΔE after Machado 2009 simulation)', () => {
  const cases = DISTINCT.flatMap(([theme, a, b]) => VISION.map((v) => [theme, a, b, v ?? 'normal'] as const));
  it.each(cases)('%s --tg-%s vs --tg-%s stays >= 20 (%s vision)', (theme, a, b, v) => {
    expect(deltaE(c(theme, a), c(theme, b), v === 'normal' ? undefined : v)).toBeGreaterThanOrEqual(20);
  });
});

// Static assets cannot read CSS variables, so they carry copies of the palette; keep them in step with tokens.css.
describe('static assets match tokens.css', () => {
  const lower = (hex: string) => hex.toLowerCase();
  it.each([['favicon.svg', favicon], ['logo.svg', logo]])('%s draws in --tg-branch-hi per theme', (_, svg) => {
    const light = /svg\s*\{\s*color:\s*(#[0-9a-f]{3,6})/i.exec(svg.slice(0, svg.indexOf('@media')))?.[1];
    const dark = /prefers-color-scheme:\s*dark\)\s*\{\s*svg\s*\{\s*color:\s*(#[0-9a-f]{3,6})/i.exec(svg)?.[1];
    expect([light && lower(light), dark && lower(dark)]).toEqual([lower(c('light', 'branch-hi')), lower(c('dark', 'branch-hi'))]);
  });

  it.each(Object.keys(themes) as Theme[])('index.html theme-color for %s is --tg-paper', (theme) => {
    const meta = new RegExp(`name="theme-color"\\s+content="(#[0-9a-f]{3,6})"\\s+media="\\(prefers-color-scheme: ${theme}\\)"`, 'i');
    expect(lower(meta.exec(indexHtml)?.[1] ?? 'missing')).toBe(lower(c(theme, 'paper')));
  });
});
