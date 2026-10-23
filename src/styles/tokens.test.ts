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

// Contrast of each token on --tg-paper (the Wayfind palette, Hallmark redesign 2026-10-23; was PLAN §3.2's).
const CONTRAST: Record<Theme, Record<string, number>> = {
  light: {
    surface: 1.13, ink: 17.01, 'ink-muted': 6.48, rule: 1.64, 'branch-lo': 3.9, 'branch-mid': 7.4,
    'branch-hi': 13.59, accent: 5.33, focus: 5.33, error: 5.63, ok: 5.33, trouble: 3.86, wash: 1.07, lane: 4.08, 'lane-band': 1.12,
  },
  dark: {
    surface: 1.08, ink: 17.54, 'ink-muted': 9.2, rule: 1.49, 'branch-lo': 5.87, 'branch-mid': 9.9,
    'branch-hi': 14.59, accent: 7.22, focus: 7.22, error: 11.13, ok: 6.73, trouble: 10.77, wash: 1.3, lane: 5.84, 'lane-band': 1.06,
  },
};
const TEXT = ['ink', 'ink-muted', 'accent', 'error'];
const MARKS = ['branch-lo', 'branch-mid', 'branch-hi', 'focus', 'ok', 'trouble', 'lane'];

// PLAN §3.2 CVD table: the rows that must stay >= 20 under every vision type.
const DISTINCT: [Theme, string, string][] = [
  ['light', 'accent', 'branch-hi'],
  ['light', 'accent', 'branch-lo'],
  ['light', 'focus', 'branch-hi'],
  ['dark', 'accent', 'branch-hi'],
  ['dark', 'focus', 'branch-hi'],
  // DESIGN §6.3: did it pass, and where did it struggle?
  ['light', 'ok', 'trouble'],
  ['dark', 'ok', 'trouble'],
  ['light', 'ok', 'ink'],
  ['dark', 'ok', 'ink'],
  ['light', 'trouble', 'ink'],
  ['dark', 'trouble', 'ink'],
  // DESIGN §6.3: side trails against the route and the two hues (ok / lane light tritan is 16: cued by shape, not listed)
  ['light', 'trouble', 'lane'],
  ['dark', 'trouble', 'lane'],
  ['light', 'lane', 'ink'],
  ['dark', 'lane', 'ink'],
];

// DESIGN §6.2: text on the wash background and glyph interiors (paper) on the ok and trouble plates.
const ON: [Theme, string, string, number][] = [
  ['light', 'error', 'wash', 5.25],
  ['dark', 'error', 'wash', 8.59],
  ['light', 'ink', 'wash', 15.87],
  ['light', 'ink-muted', 'wash', 6.05],
  ['dark', 'ink', 'wash', 13.54],
  ['dark', 'ink-muted', 'wash', 7.11],
  ['light', 'surface', 'ok', 6.01],
  ['light', 'surface', 'trouble', 4.36],
  ['dark', 'paper', 'ok', 6.73],
  ['dark', 'paper', 'trouble', 10.77],
  // The expanded-lane band: its 3 px stroke (mark) and the text and glyphs on it (§6.2)
  ['light', 'lane', 'lane-band', 3.64],
  ['dark', 'lane', 'lane-band', 5.52],
  ['light', 'ink', 'lane-band', 15.17],
  ['light', 'ink-muted', 'lane-band', 5.78],
  ['light', 'ok', 'lane-band', 4.75],
  ['light', 'trouble', 'lane-band', 3.44],
  ['dark', 'ink', 'lane-band', 16.56],
  ['dark', 'ink-muted', 'lane-band', 8.69],
  ['dark', 'ok', 'lane-band', 6.35],
  ['dark', 'trouble', 'lane-band', 10.17],
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

describe('map tokens on their backgrounds (DESIGN §6.2)', () => {
  it.each(ON)('%s --tg-%s on --tg-%s is %s:1 (±0.1)', (theme, fg, bg, expected) => {
    expect(Math.abs(contrast(c(theme, fg), c(theme, bg)) - expected)).toBeLessThanOrEqual(0.1);
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
  it.each([['favicon.svg', favicon], ['logo.svg', logo]])('%s draws in --tg-ink per theme (DESIGN §4.1)', (_, svg) => {
    const light = /svg\s*\{\s*color:\s*(#[0-9a-f]{3,6})/i.exec(svg.slice(0, svg.indexOf('@media')))?.[1];
    const dark = /prefers-color-scheme:\s*dark\)\s*\{\s*svg\s*\{\s*color:\s*(#[0-9a-f]{3,6})/i.exec(svg)?.[1];
    expect([light && lower(light), dark && lower(dark)]).toEqual([lower(c('light', 'ink')), lower(c('dark', 'ink'))]);
  });

  it.each(Object.keys(themes) as Theme[])('index.html theme-color for %s is --tg-paper', (theme) => {
    const meta = new RegExp(`name="theme-color"\\s+content="(#[0-9a-f]{3,6})"\\s+media="\\(prefers-color-scheme: ${theme}\\)"`, 'i');
    expect(lower(meta.exec(indexHtml)?.[1] ?? 'missing')).toBe(lower(c(theme, 'paper')));
  });
});

describe('the lane colour is never text (DESIGN §6.2, DM3)', () => {
  const sources = import.meta.glob(['../**/*.css', '../**/*.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  it.each(Object.keys(sources))('%s', (file) => {
    expect(sources[file]).not.toMatch(/(^|[^-])color:\s*var\(--tg-lane\)/);
    expect(sources[file]).not.toMatch(/fill:\s*var\(--tg-lane\)/);
  });
});
