// Reasontrail redesign boards: one template, several states. Writes preview pages (for screenshots) and canvas boards.
import { writeFileSync, mkdirSync } from 'node:fs';
import { tree, LANES, EPISODES } from './tree.mjs';
import { gitlist } from './gitlist.mjs';
import { logo2 } from './logo2.mjs';
const OUT = new URL('.', import.meta.url).pathname;
mkdirSync(OUT + 'v7preview', { recursive: true });

// Radix Colors 3.0.0, exact values (slate, blue, orange; light and dark).
const R = {
  light: {
    slate: ['#fcfcfd', '#f9f9fb', '#f0f0f3', '#e8e8ec', '#e0e1e6', '#d9d9e0', '#cdced6', '#b9bbc6', '#8b8d98', '#80838d', '#60646c', '#1c2024'],
    blue: ['#fbfdff', '#f4faff', '#e6f4fe', '#d5efff', '#c2e5ff', '#acd8fc', '#8ec8f6', '#5eb1ef', '#0090ff', '#0588f0', '#0d74ce', '#113264'],
    orange: ['#fefcfb', '#fff7ed', '#ffefd6', '#ffdfb5', '#ffd19a', '#ffc182', '#f5ae73', '#ec9455', '#f76b15', '#ef5f00', '#cc4e00', '#582d1d'],
  },
  dark: {
    slate: ['#111113', '#18191b', '#212225', '#272a2d', '#2e3135', '#363a3f', '#43484e', '#5a6169', '#696e77', '#777b84', '#b0b4ba', '#edeef0'],
    blue: ['#0d1520', '#111927', '#0d2847', '#003362', '#004074', '#104d87', '#205d9e', '#2870bd', '#0090ff', '#3b9eff', '#70b8ff', '#c2e6ff'],
    orange: ['#17120e', '#1e160f', '#331e0b', '#462100', '#562800', '#66350c', '#7e451d', '#a35829', '#f76b15', '#ff801f', '#ffa057', '#ffe0c2'],
  },
};
const vars = (t) =>
  Object.entries(R[t]).map(([n, s]) => s.map((v, i) => `--${n}-${i + 1}: ${v};`).join(' ')).join('\n  ');

// The default sample (implementer-checks.graph.json): 12 episodes, 142 steps, one trouble spot.
const EP = [
  { n: 1, k: 'discuss', t: 'Build Phase 5: keyboard navigation and screen-reader alternative', s: 4, at: '0', d: '<1' },
  { n: 2, k: 'explore', t: 'Read base.css +21 more', s: 19, at: '0', d: '2' },
  { n: 3, k: 'change', t: 'Edit scales.ts +1 more', s: 11, at: '2', d: '1' },
  { idle: 12 },
  { n: 4, k: 'explore', t: 'Read scales.test.ts +1 more', s: 20, at: '14', d: '2', trouble: true },
  { n: 5, k: 'verify', t: 'Run lint, typecheck and tests', s: 8, at: '16', d: '1' },
  { n: 6, k: 'change', t: 'Edit App.test.tsx', s: 9, at: '17', d: '<1' },
  { n: 7, k: 'explore', t: 'Read check-browser.mjs +2 more', s: 8, at: '17', d: '1' },
  { n: 8, k: 'verify', t: 'Run lint, typecheck and tests', s: 9, at: '18', d: '15', inner: 15 },
  { n: 9, k: 'explore', t: 'Read table-view-mobile.png +5 more', s: 29, at: '33', d: '2' },
  { n: 10, k: 'explore', t: 'Read keyboard.mjs', s: 6, at: '35', d: '<1' },
  { n: 11, k: 'verify', t: 'Run lint, typecheck and tests +2 more', s: 18, at: '36', d: '1' },
  { idle: 12 },
  { n: 12, k: 'answer', t: 'Answer', s: 1, at: '49', d: '' },
];
const SEQ = ["utXF","X.X.X.X.X.tX.tX.tX.","tX.tX.tX.X.","tX.tX.X.tX.tX.tX.tXF","tXFX.tX.","tX.tX.tX.","tX.tX.W.","tX.tX.tX.","tX.tR.R.tR.R.tX.R.tX.X.tX.tX.","tR.tW.","tX.tX.tX.tR.tX.tX.","a"];
const KIND = { discuss: 'Task', explore: 'Explore', change: 'Change', verify: 'Verify', answer: 'Answer' };
const FILES = [
  ['scripts/browser/flows/keyboard.mjs', 3, true],
  ['src/App.test.tsx', 3],
  ['src/garden/scales.ts', 2],
  ['src/components/LiveRegion.tsx', 1],
  ['src/garden/TableView.tsx', 1],
  ['src/garden/keyboard.ts', 1],
];
const STEPS = [
  ['think', 'Thinking', '14 min'],
  ['ok', 'python3 - <<\'EOF\'', '15 min'],
  ['think', 'Thinking', '15 min'],
  ['ok', 'sed -n 48,54p src/garden/scales.test.ts', '15 min'],
  ['ok', 'cat .oxlintrc.json | head -30', '15 min'],
  ['think', 'Thinking', '15 min'],
  ['ok', 'python3 - <<\'EOF\'', '16 min'],
  ['fail', 'grep -n "^button" src/styles/base.css', '16 min'],
];

