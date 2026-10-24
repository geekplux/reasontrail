// The map card (DESIGN §13.9, DM37): the glance view as a 1200×630 picture for a PR or a post. Page background,
// wordmark top-left, the task title in sans 600 48 (2 lines at most), the route alone with numbered blazes at y = 360,
// the three At a glance rows in UI 24 (with the map's glyphs), and "Redacted copy" in mono at the bottom right. Colours come
// from the theme tokens (light or night); meaning never rests on colour: open blazes are filled, resolved ones hollow,
// and each glance row starts with a symbol and says its status in words. One list of shapes feeds both the SVG and the
// canvas (the canvas uses the page's loaded fonts, which an SVG drawn as an image cannot).
import type { SessionGraph } from '../../shared/session/types';
import { glanceLayout } from '../map/layout';
import { glance } from '../map/outline';
import { LEAF } from '../brand/LogoMark';
import { PLACEHOLDER } from './exportHtml';
import { contrast } from '../styles/colorMath';

export const CARD_W = 1200;
export const CARD_H = 630;
const M = 64;
const ROUTE_Y = 360;

export interface CardColors { paper: string; ink: string; muted: string; trouble: string; ok: string }
export interface CardFonts { sans: string; mono: string }
export interface Font { family: keyof CardFonts; size: number; weight?: number; italic?: boolean }
export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  /** `width` 0: no stroke. */
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; width: number }
  /** An SVG path drawn at (`x`, `y`) scaled by `k`; `width` 0: filled, else stroked with round caps. */
  | { t: 'path'; d: string; x: number; y: number; k: number; fill: string; stroke: string; width: number }
  | { t: 'text'; x: number; y: number; text: string; font: Font; fill: string; anchor?: 'start' | 'middle' | 'end' };
/** Width of `text` in `font`, in px (the canvas's measureText, or an estimate in tests). */
export type Measure = (text: string, font: Font) => number;

/** Greedy word wrap into at most `lines` lines; the last one ends in "…" when text is left over. */
export function wrap(text: string, width: number, font: Font, measure: Measure, lines = 2): string[] {
  const out: string[] = [];
  let line = '';
  const words = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : (words[i] ?? '');
    if (measure(next, font) <= width || !line) {
      line = next;
      continue;
    }
    if (out.length === lines - 1) return [...out, fit(`${line} ${words.slice(i).join(' ')}`, width, font, measure)];
    out.push(line);
    line = words[i] ?? '';
  }
  return line ? [...out, fit(line, width, font, measure)] : out;
}

