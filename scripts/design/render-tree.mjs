#!/usr/bin/env node
// Dev-only debug render of the tree layout engine (src/map/tree; phase 31). Not shipped: it loads the engine through
// Vite's module runner, turns its output into standalone HTML pages styled like the canvas (the CSS of
// docs/design/v7/preview/Home.html, Geist from node_modules), and with --shoot screenshots them.
// Always run --shoot under the shared browser lock:
//   flock /workspace/gx-projects/logs/browser.lock node scripts/design/render-tree.mjs --shoot
// Options: --out <dir for HTML> (default /tmp/reasontrail-tree), --shots <dir> (default docs/screenshots/phase-31).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runnerImport } from 'vite';

const root = resolve(import.meta.dirname, '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const out = resolve(arg('out', '/tmp/reasontrail-tree'));
const shots = resolve(root, arg('shots', 'docs/screenshots/phase-31'));
const load = async (id) => (await runnerImport(join(root, id), { root, configFile: false, logLevel: 'error' })).module;
const T = await load('src/map/tree/index.ts');
const { eightLanes, longSession, synthGraph } = await load('src/map/tree/synthetic.ts');
const sample = (id) => JSON.parse(readFileSync(join(root, 'src/sessions/samples', `${id}.graph.json`), 'utf8'));

const css = readFileSync(join(root, 'docs/design/v7/preview/Home.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const font = pathToFileURL(join(root, 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')).href;

const glyphs = {
  discuss: '<path d="M2.5 1.5 10.5 6l-8 4.5z" fill="currentColor"/>',
  explore: '<circle cx="6" cy="6" r="4.25" fill="var(--bg, none)" stroke="currentColor" stroke-width="1.5"/>',
  change: '<rect x="1.75" y="1.75" width="8.5" height="8.5" fill="currentColor"/>',
  verify: '<path d="M6 1 11 6 6 11 1 6z" fill="var(--bg, none)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  answer: '<circle cx="6" cy="6" r="4.75" fill="var(--bg, none)" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="6" r="2" fill="currentColor"/>',
};
const glyph = (k, at, r, cls) => `<svg class="g t-node ${cls}" x="${at.x - r}" y="${at.y - r}" width="${2 * r}" height="${2 * r}" viewBox="0 0 12 12">${glyphs[k]}</svg>`;
const icons = {
  fail: '<path d="M8 1.5 15 14H1z" fill="var(--orange-9)" stroke="var(--orange-9)" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3.5" stroke="var(--orange-1)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.95" fill="var(--orange-1)"/>',
  ok: '<circle cx="8" cy="8" r="7" fill="var(--blue-9)"/><path d="m4.75 8.25 2.1 2.1 4.4-4.6" fill="none" stroke="var(--slate-1)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  commit: '<path d="M1.5 8h3M11.5 8h3" stroke="var(--slate-12)" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="3.25" fill="none" stroke="var(--slate-12)" stroke-width="1.5"/>',
  done: '<circle cx="8" cy="8" r="6.25" fill="none" stroke="var(--slate-12)" stroke-width="1.4"/><path d="m5 8.25 2 2 4-4.25" fill="none" stroke="var(--slate-12)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  unknown: '<circle cx="8" cy="8" r="6.25" fill="none" stroke="var(--slate-9)" stroke-width="1.4" stroke-dasharray="2 2.2"/>',
};
const CLS = { num: 't-num', sub: 't-sub', lab: 't-lab', lane: 't-lane' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (l) => (l.icon ? `<svg x="${l.x}" y="${l.y - 12}" width="14" height="14" viewBox="0 0 16 16">${icons[l.icon]}</svg>` : '')
  + `<text x="${l.icon ? l.x + 20 : l.x}" y="${l.y}" text-anchor="${l.anchor}" class="${CLS[l.cls]}">${esc(l.text)}</text>`;

/** The engine's output as the canvas draws it (gen7.mjs tree CSS classes). `debug` outlines the label boxes. */
function svg(t, debug) {
  const p = [];
  const z = t.root.r / 5.5; // the phone silhouette draws everything smaller
  for (const b of t.handBacks) p.push(`<path d="${b.d}" class="back"/><circle cx="${b.to.x}" cy="${b.to.y}" r="${2.5 * z}" class="back-end"/>`);
  for (const w of t.twigs) p.push(`<path d="M${w.base.x} ${w.base.y}L${w.tip.x} ${w.tip.y}" class="tw${w.kind === 'thinking' ? ' th' : ''}${w.kind === 'failed' ? ' fail' : ''}"/>`);
  for (const r of t.ribbons) p.push(`<path d="${r.d}" class="b"/>`);
  for (const w of t.twigs) {
    const s = w.scale;
    if (w.mark === 'leaf') p.push(`<path d="M0 0Q5.5 -4.2 11 0Q5.5 4.2 0 0Z" transform="translate(${w.tip.x} ${w.tip.y}) rotate(${w.angle}) scale(${s})" class="leaf"/>`);
    else if (w.mark === 'bud') p.push(`<circle cx="${w.tip.x}" cy="${w.tip.y}" r="${2.4 * s}" class="bud"/>`);
    else if (w.mark === 'x') { const a = 2.8 * s, { x, y } = w.tip; p.push(`<path d="M${x - a} ${y - a}L${x + a} ${y + a}M${x + a} ${y - a}L${x - a} ${y + a}" class="x"/>`); }
  }
  for (const e of t.episodes) p.push(`<circle cx="${e.at.x}" cy="${e.at.y}" r="${e.r + 2.5}" class="halo"/>${glyph(e.kind, e.at, e.r, '')}`);
  for (const m of t.tips) {
    p.push(`<circle cx="${m.at.x}" cy="${m.at.y}" r="${m.r + 3}" class="halo"/>`);
    p.push(m.kind === 'answer' ? glyph('answer', m.at, m.r, m.tone === 'fail' ? 'tip-fail' : m.tone === 'ok' ? 'tip-ok' : '') : `<circle cx="${m.at.x}" cy="${m.at.y}" r="${m.r}" class="dot"/>`);
  }
  p.push(`<circle cx="${t.root.at.x}" cy="${t.root.at.y}" r="${t.root.r}" class="root"/>`);
  for (const l of t.labels) p.push(text(l));
  for (const b of t.blocks) p.push(b.lines.map(text).join(''));
  if (debug) for (const b of t.blocks) p.push(`<rect x="${b.box.x0}" y="${b.box.y0}" width="${b.box.x1 - b.box.x0}" height="${b.box.y1 - b.box.y0}" fill="none" stroke="var(--orange-9)" stroke-width="0.5"/>`);
  return `<svg class="tree" width="${t.width}" height="${t.height}" viewBox="0 0 ${t.width} ${t.height}" style="margin:0;outline:0.5px dashed var(--slate-7)">${p.join('')}</svg>`;
}

const eight = eightLanes();
const SETS = [
  ['vff', sample('verify-fail-fix'), { width: 1200, height: 520 }],
  ['implementer-checks', sample('implementer-checks'), { width: 1200, height: 520 }],
  ['planner-pivot', sample('planner-pivot'), { width: 1200, height: 520 }],
  ['eight-lanes', eight, { width: 1200, height: 520 }],
  ['long-session', longSession(), { width: 1200, height: 520 }],
  ['concurrent-lanes', synthGraph([
    { main: { kind: 'explore', calls: 2 } },
    { spawn: ['one', 'two', 'three', 'four', 'five'].map((x, i) => ({ name: `Review part ${x}`, agentType: 'reviewer', episodes: [{ kind: 'explore', calls: 3 + i, reads: 2 }, { kind: 'verify', calls: 2 }] })) },
    { main: { kind: 'change', calls: 3 } },
  ]), { width: 1200, height: 520 }],
  // The canvas's phone tree: the desktop geometry (k 1.45) scaled down.
  ['vff-phone', sample('verify-fail-fix'), { width: 358, height: 190, labels: false }],
];
mkdirSync(out, { recursive: true });
const pages = [];
for (const [name, g, opts] of SETS) {
  const t = T.layoutTree(g, opts);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:"Geist";src:url(${font}) format("woff2-variations");font-weight:100 900}${css}</style></head>
<body style="margin:0;background:var(--slate-1)"><div class="rt" style="padding:20px;width:${opts.width + 40}px"><figure class="hero-tree" style="margin:0">${svg(t, process.argv.includes('--debug'))}</figure></div></body></html>`;
  writeFileSync(join(out, `${name}.html`), html);
  pages.push([name, join(out, `${name}.html`), opts]);
  console.log(`${name}: ${t.ribbons.length} ribbons, ${t.twigs.length} twigs, ${t.labels.length + t.blocks.length} labels -> ${join(out, name)}.html`);
}

if (process.argv.includes('--shoot')) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu', '--allow-file-access-from-files'] });
  try {
    mkdirSync(shots, { recursive: true });
    const shoot = async (url, file, sel, vw = 1440) => {
      const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
      const tab = await ctx.newPage();
      await tab.goto(url, { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      writeFileSync(file, await tab.locator(sel).first().screenshot({ type: 'webp', quality: 82 }));
      await ctx.close();
    };
    for (const [name, file, opts] of pages) await shoot(pathToFileURL(file).href, join(shots, `tree-${name}.webp`), '.rt', opts.width + 80);
    // The canvas's tree region, for the side-by-side pair.
    await shoot(pathToFileURL(join(root, 'docs/design/v7/preview/Home.html')).href, join(out, 'canvas-tree.webp'), '.hero-tree .tree');
    await shoot(pathToFileURL(pages[0][1]).href, join(out, 'engine-tree.webp'), '.hero-tree .tree');
    console.log(`shots -> ${shots}`);
  } finally {
    await browser.close();
  }
}