// Glyphs: shape carries the kind; colour never does it alone.
function glyph(k, size = 12, cls = '') {
  const h = size / 2;
  const c = `class="g ${cls}" width="${size}" height="${size}" viewBox="0 0 12 12" aria-hidden="true"`;
  switch (k) {
    case 'discuss': return `<svg ${c}><path d="M2.5 1.5 10.5 6l-8 4.5z" fill="currentColor"/></svg>`;
    case 'explore': return `<svg ${c}><circle cx="6" cy="6" r="4.25" fill="var(--bg, none)" stroke="currentColor" stroke-width="1.5"/></svg>`;
    case 'change': return `<svg ${c}><rect x="1.75" y="1.75" width="8.5" height="8.5" fill="currentColor"/></svg>`;
    case 'verify': return `<svg ${c}><path d="M6 1 11 6 6 11 1 6z" fill="var(--bg, none)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    case 'answer': return `<svg ${c}><circle cx="6" cy="6" r="4.75" fill="var(--bg, none)" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="6" r="2" fill="currentColor"/></svg>`;
  }
  return '';
}
const icon = {
  check: `<svg class="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--blue-9)"/><path d="m4.75 8.25 2.1 2.1 4.4-4.6" fill="none" stroke="var(--slate-1)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  alert: `<svg class="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="var(--orange-9)" stroke="var(--orange-9)" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3.5" stroke="var(--orange-1)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.95" fill="var(--orange-1)"/></svg>`,
  files: `<svg class="ic" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.75h6l3 3v9.5h-9z" fill="none" stroke="var(--slate-12)" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 8.5h4M6 11h4" stroke="var(--slate-12)" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  fail: `<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="var(--orange-9)" stroke="var(--orange-9)" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3.5" stroke="var(--orange-1)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.95" fill="var(--orange-1)"/></svg>`,
  ok: `<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--blue-9)"/><path d="m4.75 8.25 2.1 2.1 4.4-4.6" fill="none" stroke="var(--slate-1)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  think: `<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="var(--slate-9)" stroke-width="1.4" stroke-dasharray="2 2.2"/></svg>`,
  copy: `<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.25" y="5.25" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.5v-.25A1.5 1.5 0 0 0 9 1.75H3.25a1.5 1.5 0 0 0-1.5 1.5V9a1.5 1.5 0 0 0 1.5 1.5h.25" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`,
  close: `<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  chev: `<svg class="ic" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  down: `<svg class="ic" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
const mark = logo2('vein', 20);

// The trail: a walked path, left to right in session order. Its length per episode is the episode's step count and
// every step is one dash: ink for a tool call, faint for thinking, orange for a failed run. Exploring wanders, editing
// and verifying run straight, a failed streak loops back on itself, idle time is a dotted gap.
function catmull(pts, n = 16) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), ci: j === 0 ? i : undefined });
    }
  }
  out.push({ x: pts.at(-1).x, y: pts.at(-1).y, ci: pts.length - 1 });
  let L = 0;
  out.forEach((p, i) => { if (i) L += Math.hypot(p.x - out[i - 1].x, p.y - out[i - 1].y); p.s = L; });
  return out;
}
function cut(poly, a, b) {
  const pts = [];
  const at = (s) => {
    let i = poly.findIndex((p) => p.s >= s);
    if (i <= 0) return poly[Math.max(i, 0)];
    const p = poly[i - 1], q = poly[i], t = (s - p.s) / (q.s - p.s || 1);
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  };
  pts.push(at(a));
  for (const p of poly) if (p.s > a && p.s < b) pts.push(p);
  pts.push(at(b));
  return 'M' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L');
}
function trail(width, sel, phone) {
  const H = phone ? 104 : 172, BREAK = phone ? 22 : 56, AMP = phone ? 9 : 16;
  const mid = H / 2 + (phone ? 8 : 14);
  const LEVEL = { discuss: mid + (phone ? 6 : 12), explore: mid - (phone ? 14 : 26), change: mid + (phone ? 14 : 26), verify: mid, answer: mid };
  const total = SEQ.reduce((a, q) => a + q.length, 0);
  const unit = (width - 24 - 2 * BREAK) / total;
  // Control points: each episode starts at a waypoint on its own level; exploring adds a wiggle per ~6 steps.
  const pts = [], wp = [];
  let x = 12, i = 0;
  for (const e of EP) {
    if (e.idle) { x += BREAK; continue; }
    const q = SEQ[i++], w = q.length * unit, y = LEVEL[e.k];
    wp.push({ e, q, x, w, idx: pts.length });
    pts.push({ x, y, k: 'wp' });
    if (e.k === 'explore') {
      const n = Math.max(1, Math.round(q.length / 6));
      // A walked line, not a wave: each bend's reach and spacing vary (deterministic, from the episode and bend number).
      const rnd = (a) => { const v = Math.sin(e.n * 12.9898 + a * 78.233) * 43758.5453; return v - Math.floor(v); };
      for (let j = 0; j < n; j++) {
        const jx = (j + 0.5 + (rnd(j) - 0.5) * 0.5) / n;
        pts.push({ x: x + jx * w, y: y + (j % 2 ? 1 : -1) * AMP * (0.45 + 0.9 * rnd(j + 7)) * (j === n - 1 && e.trouble ? 0.2 : 1) });
      }
    } else if (e.k !== 'answer') pts.push({ x: x + w * 0.55, y: y + (e.k === 'change' ? (phone ? 4 : 8) : 0) });
    if (e.trouble) {
      // The error streak: the path doubles back into a knot just before the next episode.
      const kx = x + w * 0.74, ky = y + AMP * 0.2, r = phone ? 12 : 20;
      pts.push({ x: kx + r, y: ky + r * 0.2, k: 'k0' }, { x: kx + r * 0.6, y: ky - r * 1.4 }, { x: kx - r * 0.7, y: ky - r * 0.8 }, { x: kx + r * 0.2, y: ky + r * 0.6, k: 'k1' });
    }
    x += w;
  }
  const poly = catmull(pts, 20);
  // Arc length at each control point.
  const sAt = [];
  for (const p of poly) if (p.ci !== undefined) sAt[p.ci] = p.s;
  const S = (idx) => sAt[idx] ?? poly.at(-1).s;
  const dashes = [], idles = [], nodes = [], labels = [];
  const GAP = phone ? 1.5 : 2.5;
  wp.forEach((w, n) => {
    const a = S(w.idx), next = wp[n + 1], b = next ? S(next.idx) : poly.at(-1).s;
    const steps = [...w.q].reduce((arr, c) => (c === '.' && arr.length ? arr : [...arr, c]), []);
    const on = sel && w.e.n === sel;
    // Where the episode is followed by idle time, the last stretch before the next waypoint is the idle gap.
    const idleAfter = EP[EP.indexOf(w.e) + 1]?.idle;
    let end = idleAfter ? a + (b - a) * (w.w / (w.w + BREAK)) : b;
    if (idleAfter) { idles.push(`<path d="${cut(poly, end, b)}" class="t-idle"/>`); const m = poly.find((p) => p.s >= (end + b) / 2); if (!phone) labels.push(`<text x="${m.x.toFixed(0)}" y="${(Math.max(m.y, LEVEL.change) + 30).toFixed(0)}" text-anchor="middle" class="t-sub">${idleAfter} min idle</text>`); }
    let loopFrom = null;
    if (w.e.trouble) loopFrom = S(pts.findIndex((p) => p.k === 'k0')) - 30;
    const plain = loopFrom ?? end;
    const nPlain = loopFrom ? steps.length - 1 : steps.length;
    steps.forEach((c, j) => {
      let s0, s1;
      if (loopFrom && j === steps.length - 1) { s0 = loopFrom; s1 = end; }
      else { s0 = a + ((plain - a) * j) / nPlain; s1 = a + ((plain - a) * (j + 1)) / nPlain; }
      if (c === 'a') return;
      const cls = c === 'F' ? 't-fail' : c === 't' ? 't-think' : 't-call';
      dashes.push(`<path d="${cut(poly, s0 + (c === 'F' ? 0 : GAP / 2), s1 - (c === 'F' ? 0 : GAP / 2))}" class="${cls}${on && c !== 'F' ? ' on' : ''}"/>`);
    });
    const p = poly.find((q) => q.s >= a) || poly[0], r = phone ? 5 : 7;
    nodes.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r + 3}" class="t-halo"/>`);
    nodes.push(glyph(w.e.k, 2 * r).replace('<svg', `<svg x="${(p.x - r).toFixed(1)}" y="${(p.y - r).toFixed(1)}"`).replace('class="g ', `class="g t-node${on ? ' on' : ''} `));
    if (on) nodes.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r + 5}" class="t-ring"/>`);
    if (!phone || [4, 8, 12].includes(w.e.n)) labels.push(`<text x="${p.x.toFixed(1)}" y="${(p.y - r - 10).toFixed(1)}" text-anchor="middle" class="t-num${on ? ' on' : ''}">${w.e.n}</text>`);
    if (w.e.trouble && !phone) {
      const k = poly.find((q) => q.s >= S(pts.findIndex((p) => p.k === 'k0')) + 20);
      const ko = pts.find((p) => p.k === 'k0');
      labels.push(`<g transform="translate(${(ko.x + 16).toFixed(0)} ${(ko.y - 44).toFixed(0)})">${icon.fail.replace('class="ic"', '')}<text x="20" y="11" class="t-lab">Error streak</text></g>`);
    }
  });
  return `<svg class="trail" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="Route: 12 episodes, 142 steps, 2 idle breaks, an error streak in episode 4">${idles.join('')}${dashes.join('')}${labels.join('')}${nodes.join('')}</svg>`;
}

