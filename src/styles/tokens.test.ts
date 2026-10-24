import { describe, expect, it } from 'vitest';
import { contrast, deltaE, parseHex, type Cvd } from './colorMath';
import css from './tokens.css?raw';
import favicon from '../../public/favicon.svg?raw';
import indexHtml from '../../index.html?raw';

// Radix Colors 3.0, exactly as in docs/design/v7/PROMPT.md §3.1 (steps 1–12).
const RADIX = {
  light: {
    slate: '#fcfcfd #f9f9fb #f0f0f3 #e8e8ec #e0e1e6 #d9d9e0 #cdced6 #b9bbc6 #8b8d98 #80838d #60646c #1c2024',
    blue: '#fbfdff #f4faff #e6f4fe #d5efff #c2e5ff #acd8fc #8ec8f6 #5eb1ef #0090ff #0588f0 #0d74ce #113264',
    orange: '#fefcfb #fff7ed #ffefd6 #ffdfb5 #ffd19a #ffc182 #f5ae73 #ec9455 #f76b15 #ef5f00 #cc4e00 #582d1d',
  },
  dark: {
    slate: '#111113 #18191b #212225 #272a2d #2e3135 #363a3f #43484e #5a6169 #696e77 #777b84 #b0b4ba #edeef0',
    blue: '#0d1520 #111927 #0d2847 #003362 #004074 #104d87 #205d9e #2870bd #0090ff #3b9eff #70b8ff #c2e6ff',
    orange: '#17120e #1e160f #331e0b #462100 #562800 #66350c #7e451d #a35829 #f76b15 #ff801f #ffa057 #ffe0c2',
  },
} as const;
type Theme = keyof typeof RADIX;
type Scale = keyof (typeof RADIX)['light'];
const THEMES: Theme[] = ['light', 'dark'];
const SCALES: Scale[] = ['slate', 'blue', 'orange'];
const step = (theme: Theme, token: string) => {
  const [, scale, n] = /^(slate|blue|orange)-(\d+)$/.exec(token) ?? [];
  const hex = RADIX[theme][scale as Scale]?.split(' ')[Number(n) - 1];
  if (!hex) throw new Error(`not a Radix token: ${token}`);
  return hex;
};
const ALL_VALUES = new Set(THEMES.flatMap((t) => SCALES.flatMap((s) => RADIX[t][s].split(' '))));

/** `--name: #hex` declarations in a CSS fragment. */
const declared = (fragment: string) => Object.fromEntries([...fragment.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map((m) => [m[1], m[2]!.toLowerCase()]));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const tokens = { light: declared(css.slice(0, darkStart)), dark: declared(css.slice(darkStart)) };

describe('colorMath', () => {
  it('computes WCAG contrast at the known extremes', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(parseHex('#1F4535')).toEqual([31, 69, 53]);
  });

  it('keeps greys grey under every simulation and separates red from green in normal vision only', () => {
    for (const v of [undefined, 'protanopia', 'deuteranopia', 'tritanopia'] as const) expect(deltaE('#808080', '#808080', v)).toBeLessThan(1e-9);
    expect(deltaE('#d62728', '#2ca02c')).toBeGreaterThan(deltaE('#d62728', '#2ca02c', 'deuteranopia'));
  });
});

