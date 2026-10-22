// The map card (DESIGN §13.9, DM37): the glance view as a 1200×630 picture for a PR or a post. Paper background,
// wordmark top-left, the task title in serif 48 (2 lines at most), the route alone with numbered blazes at y = 360,
// the three At a glance rows in UI 24, and "Redacted copy · reasontrail" in mono at the bottom right. Colours come
// from the theme tokens (light or night); meaning never rests on colour: open blazes are filled, resolved ones hollow,
// and each glance row starts with a symbol and says its status in words. One list of shapes feeds both the SVG and the
// canvas (the canvas uses the page's loaded fonts, which an SVG drawn as an image cannot).
import type { SessionGraph } from '../../shared/session/types';
import { glanceLayout } from '../map/layout';
import { glance } from '../map/outline';

export const CARD_W = 1200;
export const CARD_H = 630;
const M = 64;
const ROUTE_Y = 360;

export interface CardColors { paper: string; ink: string; muted: string; trouble: string }
export interface CardFonts { serif: string; ui: string; mono: string }
export interface Font { family: keyof CardFonts; size: number; weight?: number; italic?: boolean }
export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; width: number }
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

const SYMBOL = { ok: '✓', error: '!', unknown: '–' } as const;

/** The card as shapes, in drawing order. */
export function cardShapes(g: SessionGraph, c: CardColors, measure: Measure): Shape[] {
  const W = CARD_W - 2 * M;
  const s: Shape[] = [{ t: 'rect', x: 0, y: 0, w: CARD_W, h: CARD_H, fill: c.paper }];
  // Wordmark: "reason" in mono 500, "trail" in serif italic, baseline-aligned with no space.
  const reason: Font = { family: 'mono', size: 26, weight: 500 };
  s.push({ t: 'text', x: M, y: 84, text: 'reason', font: reason, fill: c.ink });
  s.push({ t: 'text', x: M + measure('reason', reason), y: 84, text: 'trail', font: { family: 'serif', size: 30, italic: true }, fill: c.ink });

  const title: Font = { family: 'serif', size: 48 };
  wrap(g.displayTitle ?? g.title, W, title, measure).forEach((text, i) => s.push({ t: 'text', x: M, y: 176 + i * 56, text, font: title, fill: c.ink }));

  // The route: the main line, a dot per episode, a terminus bar, and the numbered blazes above their episodes.
  const L = glanceLayout(g, W, {});
  const sx = (x: number) => M + (L.width > 0 ? (x / L.width) * W : 0);
  s.push({ t: 'line', x1: M, y1: ROUTE_Y, x2: CARD_W - M, y2: ROUTE_Y, stroke: c.ink, width: 4 });
  for (const e of L.episodes) s.push({ t: 'circle', cx: sx(e.x), cy: ROUTE_Y, r: 7, fill: c.paper, stroke: c.ink, width: 3 });
  s.push({ t: 'rect', x: CARD_W - M - 4, y: ROUTE_Y - 16, w: 8, h: 32, fill: c.ink });
  const badge: Font = { family: 'ui', size: 18, weight: 700 };
  for (const b of L.blazes) {
    const x = sx(b.x);
    s.push({ t: 'line', x1: x, y1: ROUTE_Y - 4, x2: x, y2: ROUTE_Y - 26, stroke: b.resolved ? c.ink : c.trouble, width: 3 });
    s.push({ t: 'circle', cx: x, cy: ROUTE_Y - 46, r: 20, fill: b.resolved ? c.paper : c.trouble, stroke: b.resolved ? c.ink : c.trouble, width: 3 });
    s.push({ t: 'text', x, y: ROUTE_Y - 40, text: b.badge, font: badge, fill: b.resolved ? c.ink : c.paper, anchor: 'middle' });
  }

  const lead: Font = { family: 'ui', size: 24, weight: 600 };
  const rest: Font = { family: 'ui', size: 24 };
  glance(g).forEach((r, i) => {
    const y = 456 + i * 44;
    const sym = SYMBOL[r.status];
    s.push({ t: 'text', x: M + 12, y, text: sym, font: lead, fill: sym === '!' ? c.trouble : c.ink, anchor: 'middle' });
    const x = M + 40;
    const leadText = fit(r.lead, W - 40, lead, measure);
    s.push({ t: 'text', x, y, text: leadText, font: lead, fill: c.ink });
    const w = measure(leadText, lead);
    if (r.rest && w < W - 80) s.push({ t: 'text', x: x + w, y, text: fit(r.rest, W - 40 - w, rest, measure), font: rest, fill: c.muted });
  });
  s.push({ t: 'text', x: CARD_W - M, y: CARD_H - 36, text: 'Redacted copy · reasontrail', font: { family: 'mono', size: 18 }, fill: c.muted, anchor: 'end' });
  return s;
}

const cssFont = (f: Font, fonts: CardFonts) => `${f.italic ? 'italic ' : ''}${f.weight ?? 400} ${f.size}px ${fonts[f.family]}`;
const esc = (v: string | number) => String(v).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The card as a standalone SVG document. */
export function cardSvg(shapes: Shape[], fonts: CardFonts, label: string): string {
  const body = shapes.map((s) => {
    if (s.t === 'rect') return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${esc(s.fill)}"/>`;
    if (s.t === 'line') return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${esc(s.stroke)}" stroke-width="${s.width}" stroke-linecap="round"/>`;
    if (s.t === 'circle') return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${esc(s.fill)}" stroke="${esc(s.stroke)}" stroke-width="${s.width}"/>`;
    return `<text x="${s.x}" y="${s.y}" fill="${esc(s.fill)}" text-anchor="${s.anchor ?? 'start'}" style="font: ${esc(cssFont(s.font, fonts))}">${esc(s.text)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" role="img" aria-label="${esc(label)}">\n${body.join('\n')}\n</svg>\n`;
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
    } else if (s.t === 'circle') {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      ctx.stroke();
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
  const v = (name: string) => css.getPropertyValue(`--tg-${name}`).trim();
  return {
    colors: { paper: v('paper'), ink: v('ink'), muted: v('ink-muted'), trouble: v('trouble') },
    fonts: { serif: v('font-serif'), ui: v('font-ui'), mono: v('font-mono') },
  };
}

/** A one-line description of the card for its SVG label and alt text. */
export function cardLabel(g: SessionGraph): string {
  return `Reasontrail map card: ${g.displayTitle ?? g.title}. ${glance(g).map((r) => `${r.lead}${r.rest}`).join('. ')}.`;
}

/** Render the card in the current theme: the PNG (via a canvas) and the SVG text. */
export async function renderCard(g: SessionGraph): Promise<{ png: Blob; svg: string }> {
  const { colors, fonts } = themeOf();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the card.');
  const used: Font[] = [{ family: 'serif', size: 48 }, { family: 'serif', size: 30, italic: true }, { family: 'mono', size: 26, weight: 500 }, { family: 'mono', size: 18 }];
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