const E18 = EPISODES.find((e) => e.id === 'e18');
function rows(sel) {
  const selEp = sel ? EPISODES.find((e) => e.rs.some((r) => r.id === sel)) : null;
  const vic = { fail: icon.fail, ok: icon.ok, commit: '' };
  return LANES.map((L) => {
    const head = `<li class="lane"><span class="num"></span><span class="kind"><span class="tag">${L.agent}</span></span><span class="title"><span class="tt">${L.name}</span><span class="sub"><span class="trb">${vic[L.vicon]}${L.verdict}</span></span></span><span class="steps">${L.steps}</span><span class="at">${L.at} min</span></li>`;
    const body = L.eps.map((e) => {
      const on = selEp === e;
      const sub = [];
      const fails = e.rs.filter((r) => r.st === 'error').length;
      if (fails) sub.push(`<span class="trb">${icon.fail}${fails} failed command</span>`);
      const w = e.rs.find((r) => r.wait);
      if (w) sub.push(`<span class="muted">${w.wait} min wait</span>`);
      let li = `<li class="ep${on ? ' on' : ''}">
      <span class="num">${e.n}</span>
      <span class="kind">${glyph(e.k)}<span>${KIND[e.k]}</span></span>
      <span class="title"><span class="tt">${e.t}</span>${sub.length ? `<span class="sub">${sub.join('')}</span>` : ''}</span>
      <span class="steps">${e.s}</span>
      <span class="at">${e.at} min</span>
    </li>`;
      if (on) {
        const shown = e.rs.filter((r) => r.k === 'tool-call' || r.k === 'thinking').slice(0, 7);
        li += `<li class="steplist"><ol>${shown.map((r) => { const st = r.k === 'thinking' ? 'think' : r.st === 'error' ? 'fail' : 'ok'; return `<li class="st${r.id === sel ? ' cur' : ''}${st === 'think' ? ' th' : ''}">${icon[st]}<span>${st === 'think' ? 'Thinking' : r.sum.replace(/^Bash /, '')}</span><span class="rc">${st === 'ok' ? 'Exit 0' : st === 'fail' ? 'Exit 2' : ''}</span><span class="at">${Math.round(r.t)} min</span></li>`; }).join('')}</ol><button class="link" type="button">Show ${e.s - 1 - 7 - 10} more steps</button></li>`;
      }
      return li;
    }).join('');
    return `${head}<li class="group"><ol>${body}</ol></li>`;
  }).join('');
}

function resCells() {
  return `<section class="res">
      <div class="res-row">${icon.check}<div><p class="strong">Passed on re-verify</p><p class="muted"><span class="code">pnpm exec vitest</span> passed at 47 min</p></div></div>
      <div class="res-row">${icon.alert}<div><p class="strong">1 failed review</p><p class="muted">A gap in the sample audit, fixed in <span class="code">cceb2d5</span></p></div></div>
      <div class="res-row">${icon.files}<div><p class="strong">1 file changed</p><p class="muted"><span class="code">scripts/audit-samples.mjs</span>, 2 edits</p></div></div>
    </section>`;
}
function outcome() {
  return `<aside class="side" aria-label="Outcome">
    ${resCells()}
    <section class="block">
      <h3>Final answer</h3>
      <p class="answer">VERDICT: PASS. Round 2 of Phase 12 on <span class="code">phase-12-structure-redact</span> at HEAD <span class="code">cceb2d5</span>. The round-1 problem is fixed, and lint, typecheck, tests and the sample audit all pass.</p>
      <button class="link" type="button">Read the full answer</button>
    </section>
  </aside>`;
}

function detail() {
  return `<aside class="side detail" aria-label="Episode 6, step 1">
    <div class="d-head"><p class="muted">Verify phase 12, episode 6, step 1 of 28</p><button class="iconbtn" type="button" aria-label="Close">${icon.close}</button></div>
    <div class="d-title">${icon.fail}<h3>Command failed</h3><span class="at">16 min</span></div>
    <p>Inspect vitest config for log suppression</p>
    <pre class="cmd"><span class="muted">$</span> cat vitest.config.* 2&gt;/dev/null | head -40; grep -n "onConsoleLog\\|silent\\|reporters" vite.config.* vitest.config.* 2&gt;/dev/null</pre>
    <h4 class="d-label">Output <span class="muted">Exit code 2, no output</span></h4>
    <h4 class="d-label">Next step <span class="muted">16 min</span></h4>
    <div class="d-next">${icon.ok}<div><p>List repo files and check config</p><pre class="out">vite.config.ts
…
7:  test: {
9:    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', …]</pre></div></div>
    <p class="d-src muted">Source <span class="code">agent-ad0e51f3501a3ddc3.jsonl</span> line 132</p>
    <div class="d-nav"><button class="btn ghost" type="button" aria-disabled="true">Previous step</button><button class="btn ghost" type="button">Next step</button></div>
  </aside>`;
}

const SAMPLES = ['A verifier fails, a fix passes', 'Lint and typecheck fail, then pass', 'A change request rewrites the plan'];

const MORE = [
  ['Vert', 'vert.geekplux.org', 'Turn a GPX track into a terrain poster'],
  ['Explorable', 'explorable.geekplux.com', 'Turn a paper into an interactive essay'],
  ['Pagelapse', 'pagelapse.geekplux.com', 'Watch a web page change over the years'],
  ['markvis', 'github.com/geekplux/markvis', 'Charts written in Markdown'],
];
const LEGEND = `<p class="legend">${['discuss', 'explore', 'change', 'verify', 'answer'].map((k) => `<span>${glyph(k)}${KIND[k]}</span>`).join('')}<span class="lg-gap"></span><span><svg class="g" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><path d="M2 10 7 5" stroke="var(--slate-12)" stroke-width="1"/><path d="M0 0Q2.6 -2 5.2 0Q2.6 2 0 0Z" transform="translate(7 5) rotate(-45)" fill="var(--slate-12)"/></svg>Command</span><span><svg class="g" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><path d="M2 10 5.5 6.5" stroke="var(--slate-8)" stroke-width="1"/></svg>Thinking</span><span><svg class="g" width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><path d="M2 10 8 4" stroke="var(--orange-9)" stroke-width="1"/><path d="M8 1.5l4 4M12 1.5l-4 4" stroke="var(--orange-9)" stroke-width="1.4"/></svg>Failed</span><span><svg class="g" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 3.5 17 5.6v.8L1 8.5z" fill="var(--slate-11)"/></svg>Width: tool calls</span></p>`;

