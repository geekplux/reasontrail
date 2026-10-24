// The session as a git-style list: straight rails, a fork where a subagent starts, a merge where its verdict returns.
// One row per episode; opening an episode lists its steps as small marks on the same rail. Clarity over ornament.
import { LANES, EPISODES } from './tree.mjs';

const f1 = (v) => v.toFixed(1);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function gitlist({ width, phone, sel, hover, icon, glyph }) {
  const MX = 4.5, SX = 28.5, NUM = phone ? 52 : 64, TITLE = phone ? 52 : 92;
  const STEPS = width - (phone ? 0 : 64), START = width;
  const selEp = sel ? EPISODES.find((e) => e.rs.some((r) => r.id === sel)) : null;
  const hovEp = hover ? EPISODES.find((e) => e.id === hover) : null;
  const vic = { fail: icon.fail, ok: icon.ok, commit: `<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h3M11.5 8h3" stroke="var(--slate-12)" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="3.25" fill="none" stroke="var(--slate-12)" stroke-width="1.5"/></svg>` };
  const G = { bg: [], rails: [], hi: [], marks: [], text: [] };
  const right = (y, a, b, cls = 't-sub') => {
    if (phone) { G.text.push(`<text x="${START}" y="${y}" text-anchor="end" class="${cls}">${a}</text>`); return; }
    if (a !== '') G.text.push(`<text x="${STEPS}" y="${y}" text-anchor="end" class="${cls}">${a}</text>`);
    G.text.push(`<text x="${START}" y="${y}" text-anchor="end" class="t-sub">${b}</text>`);
  };
  const rowBg = (y0, h, cls) => G.bg.push(`<rect x="${phone ? -8 : -12}" y="${y0}" width="${width + (phone ? 16 : 24)}" height="${h}" rx="8" class="${cls}"/>`);

  let y = 0;
  // Header.
  if (!phone) {
    G.text.push(`<text x="${NUM}" y="12" class="t-head">#</text><text x="${TITLE}" y="12" class="t-head">Episode</text><text x="${STEPS}" y="12" text-anchor="end" class="t-head">Steps</text><text x="${START}" y="12" text-anchor="end" class="t-head">Start</text>`);
    G.rails.push(`<path d="M0 24.25H${width}" class="rule"/>`);
    y = 32;
  }
  const rootY = y + 20;
  G.marks.push(`<circle cx="${MX}" cy="${rootY}" r="4.5" class="m-root"/>`);
  G.text.push(`<text x="${TITLE}" y="${rootY + 5}" class="t-lane">Main agent</text>`);
  right(rootY + 5, '', '0 min');
  y += 40;
  const pathPts = []; // rail segments from the root to the selection, for the blue overlay
  let mainFrom = rootY;
  for (const L of LANES) {
    const ly = y + 20;
    // Main rail down to the fork.
    G.rails.push(`<path d="M${MX} ${f1(mainFrom)}V${f1(ly)}" class="r-main"/>`);
    if (selEp && selEp.lane === L.key) pathPts.push(`M${MX} ${f1(rootY)}V${f1(ly)}`);
    // Fork: a quarter curve from the main rail to the subagent rail.
    const forkEnd = ly + 22;
    const fork = `M${MX} ${f1(ly)}C${MX} ${f1(ly + 14)} ${SX} ${f1(ly + 8)} ${SX} ${f1(forkEnd)}`;
    G.rails.push(`<path d="${fork}" class="r-sub"/>`);
    G.marks.push(`<circle cx="${MX}" cy="${f1(ly)}" r="3" class="m-fork"/>`);
    G.text.push(`<text x="${TITLE}" y="${ly + 5}" class="t-lane">${esc(phone ? trunc(L.name, 24) : L.name)}</text><text x="${TITLE}" y="${ly + 23}" class="t-sub">${L.agent}</text>`);
    right(ly + 5, L.steps, `${L.at} min`);
    y += 52;
    let railFrom = forkEnd, selRailTo = null;
    for (const e of L.eps) {
      if (e.k === 'answer') {
        const vy = y + 20;
        G.rails.push(`<path d="M${SX} ${f1(railFrom)}V${f1(vy)}" class="r-sub"/>`);
        const cls = L.key === 'verify' ? 'tip-fail' : L.key === 'reverify' ? 'tip-ok' : '';
        G.marks.push(`<circle cx="${SX}" cy="${vy}" r="9" class="halo"/>` + glyph('answer', 14).replace('<svg', `<svg x="${SX - 7}" y="${vy - 7}"`).replace('class="g ', `class="g t-node ${cls} `));
        G.text.push(`<g transform="translate(${TITLE} ${vy - 8})">${vic[L.vicon]}</g><text x="${TITLE + 20}" y="${vy + 5}" class="t-lane">${L.verdict}</text><text x="${TITLE + 20}" y="${vy + 23}" class="t-sub">${L.dur}</text>`);
        right(vy + 5, e.s, `${e.at} min`);
        // Merge back into the main rail.
        const my = vy + 30;
        G.rails.push(`<path d="M${SX} ${f1(vy + 9)}C${SX} ${f1(my - 6)} ${MX} ${f1(my - 14)} ${MX} ${f1(my)}" class="r-sub"/>`);
        G.rails.push(`<path d="M${MX} ${f1(ly)}V${f1(my)}" class="r-wait"/>`);
        mainFrom = my;
        y += 56;
        continue;
      }
      const open = selEp === e;
      const hov = hovEp === e;
      const fails = e.rs.filter((r) => r.st === 'error').length, wait = e.rs.find((r) => r.wait);
      const sub = [];
      if (fails) sub.push(`${fails} failed command`);
      if (wait) sub.push(`${wait.wait} min wait`);
      const h = sub.length ? 52 : 40, ey = y + 20;
      if (open) rowBg(y + 2, h - 4, 'row-on'); else if (hov) rowBg(y + 2, h - 4, 'row-hv');
      G.rails.push(`<path d="M${SX} ${f1(railFrom)}V${f1(ey)}" class="r-sub"/>`);
      railFrom = ey;
      if (open) selRailTo = ey;
      G.marks.push(`<circle cx="${SX}" cy="${ey}" r="8" class="halo${open ? ' on' : hov ? ' hv' : ''}"/>` + glyph(e.k, 12).replace('<svg', `<svg x="${SX - 6}" y="${ey - 6}"`).replace('class="g ', `class="g t-node${open ? ' on' : ''} `));
      if (!phone) G.text.push(`<text x="${NUM}" y="${ey + 5}" class="t-num${open ? ' on' : ''}">${e.n}</text>`);
      const title = phone ? trunc(e.t, 30) : e.t;
      G.text.push(`<text x="${TITLE}" y="${ey + 5}" class="t-ep${open ? ' on' : ''}">${esc(title)}</text>`);
      if (sub.length) {
        if (fails) G.text.push(`<g transform="translate(${TITLE} ${ey + 13})">${icon.fail.replace('width="14" height="14"', 'width="12" height="12"')}</g>`);
        G.text.push(`<text x="${TITLE + (fails ? 18 : 0)}" y="${ey + 23}" class="t-sub">${fails ? `<tspan class="t-warn">${sub[0]}</tspan>${sub[1] ? `, ${sub[1]}` : ''}` : sub.join(', ')}</text>`);
      }
      right(ey + 5, e.s, `${e.at} min`);
      y += h;
      if (open) {
        const recs = e.rs.filter((r) => r.k === 'tool-call' || r.k === 'thinking');
        for (const r of recs) {
          const ry = y + 15, think = r.k === 'thinking', fail = r.st === 'error', isSel = r.id === sel;
          if (isSel) rowBg(y + 1, 28, 'row-sel');
          G.rails.push(`<path d="M${SX} ${f1(railFrom)}V${f1(ry)}" class="r-sub"/>`);
          railFrom = ry;
          if (fail) G.marks.push(`<path d="M${SX - 3} ${ry - 3}l6 6m0 -6l-6 6" class="x"/>`);
          else if (think) G.marks.push(`<circle cx="${SX}" cy="${ry}" r="2" class="m-think"/>`);
          else G.marks.push(`<circle cx="${SX}" cy="${ry}" r="2.5" class="m-step"/>`);
          if (isSel) { G.marks.push(`<circle cx="${SX}" cy="${ry}" r="7.5" class="ring"/>`); selRailTo = ry; }
          const label = think ? 'Thinking' : r.sum.replace(/^Bash /, '');
          G.text.push(`<text x="${TITLE}" y="${ry + 5}" class="${think ? 't-sub' : 't-step'}${isSel ? ' on' : ''}">${esc(phone ? trunc(label, 32) : label)}</text>`);
          if (!think) right(ry + 5, fail ? 'Exit 2' : 'Exit 0', `${Math.round(r.t)} min`, fail ? 't-lab' : 't-sub');
          y += 30;
        }
        y += 6;
      }
    }
    if (selEp && selEp.lane === L.key && selRailTo) pathPts.push(fork, `M${SX} ${f1(forkEnd)}V${f1(selRailTo)}`);
    y += 4;
  }
  const endY = y + 20;
  G.rails.push(`<path d="M${MX} ${f1(mainFrom)}V${f1(endY)}" class="r-main"/>`);
  G.marks.push(`<circle cx="${MX}" cy="${endY}" r="4" class="m-end"/>`);
  G.text.push(`<text x="${TITLE}" y="${endY + 5}" class="t-sub">Session ends</text>`);
  right(endY + 5, '', '47 min');
  for (const d of pathPts) G.hi.push(`<path d="${d}" class="r-hi"/>`);
  const H = endY + 20;
  return `<svg class="glist" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="tree" aria-label="Episodes in order">${G.bg.join('')}${G.rails.join('')}${G.hi.join('')}${G.marks.join('')}${G.text.join('')}</svg>`;
}