/** `text`, cut with "…" until it fits `width`. */
export function fit(text: string, width: number, font: Font, measure: Measure): string {
  if (measure(text, font) <= width) return text;
  let s = text;
  while (s.length > 1 && measure(`${s}…`, font) > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** The brand mark (src/brand/LogoMark.tsx, 64-unit box) with its top-left at (`x`, `y`), scaled by `k`; the vein in `paper`. */
function markShapes(x: number, y: number, k: number, paper: string): Shape[] {
  const at = { x, y, k, stroke: 'none', width: 0 };
  return [{ t: 'path', d: LEAF.blue.d, fill: LEAF.blue.fill, ...at }, { t: 'path', d: LEAF.orange.d, fill: LEAF.orange.fill, ...at }, { t: 'path', d: LEAF.vein, ...at, fill: 'none', stroke: paper, width: LEAF.veinWidth }];
}

/** Ink or paper, whichever reads better on the trouble fill (orange-9: ink in light, paper in dark). Colours that are
 * not hex (e.g. CSS variables in tests) fall back to paper. */
export function onTrouble(c: CardColors): string {
  try {
    return contrast(c.ink, c.trouble) >= contrast(c.paper, c.trouble) ? c.ink : c.paper;
  } catch {
    return c.paper;
  }
}

/** The map's square glance glyphs (SC2), centred at (`x`, `y`): "!" on a plate (trouble-filled while a pattern is open,
 * else paper in an ink frame), or a filled ink square for the files row. */
function square(kind: 'open' | 'neutral' | 'files', x: number, y: number, c: CardColors): Shape[] {
  const h = 10;
  if (kind === 'files') return [{ t: 'rect', x: x - 7, y: y - 7, w: 14, h: 14, fill: c.ink }];
  const [fill, mark] = kind === 'open' ? [c.trouble, onTrouble(c)] : [c.paper, c.ink];
  const frame: Shape[] = kind === 'open' ? [{ t: 'rect', x: x - h, y: y - h, w: 2 * h, h: 2 * h, fill }] : [{ t: 'rect', x: x - h, y: y - h, w: 2 * h, h: 2 * h, fill: c.ink }, { t: 'rect', x: x - h + 2, y: y - h + 2, w: 2 * h - 4, h: 2 * h - 4, fill }];
  return [...frame, { t: 'line', x1: x, y1: y - 5.5, x2: x, y2: y + 1.5, stroke: mark, width: 2.5 }, { t: 'circle', cx: x, cy: y + 5.5, r: 1.6, fill: mark, stroke: mark, width: 0 }];
}

/** A glance row's status glyph, centred at (`x`, `y`): ✕ on a trouble disc, ✓ on an ok disc, or a hollow circle. */
function glyph(status: 'ok' | 'error' | 'unknown', x: number, y: number, c: CardColors): Shape[] {
  const r = 11;
  if (status === 'unknown') return [{ t: 'circle', cx: x, cy: y, r, fill: c.paper, stroke: c.muted, width: 2 }];
  const mark = status === 'ok' ? c.paper : onTrouble(c);
  const ln = (x1: number, y1: number, x2: number, y2: number): Shape => ({ t: 'line', x1: x + x1, y1: y + y1, x2: x + x2, y2: y + y2, stroke: mark, width: 2.5 });
  const disc: Shape = { t: 'circle', cx: x, cy: y, r, fill: status === 'ok' ? c.ok : c.trouble, stroke: c.paper, width: 0 };
  return status === 'ok' ? [disc, ln(-5, 0.5, -1.5, 4), ln(-1.5, 4, 5, -4)] : [disc, ln(-4.5, -4.5, 4.5, 4.5), ln(-4.5, 4.5, 4.5, -4.5)];
}

/** Two uncut lines whose last holds one lone word take one more word down from the line above, when it fits (SC1). */
export function balance(lines: string[], width: number, font: Font, measure: Measure): string[] {
  const [a, b] = lines;
  if (lines.length !== 2 || a === undefined || b === undefined || /\s/.test(b) || b.endsWith('…')) return lines;
  const cut = a.lastIndexOf(' ');
  if (cut <= 0) return lines;
  const next = `${a.slice(cut + 1)} ${b}`;
  return measure(next, font) <= width ? [a.slice(0, cut), next] : lines;
}

/** The card's title: the first sentence alone when the title opens with a redaction placeholder and that sentence
 * fits the two lines uncut; otherwise the whole title, wrapped and cut; a last line never holds a lone word. */
export function cardTitle(text: string, width: number, font: Font, measure: Measure): string[] {
  return balance(titleLines(text, width, font, measure), width, font, measure);
}

function titleLines(text: string, width: number, font: Font, measure: Measure): string[] {
  const lines = wrap(text, width, font, measure);
  const re = new RegExp(PLACEHOLDER.source, 'y');
  if (!re.test(lines[0] ?? '')) return lines;
  const first = /^.*?[.!?](?=\s|$)/.exec(text)?.[0];
  if (!first || first === text) return lines;
  const short = wrap(first, width, font, measure);
  return short.some((l) => l.endsWith('…')) ? lines : short;
}

/** The card as shapes, in drawing order. */
export function cardShapes(g: SessionGraph, c: CardColors, measure: Measure): Shape[] {
  const W = CARD_W - 2 * M;
  const s: Shape[] = [{ t: 'rect', x: 0, y: 0, w: CARD_W, h: CARD_H, fill: c.paper }];
  // Wordmark (v7 §3.4, scaled 2x): the 40 px leaf, a 16 px gap, then "Reasontrail" in sans 600 28, centred on the mark.
  const base = 72;
  s.push(...markShapes(M - 2, base - 30, 40 / 64, c.paper));
  s.push({ t: 'text', x: M + 54, y: base, text: 'Reasontrail', font: WORDMARK_FONT, fill: c.ink });

  const title: Font = { family: 'sans', size: 48, weight: 600 };
  cardTitle(g.displayTitle ?? g.title, W, title, measure).forEach((text, i) => s.push({ t: 'text', x: M, y: 148 + i * 56, text, font: title, fill: c.ink }));

  // The route: the trailhead dot, the main line, a dot per episode, the answer mark (ring and centre dot) at the end,
  // and the numbered blazes above their episodes.
  const L = glanceLayout(g, W, {});
  const sx = (x: number) => M + (L.width > 0 ? (x / L.width) * W : 0);
  s.push({ t: 'line', x1: M + 8, y1: ROUTE_Y, x2: CARD_W - M - 20, y2: ROUTE_Y, stroke: c.ink, width: 5 });
  s.push({ t: 'circle', cx: M + 8, cy: ROUTE_Y, r: 8, fill: c.ink, stroke: c.ink, width: 0 });
  for (const e of L.episodes) s.push({ t: 'circle', cx: sx(e.x), cy: ROUTE_Y, r: 4, fill: c.ink, stroke: c.ink, width: 0 });
  s.push({ t: 'circle', cx: CARD_W - M - 10, cy: ROUTE_Y, r: 10, fill: c.paper, stroke: c.ink, width: 3 });
  s.push({ t: 'circle', cx: CARD_W - M - 10, cy: ROUTE_Y, r: 4, fill: c.ink, stroke: c.ink, width: 0 });
  const badge: Font = { family: 'sans', size: 18, weight: 700 };
  let prev = { x: -Infinity, up: 0 };
  for (const b of L.blazes) {
    const x = sx(b.x);
    // A badge that would touch the previous one goes one row up (never two rows: the title sits above).
    const up = x - prev.x < 44 && prev.up === 0 ? 44 : 0;
    prev = { x, up };
    s.push({ t: 'line', x1: x, y1: ROUTE_Y - 4, x2: x, y2: ROUTE_Y - 26 - up, stroke: b.resolved ? c.ink : c.trouble, width: 4 });
    s.push({ t: 'circle', cx: x, cy: ROUTE_Y - 46 - up, r: 20, fill: b.resolved ? c.paper : c.trouble, stroke: b.resolved ? c.ink : c.trouble, width: 3 });
    s.push({ t: 'text', x, y: ROUTE_Y - 40 - up, text: b.badge, font: badge, fill: b.resolved ? c.ink : onTrouble(c), anchor: 'middle' });
  }

  const lead: Font = { family: 'sans', size: 24, weight: 600 };
  const rest: Font = { family: 'sans', size: 24 };
  glance(g).forEach((r, i) => {
    const y = 456 + i * 44;
    const open = g.trouble.some((t) => !t.resolved);
    s.push(...(r.key === 'trouble' && g.trouble.length > 0 ? square(open ? 'open' : 'neutral', M + 12, y - 8, c) : r.key === 'files' ? square('files', M + 12, y - 8, c) : glyph(r.status, M + 12, y - 8, c)));
    const x = M + 40;
    const leadText = fit(r.lead, W - 40, lead, measure);
    s.push({ t: 'text', x, y, text: leadText, font: lead, fill: c.ink });
    const w = measure(leadText, lead);
    if (r.rest && w < W - 80) s.push({ t: 'text', x: x + w, y, text: fit(r.rest, W - 40 - w, rest, measure), font: rest, fill: c.muted });
  });
  s.push({ t: 'text', x: CARD_W - M, y: CARD_H - 36, text: 'Redacted copy', font: { family: 'mono', size: 18 }, fill: c.muted, anchor: 'end' });
  return s;
}

const WORDMARK_FONT: Font = { family: 'sans', size: 28, weight: 600 };
const cssFont = (f: Font, fonts: CardFonts) => `${f.italic ? 'italic ' : ''}${f.weight ?? 400} ${f.size}px ${fonts[f.family]}`;
const esc = (v: string | number) => String(v).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The card as a standalone SVG document. */
export function cardSvg(shapes: Shape[], fonts: CardFonts, label: string): string {
  const body = shapes.map((s) => {
    if (s.t === 'rect') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${esc(s.fill)}"/>`;
    if (s.t === 'line') return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${esc(s.stroke)}" stroke-width="${s.width}" stroke-linecap="round"/>`;
    if (s.t === 'path') return `<path transform="translate(${s.x} ${s.y}) scale(${s.k})" d="${esc(s.d)}" fill="${esc(s.fill)}"${s.width > 0 ? ` stroke="${esc(s.stroke)}" stroke-width="${s.width}" stroke-linecap="round"` : ''}/>`;
    if (s.t === 'circle') return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${esc(s.fill)}"${s.width > 0 ? ` stroke="${esc(s.stroke)}" stroke-width="${s.width}"` : ''}/>`;
    return `<text x="${s.x}" y="${s.y}" fill="${esc(s.fill)}" text-anchor="${s.anchor ?? 'start'}" style="font: ${esc(cssFont(s.font, fonts))}">${esc(s.text)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" role="img" aria-labelledby="card-title"><title id="card-title">${esc(label)}</title>\n${body.join('\n')}\n</svg>\n`;
}

/** Draw the shapes on a 2D canvas context. */
export function drawCard(ctx: CanvasRenderingContext2D, shapes: Shape[], fonts: CardFonts): void {
  for (const s of shapes) {
    if (s.t === 'rect') {
      ctx.fillStyle = s.fill;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    } else if (s.t === 'line') {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    } else if (s.t === 'path') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.k, s.k);
      const p = new Path2D(s.d);
      if (s.width > 0) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.width;
        ctx.lineCap = 'round';
        ctx.stroke(p);
      } else {
        ctx.fillStyle = s.fill;
        ctx.fill(p);
      }
      ctx.restore();
    } else if (s.t === 'circle') {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.fill;
      ctx.fill();
      if (s.width > 0) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.width;
        ctx.stroke();
      }
    } else {
      ctx.font = cssFont(s.font, fonts);
      ctx.fillStyle = s.fill;
      ctx.textAlign = s.anchor === 'middle' ? 'center' : (s.anchor ?? 'start');
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.text, s.x, s.y);
    }
  }
}