function page({ theme, phone, sel, hover }) {
  const W = phone ? 390 : 1440;
  return `<div class="rt ${theme} ${phone ? 'phone' : 'desk'}" style="width:${W}px">
  <header class="bar">
    <a class="brand" href="#">${mark}<span>Reasontrail</span></a>
    ${phone ? '' : `<nav class="nav"><a href="#">How to read a map</a><a href="#">Install</a><a href="#">GitHub</a></nav>`}
    <a class="btn primary" href="#">${phone ? 'Open session' : 'Open a session'}</a>
  </header>
  <section class="hero" aria-labelledby="hero-h">
    <div class="hero-top">
      <div class="hero-l"><h1 id="hero-h">See how your coding agent got there.</h1><p class="lede">Every session as a tree: subagents are limbs, episodes are branches, tool calls are twigs.</p></div>
      ${phone ? '' : `<div class="cmdbox"><span class="code">npx reasontrail install-skill</span><button class="iconbtn" type="button" aria-label="Copy">${icon.copy}</button></div>`}
    </div>
    <figure class="hero-tree">
      ${phone ? '' : LEGEND}
      ${phone ? tree({ width: 1136, sel, hover, bare: true, icon, glyph }).replace('width="1136" height="520.0" viewBox="0 0 1136 520.0"', 'width="358" height="190" viewBox="0 0 980 520"') : tree({ width: 1200, sel, hover, icon, glyph })}
    </figure>
    <div class="under">
      <div class="tabs" role="tablist" aria-label="Sample sessions">${SAMPLES.map((s, i) => `<button role="tab" aria-selected="${i === 0}" class="tab">${s}</button>`).join('')}</div>
      ${phone ? LEGEND : ''}
    </div>
  </section>
  <main class="frame">
    <header class="sess">
      <div class="sess-l">
        <h2>Verify phase 12, fix the audit gap, re-verify</h2>
        <p class="meta"><span>Claude Code</span><span><b>47 min</b> total</span><span><b>3</b> subagents</span><span><b>60</b> tool calls</span>${phone ? '' : '<span class="code">phase-12-structure-redact</span>'}<span class="tag">Sample</span></p>
      </div>
      ${phone ? '' : `<div class="sess-r"><button class="btn ghost" type="button">AI titles</button><button class="btn ghost" type="button">Details</button><button class="btn ghost" type="button">Share</button></div>`}
    </header>
    ${phone ? `<div class="side">${resCells()}</div>` : ''}
    <div class="cols vcols">
      ${gitlist({ width: phone ? 358 : 680, sel, hover, phone, icon, glyph })}
      ${phone ? '' : sel ? detail() : outcome()}
    </div>
    ${phone ? `<section class="block ph-changes"><h3>Final answer</h3><p class="answer">VERDICT: PASS. Round 2 of Phase 12 on <span class="code">phase-12-structure-redact</span> at HEAD <span class="code">cceb2d5</span>. The round-1 problem is fixed, and lint, typecheck, tests and the sample audit all pass.</p></section>` : ''}
  </main>
  <section class="install">
    <div class="ins-l"><h2>Map your own sessions</h2><p class="muted">Install the skill once, then ask your agent to map the current session. It opens in your browser; nothing is uploaded.</p></div>
    <div class="ins-r">
      <div class="cmdbox big"><span class="code">npx reasontrail install-skill</span><button class="iconbtn" type="button" aria-label="Copy">${icon.copy}</button></div>
      <dl class="agents"><div><dt>Claude Code</dt><dd class="code">/reasontrail</dd></div><div><dt>Grok Build</dt><dd class="code">/reasontrail</dd></div><div><dt>Codex</dt><dd class="code">$reasontrail</dd></div></dl>
    </div>
  </section>
  <section class="more" aria-labelledby="more-h">
    <a class="maker" href="https://geekplux.com"><h2 id="more-h">Made by GeekPlux</h2><p class="muted">Writing, projects and data visualization</p><span class="url">geekplux.com</span></a>
    <ul class="sites">${MORE.map(([n, u, d]) => `<li><a href="https://${u}"><span class="strong">${n}</span><span class="muted">${d}</span><span class="url">${u}</span></a></li>`).join('')}</ul>
  </section>
  <footer class="foot">
    <a class="brand" href="#">${mark}<span>Reasontrail</span></a>
    <nav><a href="#">How to read a map</a><a href="#">Next-token garden</a><a href="#">GitHub</a><span class="muted">MIT licence</span></nav>
  </footer>
</div>`;
}

function openPage() {
  return `<div class="rt light desk" style="width:1440px">
  <header class="bar">
    <a class="brand" href="#">${mark}<span>Reasontrail</span></a>
    <nav class="nav"><a href="#">How to read a map</a><a href="#">Install</a><a href="#">GitHub</a></nav>
    <a class="btn primary" href="#">Open a session</a>
  </header>
  <main class="open">
    <h2>Open a session</h2>
    <div class="drop">
      <svg class="ic" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.75h8.5l4.75 4.75v13.75H6z" fill="var(--slate-1)" stroke="var(--slate-11)" stroke-width="1.25" stroke-linejoin="round"/><path d="M14.25 2.75V7.75h5" fill="none" stroke="var(--slate-11)" stroke-width="1.25" stroke-linejoin="round"/><path d="M9.5 13h6M9.5 16.5h4" stroke="var(--slate-11)" stroke-width="1.25" stroke-linecap="round"/></svg>
      <p class="strong">Drop a session file</p>
      <button class="btn ghost" type="button">Choose file</button>
      <p class="muted small">Parsed in your browser. Nothing is uploaded.</p>
    </div>
    <dl class="where">
      <div><dt>Claude Code</dt><dd class="code">~/.claude/projects/&lt;folder&gt;/&lt;id&gt;.jsonl</dd></div>
      <div><dt>Codex</dt><dd class="code">~/.codex/sessions/…/rollout-….jsonl</dd></div>
      <div><dt>Grok Build</dt><dd><span class="code">updates.jsonl</span> in the session folder</dd></div>
      <div><dt>Chat</dt><dd><a class="link" href="#">Paste the text</a> or drop a ChatGPT or Claude <span class="code">conversations.json</span></dd></div>
    </dl>
    <p class="muted small">Files up to 50 MB.</p>
  </main>
</div>`;
}