describe.each(THEMES)('tokens.css, %s theme', (theme) => {
  it.each(SCALES)('declares --%s-1 … 12 with the Radix values', (scale) => {
    const expected = Object.fromEntries(RADIX[theme][scale].split(' ').map((hex, i) => [`${scale}-${i + 1}`, hex]));
    const actual = Object.fromEntries(Object.entries(tokens[theme]).filter(([k]) => k.startsWith(`${scale}-`)));
    expect(actual).toEqual(expected);
  });

  it('declares no other colour token', () => {
    expect(Object.keys(tokens[theme]).filter((k) => !/^(slate|blue|orange)-\d+$/.test(k))).toEqual([]);
  });

  // Text roles (§3.1): ink slate-12 and muted slate-11 on the page and soft fills; blue-11 text sits on slate-1 and
  // slate-2 only (in light it is 4.19:1 on slate-3 and 4.25:1 on blue-3, below AA, so text there stays slate-12).
  const TEXT: [string, string][] = [
    ...['slate-1', 'slate-2', 'slate-3'].flatMap((bg) => [['slate-12', bg], ['slate-11', bg]] as [string, string][]),
    ['blue-11', 'slate-1'],
    ['blue-11', 'slate-2'],
    ['orange-12', 'orange-3'], // a deleted diff line
  ];
  it.each(TEXT)('%s text on %s reaches AA (4.5:1)', (fg, bg) => {
    expect(contrast(step(theme, fg), step(theme, bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('CVD distance (CIE76 ΔE after Machado 2009 simulation)', () => {
  const PAIRS = [['blue-9', 'orange-9'], ['blue-9', 'slate-12'], ['orange-9', 'slate-12']] as const;
  const VISION: (Cvd | 'normal')[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'];
  const cases = THEMES.flatMap((t) => PAIRS.flatMap(([a, b]) => VISION.map((v) => [t, a, b, v] as const)));
  it.each(cases)('%s %s vs %s stays >= 20 (%s vision)', (theme, a, b, v) => {
    expect(deltaE(step(theme, a), step(theme, b), v === 'normal' ? undefined : v)).toBeGreaterThanOrEqual(20);
  });
});

describe('every colour in src/**/*.css is a Radix token or value', () => {
  const sources = import.meta.glob('../**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const files = Object.keys(sources);
  it('finds the stylesheets', () => expect(files.length).toBeGreaterThan(10));
  const KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'none']);
  const COLOUR_PROPS = /(?:^|[;{\s])((?:background|background-color|color|fill|stroke|outline|outline-color|border(?:-(?:top|right|bottom|left))?(?:-color)?|box-shadow|text-decoration(?:-color)?|accent-color|caret-color|border-image)\s*:\s*[^;}]+)/gi;
  it.each(Object.keys(sources))('%s', (file) => {
    const text = sources[file]!.replace(/\/\*[\s\S]*?\*\//g, '');
    const bad: string[] = [];
    // Local aliases of a Radix step (e.g. the garden's `--tg-band`) count as Radix.
    const aliases = new Set([...text.matchAll(/--([\w-]+):\s*var\(--(?:slate|blue|orange)-(?:[1-9]|1[0-2])\)/g)].map((m) => m[1]));
    // Literal colours anywhere (outside the Radix values the token file declares).
    for (const m of text.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/gi)) {
      if (!ALL_VALUES.has(m[0].toLowerCase())) bad.push(m[0]);
    }
    // Every var() in a colour property names a Radix step or a token built from them (--hair, --frame).
    for (const [, decl] of text.matchAll(COLOUR_PROPS)) {
      for (const [, name] of decl!.matchAll(/var\(--([\w-]+)/g)) {
        if (!/^(slate|blue|orange)-([1-9]|1[0-2])$|^(hair|hair-soft|frame)$/.test(name!) && !aliases.has(name)) bad.push(`var(--${name})`);
      }
      // Named colours: any bare word that is not a keyword, unit, or known non-colour value.
      const words = decl!.replace(/var\([^)]*\)|url\([^)]*\)|[\w-]+\(/g, ' ').split(':').slice(1).join(':').match(/\b[a-z]+\b/gi) ?? [];
      for (const w of words) if (/^(red|green|blue|black|white|gray|grey|orange|yellow|purple|pink|navy|teal|silver)$/i.test(w) && !KEYWORDS.has(w.toLowerCase())) bad.push(w);
    }
    expect(bad).toEqual([]);
  });
});

describe('static assets', () => {
  it('index.html theme-color is --slate-1 per theme', () => {
    for (const theme of THEMES) {
      const meta = new RegExp(`name="theme-color"\\s+content="(#[0-9a-f]{3,6})"\\s+media="\\(prefers-color-scheme: ${theme}\\)"`, 'i');
      expect(meta.exec(indexHtml)?.[1]?.toLowerCase()).toBe(step(theme, 'slate-1'));
    }
  });

  it('the favicon is the veined leaf in blue-9 and orange-9 with the vein cut out', () => {
    expect(favicon).toContain('<path d="M6 58C6 28 28 6 58 6Z" fill="#0090ff"/>');
    expect(favicon).toContain('<path d="M6 58C36 58 58 36 58 6Z" fill="#f76b15"/>');
    expect(favicon).toMatch(/<mask id="vein">[\s\S]*stroke="#000" stroke-width="2.8"/);
  });
});