/** The theme's colours and font stacks, read from the tokens (src/styles/tokens.css) on the root element. */
export function themeOf(el: Element = document.documentElement): { colors: CardColors; fonts: CardFonts } {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(`--${name}`).trim();
  return {
    colors: { paper: v('slate-1'), ink: v('slate-12'), muted: v('slate-11'), trouble: v('orange-9'), ok: v('blue-9') },
    fonts: { sans: v('font-sans'), mono: v('font-mono') },
  };
}

/** A one-line description of the card for its SVG label and alt text. */
export function cardLabel(g: SessionGraph): string {
  const n = g.trouble.length;
  const k = g.trouble.filter((t) => t.resolved).length;
  const rows = glance(g).map((r) => (r.key === 'trouble' && n > 0 ? `${n} trouble ${n === 1 ? 'spot' : 'spots'}: ${n - k} open, ${k} resolved` : `${r.lead}${r.rest}`));
  // Each part ends in exactly one full stop, never "….", ".." or ",." (SD4).
  const part = (t: string) => t.trim().replace(/[\s.,;:…]+$/, '');
  return `Reasontrail map card: ${[g.displayTitle ?? g.title, ...rows].map(part).join('. ')}.`;
}

/** Render the card in the current theme: the PNG (via a canvas) and the SVG text. */
export async function renderCard(g: SessionGraph): Promise<{ png: Blob; svg: string }> {
  const { colors, fonts } = themeOf();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the card.');
  const used: Font[] = [{ family: 'sans', size: 48, weight: 600 }, WORDMARK_FONT, { family: 'sans', size: 24 }, { family: 'mono', size: 18 }];
  await Promise.all(used.map((f) => document.fonts?.load(cssFont(f, fonts)).catch(() => [])));
  const measure: Measure = (text, f) => {
    ctx.font = cssFont(f, fonts);
    return ctx.measureText(text).width;
  };
  const shapes = cardShapes(g, colors, measure);
  drawCard(ctx, shapes, fonts);
  const png = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('The card could not be encoded.'))), 'image/png'));
  return { png, svg: cardSvg(shapes, fonts, cardLabel(g)) };
}