function spec() {
  const sw = (scale, steps) => steps.map((i) => `<div class="sw"><i style="background:var(--${scale}-${i})"></i><span>${scale} ${i}</span></div>`).join('');
  return `<div class="rt light desk spec" style="width:1440px">
  <section class="sp-row"><h2>Colour</h2><div class="sp-body">
    <p class="muted">Radix Colors 3.0, three scales. Slate carries the interface; blue marks what passed and what is selected; orange marks failures and trouble. Each scale is used by its steps: 1 and 2 backgrounds, 3 to 5 component fills, 6 to 8 borders and marks, 9 and 10 solid fills, 11 and 12 text.</p>
    <div class="sws">${sw('slate', [1, 2, 3, 6, 7, 8, 9, 11, 12])}</div>
    <div class="sws">${sw('blue', [3, 9, 11])}${sw('orange', [3, 9, 11])}</div>
  </div></section>
  <section class="sp-row"><h2>Type</h2><div class="sp-body sp-type">
    <p style="font-size:32px;font-weight:600;letter-spacing:-0.025em;line-height:1.1">32 Headline</p>
    <p style="font-size:20px;font-weight:600;letter-spacing:-0.015em">20 Session and section titles</p>
    <p style="font-size:14px">14 Body, rows, controls. Weight 500 for row titles, 600 for headings.</p>
    <p style="font-size:12px" class="muted">12 Labels, meta, code. Geist and Geist Mono.</p>
  </div></section>
  <section class="sp-row"><h2>Shape</h2><div class="sp-body sp-shape">
    <div class="nest"><div class="nest-in">6</div></div>
    <p class="muted">Lines are 0.5px. Radii nest: inner 6 + padding 4 = outer 10, inner 10 + 4 = 14. No shadows and no coloured edge stripes.</p>
  </div></section>
  <section class="sp-row"><h2>Marks</h2><div class="sp-body"><p class="legend big">${['discuss', 'explore', 'change', 'verify', 'answer'].map((k) => `<span>${glyph(k, 16)}${KIND[k]}</span>`).join('')}</p><p class="muted">Shape names the kind, so colour is never the only signal. Motion: colour and background only, 250ms ease-out, none under reduced motion.</p></div></section>
</div>`;
}

const CSS = `
.rt { ${vars('light')}
  --bg: var(--slate-1); --hair: 0.5px solid var(--slate-7); --hair-soft: 0.5px solid var(--slate-6);
  --f: "Geist", ui-sans-serif, system-ui, sans-serif; --mono: "Geist Mono", ui-monospace, monospace;
  --s12: 12px; --s14: 14px; --s20: 20px; --s32: 32px;
  --r-in: 6px; --pad: 4px; --r-out: 10px; --r-frame: 16px;
  background: var(--slate-1); color: var(--slate-12); font: 400 var(--s14)/1.5 var(--f); font-feature-settings: "tnum" 1; -webkit-font-smoothing: antialiased; box-sizing: border-box; }
.rt.dark { ${vars('dark')} }
.rt *, .rt *::before, .rt *::after { box-sizing: border-box; }
.rt h1, .rt h2, .rt h3, .rt h4, .rt p, .rt ol, .rt ul, .rt dl, .rt dd, .rt pre { margin: 0; padding: 0; }
.rt ol, .rt ul { list-style: none; }
.rt a { color: inherit; text-decoration: none; }
.rt button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.rt .code { font-family: var(--mono); font-size: var(--s12); }
.rt .muted { color: var(--slate-11); }
.rt .strong { font-weight: 500; }
.rt .ic { flex: none; display: block; }
.rt .g { flex: none; display: block; color: var(--slate-12); }

/* Bar */
.rt .bar { height: 64px; display: flex; align-items: center; gap: 32px; padding: 0 120px; border-bottom: var(--hair-soft); }
.rt .brandrow { display: flex; align-items: center; gap: 12px; }
.rt .brand .logo { margin-left: -1px; }
.rt .by { color: var(--slate-11); }
.rt .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--s14); letter-spacing: -0.01em; }
.rt .logo { color: var(--slate-12); display: block; }
.rt .nav { margin-left: auto; display: flex; gap: 24px; color: var(--slate-11); }
.rt .btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: var(--r-in); font-weight: 500; white-space: nowrap; }
.rt .btn.primary { background: var(--slate-12); color: var(--slate-1); }
.rt .btn.ghost { box-shadow: inset 0 0 0 0.5px var(--slate-7); background: var(--slate-1); }
.rt .btn.small { height: 28px; padding: 0 10px; }
.rt .btn[aria-disabled="true"] { color: var(--slate-9); }
.rt .iconbtn { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--r-in); color: var(--slate-11); }
.rt .link { color: var(--slate-11); font-weight: 500; text-decoration: underline 0.5px var(--slate-8); text-underline-offset: 3px; }

/* Hero: the promise, then the tree itself as the picture */
.rt .hero { padding: 64px 120px 0; }
.rt .hero-top { display: flex; align-items: last baseline; justify-content: space-between; gap: 32px; }
.rt .lede { margin-top: 12px; font-size: var(--s20); line-height: 1.4; letter-spacing: -0.01em; color: var(--slate-11); max-width: 34ch; }
.rt .hero-tree { position: relative; margin: 32px 0 0; }
.rt .hero-tree > .legend { position: absolute; top: 0; right: 0; }
.rt .tab { white-space: nowrap; }
.rt .legend { white-space: nowrap; }
.rt .hero-tree .tree { margin: 0; }
.rt .under { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 24px; }
.rt h1 { font-size: var(--s32); line-height: 1.1; font-weight: 600; letter-spacing: -0.025em; max-width: 18ch; text-wrap: balance; }
.rt .cmdbox { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 6px 0 14px; border-radius: var(--r-out); background: var(--slate-2); box-shadow: inset 0 0 0 0.5px var(--slate-6); }
.rt .cmdbox .code { color: var(--slate-12); }

/* Sample tabs: a segmented control, outer radius = inner radius + padding */
.rt .tabs { display: flex; gap: 0; width: fit-content; margin: 0; padding: var(--pad); border-radius: var(--r-out); background: var(--slate-3); }
.rt .tab { height: 32px; padding: 0 12px; border-radius: var(--r-in); color: var(--slate-11); font-weight: 500; }
.rt .tab[aria-selected="true"] { background: var(--slate-1); color: var(--slate-12); box-shadow: 0 0 0 0.5px var(--slate-7); }

/* The map frame */
.rt .frame { margin: 32px 120px 0; border-radius: var(--r-frame); background: var(--slate-1); box-shadow: inset 0 0 0 0.5px var(--slate-7); padding: 32px; }
.rt .sess { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
.rt .tag { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 4px; background: var(--slate-3); color: var(--slate-11); font: 500 var(--s12)/1 var(--f); }
.rt .sess h2 { font-size: var(--s20); line-height: 1.3; font-weight: 600; letter-spacing: -0.015em; margin-top: 0; }
.rt .meta { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 20px; margin-top: 8px; color: var(--slate-11); }
.rt .meta b { color: var(--slate-12); font-weight: 500; }
.rt .meta .code { align-self: baseline; }
.rt .sess-r { display: flex; gap: 8px; }

.rt .route { padding-top: 24px; }
.rt .route-head { display: flex; align-items: center; gap: 24px; }
.rt h3 { font-size: var(--s14); font-weight: 600; }
.rt .legend { display: flex; gap: 16px; color: var(--slate-11); font-size: var(--s12); }
.rt .legend span { display: inline-flex; align-items: center; gap: 6px; }
.rt .legend .g { color: var(--slate-11); }
.rt .route-head .btn { margin-left: auto; }
.rt .tree { display: block; margin-top: 8px; overflow: visible; }
.rt .tree .b { fill: var(--slate-12); }
.rt .tree .b-wait { fill: none; stroke: var(--slate-9); stroke-width: 1.5; stroke-dasharray: 0.5 4; stroke-linecap: round; }
.rt .tree .tw { stroke: var(--slate-12); stroke-width: 1; stroke-linecap: round; }
.rt .tree .tw.th { stroke: var(--slate-8); }
.rt .tree .tw.fail { stroke: var(--orange-9); }
.rt .tree .dot { fill: var(--slate-12); }
.rt .tree .bud { fill: var(--slate-1); stroke: var(--slate-12); stroke-width: 1; }
.rt .tree .x { stroke: var(--orange-9); stroke-width: 1.5; stroke-linecap: round; }
.rt .tree .back { fill: none; stroke: var(--slate-9); stroke-width: 1; stroke-dasharray: 2 3; }
.rt .tree .back-end { fill: var(--slate-1); stroke: var(--slate-9); stroke-width: 1; }
.rt .tree .halo { fill: var(--slate-1); }
.rt .tree .root { fill: var(--slate-12); }
.rt .tree .tip-fail { color: var(--orange-9); }
.rt .tree .tip-ok { color: var(--blue-9); }
.rt .tree .lead { fill: none; stroke: var(--slate-9); stroke-width: 0.5; }
.rt .tree .ring { fill: none; stroke: var(--blue-9); stroke-width: 1.5; }
.rt .tree .b.hi { fill: var(--blue-9); }
.rt .tree.dim .b:not(.hi) { fill: var(--slate-9); }
.rt .tree.dim .tw:not(.fail):not(.th) { stroke: var(--slate-9); }
.rt .tree.dim .dot { fill: var(--slate-9); }
.rt .tree.dim .bud { stroke: var(--slate-9); }
.rt .t-lane { font: 600 var(--s14) var(--f); fill: var(--slate-12); }
.rt .t-ep { font: 500 var(--s14) var(--f); fill: var(--slate-12); }
.rt .t-ep.on, .rt .t-step.on { fill: var(--blue-11); }
.rt .t-step { font: 400 var(--s14) var(--f); fill: var(--slate-12); }
.rt .t-warn { fill: var(--slate-12); font-weight: 500; }
.rt .tree .leader { fill: none; stroke: var(--slate-8); stroke-width: 0.5; stroke-dasharray: 1 3; }
.rt .vcols { grid-template-columns: 680px 360px; justify-content: space-between; margin-top: 32px; }
.rt.phone .vcols { margin-top: 24px; }
.rt .tree .b.hv { fill: var(--slate-12); }
.rt .tree.hvmode .b:not(.hv) { fill: var(--slate-8); }
.rt .tree.hvmode .tw:not(.hv):not(.fail):not(.th) { stroke: var(--slate-8); }
.rt .tree.hvmode .dot:not(.hv) { fill: var(--slate-8); }
.rt .tree.hvmode .bud:not(.hv) { stroke: var(--slate-8); }
.rt .tree .t-num { paint-order: stroke; stroke: var(--bg); stroke-width: 4px; stroke-linejoin: round; }
.rt .tree .leaf { fill: var(--slate-12); }
.rt .tree.dim .leaf { fill: var(--slate-9); }
.rt .tree .leaf.hv { fill: var(--slate-12); }
.rt .tree.hvmode .leaf:not(.hv) { fill: var(--slate-8); }
.rt .tree .back { stroke: var(--slate-8); }
.rt .tree .tip-box { fill: var(--slate-1); stroke: var(--slate-7); stroke-width: 0.5; }
.rt .glist { display: block; overflow: visible; }
.rt .glist .rule { stroke: var(--slate-6); stroke-width: 0.5; }
.rt .t-head { font: 500 var(--s12) var(--f); fill: var(--slate-11); }
.rt .glist .r-main, .rt .glist .r-sub, .rt .glist .r-wait, .rt .glist .r-hi { fill: none; stroke-linecap: round; }
.rt .glist .r-main { stroke: var(--slate-12); stroke-width: 2; }
.rt .glist .r-sub { stroke: var(--slate-12); stroke-width: 1.5; }
.rt .glist .r-wait { stroke: var(--slate-8); stroke-width: 1.5; stroke-dasharray: 0.5 4; }
.rt .glist .r-hi { stroke: var(--blue-9); stroke-width: 2; }
.rt .glist .m-root, .rt .glist .m-fork { fill: var(--slate-12); }
.rt .glist .m-end { fill: var(--slate-1); stroke: var(--slate-12); stroke-width: 1.5; }
.rt .glist .m-step { fill: var(--slate-12); }
.rt .glist .m-think { fill: var(--slate-8); }
.rt .glist .x { stroke: var(--orange-9); stroke-width: 1.5; stroke-linecap: round; }
.rt .glist .halo { fill: var(--slate-1); }
.rt .glist .halo.on { fill: var(--blue-3); }
.rt .glist .halo.hv { fill: var(--slate-3); }
.rt .glist .row-on { fill: var(--blue-3); }
.rt .glist .row-hv { fill: var(--slate-3); }
.rt .glist .row-sel { fill: var(--slate-3); }
.rt .glist .ring { fill: none; stroke: var(--blue-9); stroke-width: 1.5; }
.rt .glist .tip-fail { color: var(--orange-9); }
.rt .glist .tip-ok { color: var(--blue-9); }
.rt.phone .vcols { display: block; }
.rt .t-call, .rt .t-think, .rt .t-fail, .rt .t-idle { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.rt .t-call { stroke: var(--slate-12); stroke-width: 2.5; }
.rt .t-think { stroke: var(--slate-8); stroke-width: 2.5; }
.rt .t-call.on { stroke: var(--blue-9); }
.rt .t-think.on { stroke: var(--blue-6); }
.rt .t-fail { stroke: var(--orange-9); stroke-width: 3; }
.rt .t-idle { stroke: var(--slate-8); stroke-width: 1.5; stroke-dasharray: 0.5 5; }
.rt .t-halo { fill: var(--slate-1); }
.rt .t-node { color: var(--slate-12); --bg: var(--slate-1); }
.rt .t-node.on { color: var(--blue-11); }
.rt .t-ring { fill: none; stroke: var(--blue-9); stroke-width: 1.5; }
.rt .t-num { font: 500 var(--s12) var(--f); fill: var(--slate-11); }
.rt .t-num.on { fill: var(--blue-11); font-weight: 600; }
.rt .t-lab { font: 500 var(--s12) var(--f); fill: var(--slate-12); }
.rt .lg-gap { width: 8px; }
.rt .t-sub { font: 400 var(--s12) var(--f); fill: var(--slate-11); }

/* Episodes and the outcome column */
.rt .cols { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 48px; margin-top: 24px; align-items: start; }
.rt .list-head, .rt .ep { display: grid; grid-template-columns: 24px 88px minmax(0, 1fr) 48px 56px; column-gap: 12px; align-items: start; }
.rt .ep > * { min-height: 20px; line-height: 20px; }
.rt .list-head { padding: 0 12px 8px; color: var(--slate-11); font-size: var(--s12); font-weight: 500; border-bottom: var(--hair-soft); }
.rt .list-head span:nth-child(4), .rt .list-head span:nth-child(5) { text-align: right; }
.rt .ep, .rt .lane { padding: 10px 12px; border-radius: 8px; }
.rt .lane { display: grid; grid-template-columns: 24px 88px minmax(0, 1fr) 48px 56px; column-gap: 12px; align-items: start; margin-top: 12px; }
.rt .lane > * { min-height: 20px; line-height: 20px; }
.rt .lane .tt { font-weight: 600; }
.rt .lane .title { display: grid; gap: 2px; min-width: 0; }
.rt .lane .sub { display: flex; gap: 12px; font-size: var(--s12); line-height: 16px; }
.rt .lane .kind { display: inline-flex; align-items: center; height: 20px; }
.rt .lane .steps, .rt .lane .at { text-align: right; color: var(--slate-11); font-size: var(--s12); }
.rt .group > ol { position: relative; }
.rt .group > ol::before { content: ""; position: absolute; left: 4px; top: 0; bottom: 10px; border-left: 0.5px solid var(--slate-7); }
.rt .ep + .ep, .rt .idle + .ep, .rt .ep + .idle { margin-top: 0; }
.rt .ep.on { background: var(--blue-3); }
.rt .ep .num { color: var(--slate-11); font-size: var(--s12); }
.rt .ep .kind { display: inline-flex; align-items: center; gap: 8px; color: var(--slate-11); font-size: var(--s12); height: 20px; }
.rt .ep.on .num, .rt .ep.on .kind, .rt .ep.on .steps, .rt .ep.on .at { color: var(--blue-12); }
.rt .ep.on .g { color: var(--blue-11); }
.rt .ep .title { display: grid; gap: 2px; min-width: 0; }
.rt .ep .tt { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt .ep .sub { display: flex; gap: 12px; font-size: var(--s12); line-height: 16px; }
.rt .trb { display: inline-flex; align-items: center; gap: 6px; color: var(--slate-12); font-weight: 500; }
.rt .ep .steps { text-align: right; color: var(--slate-11); font-size: var(--s12); }
.rt .ep .at { text-align: right; color: var(--slate-11); font-size: var(--s12); }
.rt .idle { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 6px 12px; color: var(--slate-11); font-size: var(--s12); }
.rt .idle span:first-child { grid-column: 1; height: 0; border-top: 0.5px dashed var(--slate-8); }
.rt .idle::after { content: ""; grid-column: 3; height: 0; border-top: 0.5px dashed var(--slate-8); }
.rt .steplist { padding: 4px 12px 12px 52px; }
.rt .steplist ol { border-left: 0.5px solid var(--slate-7); }
.rt .st { display: grid; grid-template-columns: 14px minmax(0, 1fr) 56px 56px; gap: 10px; align-items: center; padding: 6px 12px; font-size: var(--s12); }
.rt .st.th { color: var(--slate-11); }
.rt .st .rc, .rt .st .at { color: var(--slate-11); text-align: right; }
.rt .st .code { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt .st.cur { background: var(--slate-3); border-radius: 6px; }
.rt .st.cur .rc { color: var(--slate-12); font-weight: 500; }
.rt .steplist .link { margin: 8px 0 0 12px; font-size: var(--s12); }

.rt .side { display: grid; gap: 28px; }
.rt .res { display: grid; border-radius: var(--r-out); box-shadow: inset 0 0 0 0.5px var(--slate-7); }
.rt .res-row { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; }
.rt .res-row + .res-row { border-top: var(--hair-soft); }
.rt .res-row .ic { margin-top: 2px; }
.rt .res-row p + p { margin-top: 2px; }
.rt .block { display: grid; gap: 12px; }
.rt .files { display: grid; gap: 8px; }
.rt .files li { display: grid; grid-template-columns: minmax(0, 1fr) auto 48px 16px; gap: 8px; align-items: center; }
.rt .files .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rt .files .tag { background: var(--blue-3); color: var(--blue-11); }
.rt .files .meter { height: 4px; border-radius: 2px; background: var(--slate-3); overflow: hidden; }
.rt .files .meter i { display: block; height: 100%; background: var(--slate-12); }
.rt .files .n { text-align: right; color: var(--slate-11); font-size: var(--s12); }
.rt .answer { color: var(--slate-12); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.rt .block .link { justify-self: start; font-size: var(--s12); }

.rt .detail { gap: 16px; padding: 20px; border-radius: 14px; background: var(--slate-2); box-shadow: inset 0 0 0 0.5px var(--slate-6); }
.rt .d-head { display: flex; justify-content: space-between; align-items: center; font-size: var(--s12); margin: -4px -8px -4px 0; }
.rt .d-title { display: flex; align-items: center; gap: 8px; }
.rt .d-title .at { margin-left: auto; color: var(--slate-11); font-size: var(--s12); }
.rt pre { font: 400 var(--s12)/1.6 var(--mono); white-space: pre-wrap; word-break: break-word; padding: 12px; border-radius: 6px; background: var(--slate-1); box-shadow: inset 0 0 0 0.5px var(--slate-6); color: var(--slate-12); }
.rt pre.out { max-height: 220px; overflow: hidden; }
.rt .d-label { display: flex; gap: 8px; font-size: var(--s12); font-weight: 600; }
.rt .d-label .muted { font-weight: 400; }
.rt .d-src { font-size: var(--s12); }
.rt .d-next { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 8px; align-items: start; }
.rt .d-next .ic { margin-top: 3px; }
.rt .d-next pre { margin-top: 8px; }
.rt .d-nav { display: flex; justify-content: space-between; }

/* Install and footer */
.rt .install { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: start; margin: 96px 120px 0; padding-top: 40px; border-top: var(--hair-soft); }
.rt .install h2 { font-size: var(--s20); font-weight: 600; letter-spacing: -0.015em; }
.rt .install .muted { margin-top: 8px; max-width: 44ch; }
.rt .cmdbox.big { height: 48px; width: 100%; justify-content: space-between; padding: 0 8px 0 16px; }
.rt .agents { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
.rt .agents dt { color: var(--slate-11); font-size: var(--s12); }
.rt .agents dd { margin-top: 2px; }
.rt .more { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; margin: 72px 120px 0; padding-top: 40px; border-top: var(--hair-soft); }
.rt .maker { display: grid; gap: 8px; align-content: start; }
.rt .maker h2 { font-size: var(--s20); font-weight: 600; letter-spacing: -0.015em; }
.rt .url { font: 400 var(--s12) var(--mono); color: var(--slate-11); }
.rt .maker .url { color: var(--slate-12); text-decoration: underline 0.5px var(--slate-8); text-underline-offset: 3px; }
.rt .sites { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 48px; }
.rt .sites a { display: grid; gap: 2px; }
.rt .sites .url { margin-top: 4px; }
.rt .foot { display: flex; align-items: center; justify-content: space-between; margin: 72px 120px 0; padding: 24px 0 40px; border-top: var(--hair-soft); }
.rt .foot nav { display: flex; gap: 24px; color: var(--slate-11); }

/* Open */
.rt .open { width: 640px; margin: 0 auto; padding: 96px 0 160px; display: grid; gap: 24px; }
.rt .open h2 { font-size: var(--s20); font-weight: 600; letter-spacing: -0.015em; }
.rt .drop { display: grid; justify-items: center; gap: 12px; padding: 56px 24px; border-radius: 16px; background: var(--slate-2); box-shadow: inset 0 0 0 0.5px var(--slate-7); text-align: center; }
.rt .drop .btn { margin-top: 4px; }
.rt .small { font-size: var(--s12); }
.rt .where { display: grid; gap: 0; }
.rt .where div { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 16px; padding: 10px 0; border-bottom: var(--hair-soft); align-items: baseline; }
.rt .where dt { color: var(--slate-11); font-size: var(--s12); }
/* Spec */
.rt.spec { padding: 64px 120px; display: grid; gap: 0; }
.rt .sp-row { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 48px; padding: 32px 0; border-bottom: var(--hair-soft); }
.rt .sp-row h2 { font-size: var(--s20); font-weight: 600; letter-spacing: -0.015em; }
.rt .sp-body { display: grid; gap: 20px; max-width: 880px; }
.rt .sws { display: flex; flex-wrap: wrap; gap: 12px; }
.rt .sw { display: grid; gap: 6px; width: 84px; font-size: var(--s12); color: var(--slate-11); }
.rt .sw i { display: block; height: 40px; border-radius: 6px; box-shadow: inset 0 0 0 0.5px var(--slate-6); }
.rt .sp-type { gap: 12px; }
.rt .sp-shape { grid-template-columns: auto minmax(0, 1fr); align-items: center; }
.rt .nest { padding: 4px; border-radius: 14px; background: var(--slate-3); box-shadow: inset 0 0 0 0.5px var(--slate-7); }
.rt .nest-in { width: 120px; height: 56px; border-radius: 10px; background: var(--slate-1); box-shadow: 0 0 0 0.5px var(--slate-6); display: grid; place-items: center; color: var(--slate-11); font-size: var(--s12); }
.rt .legend.big { font-size: var(--s14); gap: 24px; color: var(--slate-12); }
.rt .legend.big .g { color: var(--slate-12); }

/* Phone */
.rt.phone .bar { height: 56px; padding: 0 16px; justify-content: space-between; }
.rt.phone .hero { padding: 40px 16px 0; }
.rt.phone .hero-top { display: block; }
.rt.phone .lede { font-size: var(--s14); line-height: 1.5; margin-top: 12px; }
.rt.phone .hero-tree { margin-top: 24px; }
.rt.phone .under { display: block; margin-top: 16px; }
.rt.phone .under .legend { margin-top: 12px; }
.rt.phone .frame { margin-top: 24px; }
.rt.phone .more { grid-template-columns: 1fr; gap: 28px; margin: 56px 16px 0; padding-top: 28px; }
.rt.phone .sites { grid-template-columns: 1fr; gap: 20px; }
.rt.phone .tabs { max-width: 100%; overflow: hidden; }
.rt.phone .tab { flex: none; }
.rt.phone .frame { margin: 0; border-radius: 0; box-shadow: inset 0 0.5px 0 var(--slate-6), inset 0 -0.5px 0 var(--slate-6); padding: 24px 16px; }
.rt.phone .sess { padding-bottom: 20px; }
.rt.phone .side { margin-top: 20px; }
.rt.phone .route-head { flex-wrap: wrap; row-gap: 8px; }
.rt.phone .legend { flex-wrap: wrap; gap: 6px 12px; }
.rt.phone .cols { display: block; margin-top: 16px; }
.rt.phone .list-head { display: none; }
.rt.phone .ep { grid-template-columns: 20px minmax(0, 1fr) auto; padding: 10px 0; }
.rt.phone .ep .kind span, .rt.phone .ep .at { display: none; }
.rt.phone .ep .kind { grid-column: 1; grid-row: 1; }
.rt.phone .ep .num { display: none; }
.rt.phone .ep .title { grid-column: 2; }
.rt.phone .ep .steps { grid-column: 3; }
.rt.phone .idle { padding: 4px 0; }
.rt.phone .lane { grid-template-columns: minmax(0, 1fr) auto; padding: 12px 0 6px; }
.rt.phone .lane .num, .rt.phone .lane .kind, .rt.phone .lane .at { display: none; }
.rt.phone .lane .steps { grid-column: 2; grid-row: 1; }
.rt.phone .group > ol { padding-left: 16px; }
.rt.phone .ph-changes { margin-top: 28px; }
.rt.phone .install { grid-template-columns: 1fr; gap: 20px; margin: 56px 16px 0; }
.rt.phone .agents { gap: 8px; }
.rt.phone .foot { flex-direction: column; align-items: flex-start; gap: 16px; margin: 56px 16px 0; }
.rt.phone .foot nav { flex-wrap: wrap; gap: 8px 16px; }
`;

const FONTS = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap';
export const boards = {
  Home: { theme: 'light', phone: false, sel: 0 },
  HomeDark: { theme: 'dark', phone: false, sel: 0 },
  Hover: { theme: 'light', phone: false, sel: 0, hover: 'e19' },
  Step: { theme: 'light', phone: false, sel: 's41' },
  Phone: { theme: 'light', phone: true, sel: 0 },
};
const extra = { Open: openPage(), Spec: spec() };
for (const [name, b] of Object.entries({ ...boards, ...extra })) {
  const html = typeof b === 'string' ? b : page(b);
  writeFileSync(`${OUT}v7preview/${name}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reasontrail ${name}</title><link rel="stylesheet" href="${FONTS}"><style>body{margin:0;background:#888}${CSS}</style></head><body>${html}</body></html>`);
}
writeFileSync(`${OUT}v7parts.json`, JSON.stringify({ CSS, FONTS, pages: { ...Object.fromEntries(Object.entries(boards).map(([n, b]) => [n, page(b)])), ...extra } }));
console.log('ok');
