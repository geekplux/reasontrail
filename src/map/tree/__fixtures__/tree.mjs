// The session as a tree, drawn from the real records of verify-fail-fix.graph.json.
// Trunk: the main agent. Limbs: the subagents it spawned. Branches: episodes. Twigs: tool calls and thinking.
// Width follows Leonardo's rule: a branch is as thick as the square root of the tool calls that grow from it.
// The along-axis is session order (one unit per record, extra room for waits over 5 minutes), so it reads in time order.
import { readFileSync } from 'node:fs';
const D = JSON.parse(readFileSync(new URL('./vff.json', import.meta.url)));

const num = (id) => +id.slice(1);
const LANE = { main: 'main' };
for (const l of D.lanes) {
  if (l.id.endsWith('a3ddc3')) LANE[l.id] = 'verify';
  if (l.id.endsWith('d81fd6')) LANE[l.id] = 'fix';
  if (l.id.endsWith('695138')) LANE[l.id] = 'reverify';
}
const recs = D.lanes.flatMap((l) => l.steps.map((s) => ({ ...s, lane: LANE[l.id] }))).sort((a, b) => num(a.id) - num(b.id));
const EPI = Object.fromEntries(D.episodes.map((e) => [e.id, e]));

// Episode order and numbers: lanes in the order they ran, episodes in record order.
export const LANES = [
  { key: 'verify', name: 'Verify phase 12', agent: 'Verifier', side: -1, spawn: 's0', verdict: 'Failed: 1 gap', vicon: 'fail', dur: '34 min', steps: 96, at: '0' },
  { key: 'fix', name: 'Fix phase 12 audit gap', agent: 'Implementer', side: 1, spawn: 's98', verdict: 'Committed cceb2d5', vicon: 'commit', dur: '12 min', steps: 32, at: '34' },
  { key: 'reverify', name: 'Re-verify phase 12', agent: 'Verifier', side: 0, spawn: 's132', verdict: 'Passed', vicon: 'ok', dur: '1 min', steps: 33, at: '46' },
];
const TITLES = {
  e13: 'Verify Phase 12: structuring and redaction', e9: 'Fix exactly this verifier problem for Phase 12', e3: 'Re-verify Phase 12 at cceb2d5',
};
export const EPISODES = [];
let n = 0;
for (const L of LANES) {
  const ids = [...new Set(recs.filter((r) => r.lane === L.key).map((r) => r.ep))];
  L.eps = ids.map((id) => {
    const e = EPI[id], rs = recs.filter((r) => r.ep === id);
    const o = { id, n: ++n, lane: L.key, k: e.kind, t: TITLES[id] || e.title, s: e.n, at: String(Math.round(rs[0].t)), rs, calls: rs.filter((r) => r.k === 'tool-call').length };
    EPISODES.push(o);
    return o;
  });
  L.calls = L.eps.reduce((a, e) => a + e.calls, 0);
}

// Along-axis units.
function layout(unit, U0) {
  let u = U0, prev = null;
  for (const r of recs) {
    if (prev) {
      if (r.t - prev.t > 5) r.wait = Math.round(r.t - prev.t);
      if (prev.lane === 'main' && prev.c === 'agent') u += 9 * unit;
      if (prev.lane !== 'main' && r.lane === 'main') u += 4 * unit;
    }
    r.u = u; u += unit; prev = r;
  }
  return u;
}
const totalUnits = (() => { const end = layout(1, 0); return end; })();

// Geometry helpers.
const rad = (d) => (d * Math.PI) / 180;
const f1 = (v) => v.toFixed(1);
function ribbon(pts, wAt, proj) {
  // pts: [{u,v}] centerline; wAt(i) width at point i. Returns a closed path in screen space.
  const P = pts.map(proj);
  const L = [], R = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const w = wAt(i) / 2;
    L.push([P[i].x - dy * w, P[i].y + dx * w]); R.push([P[i].x + dy * w, P[i].y - dx * w]);
  }
  return 'M' + L.map((p) => p.map(f1).join(' ')).join('L') + 'L' + R.reverse().map((p) => p.map(f1).join(' ')).join('L') + 'Z';
}
const line = (pts, proj) => 'M' + pts.map(proj).map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L');
const fall = (u, b, d = 10) => Math.min(1, Math.max(0, (b + d - u) / d));

export function tree({ width, phone, sel, hover, bare, icon, glyph }) {
  const U0 = phone ? 28 : 15.5; // desktop: the root's left edge sits on the content edge
  const along = phone ? 640 : width - 28 - 210;
  const unit = along / totalUnits;
  layout(unit, U0);
  const uEnd = U0 + along;
  const A = phone ? 92 : 128, A2 = phone ? 92 : 112;
  const H = phone ? uEnd + 48 : 520;
  const MID = phone ? width / 2 : 300;
  const proj = phone ? (p) => ({ x: MID + p.v, y: p.u }) : (p) => ({ x: p.u, y: MID + p.v });
  const k = phone ? 0.95 : 1.45;
  const W = (c) => k * Math.sqrt(Math.max(c, 1));
  const byId = Object.fromEntries(recs.map((r) => [r.id, r]));
  const spawnU = Object.fromEntries(LANES.map((L) => [L.key, byId[L.spawn].u]));
  const out = { branches: [], hi: [], twigs: [], tips: [], dots: [], labels: [], nodes: [] };
  const selEp = sel ? EPISODES.find((e) => e.rs.some((r) => r.id === sel)) : null;
  const hovEp = hover ? EPISODES.find((e) => e.id === hover) : null;

  // Centerlines.
  const lastU = (key) => Math.max(...recs.filter((r) => r.lane === key).map((r) => r.u));
  const lines = {};
  for (const L of LANES) {
    const uF = spawnU[L.key], uE = lastU(L.key) + unit * 2;
    L.uF = uF; L.uE = uE;
    if (!L.side) continue;
    const amp = L.side < 0 ? A : A2, RISE = phone ? 64 : 96;
    const pts = [];
    for (let u = uF; u <= uE + 0.01; u += 2) {
      const t = (u - uF) / RISE;
      const t2 = Math.max(0, (u - uF - RISE) / (uE - uF - RISE));
      const v = t < 1 ? amp * (1 - Math.pow(1 - t, 2.1)) + (phone ? 10 : 22) * t * t * 0 : amp + (phone ? 14 : 34) * Math.sin(t2 * Math.PI * 0.62);
      pts.push({ u, v: L.side * v });
    }
    lines[L.key] = pts;
  }
  const trunkV = (u) => -10 * Math.sin(Math.PI * 0.9 * Math.max(0, u - U0) / (LANES[2].uE - U0));
  for (const L of LANES.slice(0, 2)) { const v0 = trunkV(L.uF); lines[L.key].forEach((p) => { p.v += v0 * Math.max(0, 1 - (p.u - L.uF) / 120); }); }
  const rv = LANES[2];
  const trunk = [];
  for (let u = U0 - (phone ? 6 : 10); u <= rv.uE + 0.01; u += 2) trunk.push({ u, v: -10 * Math.sin(Math.PI * 0.9 * Math.max(0, u - U0) / (rv.uE - U0)) });
  lines.reverify = trunk;
  const pointAt = (pts, u) => { const i = Math.max(1, pts.findIndex((p) => p.u >= u)); const p = pts[i] || pts.at(-1), q = pts[i - 1]; return { u: p.u, v: p.v, a: Math.atan2(p.v - q.v, p.u - q.u), i }; };

  // Limb and trunk widths: the calls still ahead on that limb.
  const epBase = (e) => e.rs[0].u;
  const limbCalls = (L, u) => L.eps.reduce((a, e) => a + e.calls * fall(u, epBase(e)), 0);
  const trunkCalls = (u) => {
    let c = 0;
    for (const L of LANES.slice(0, 2)) c += (L.calls + 1) * fall(u, L.uF);
    return c + (u < rv.uF ? rv.calls + 1 : limbCalls(rv, u));
  };
  const onPath = new Set();
  if (selEp) { onPath.add('trunk'); onPath.add(selEp.lane); }
  const selR = sel ? byId[sel] : null;
  const dim = !!sel;

  // Trunk (with the leader).
  const flare = (u) => (phone ? 3 : 10) * Math.exp(-(u - trunk[0].u) / 16);
  out.branches.push(`<path d="${ribbon(trunk, (i) => W(trunkCalls(trunk[i].u)) + flare(trunk[i].u), proj)}" class="b"/>`);
  if (selEp) {
    const stop = selEp.lane === 'reverify' ? epBase(selEp) : LANES.find((L) => L.key === selEp.lane).uF;
    const seg = trunk.filter((p) => p.u <= stop + 1);
    out.hi.push(`<path d="${ribbon(seg, (i) => W(trunkCalls(seg[i].u)), proj)}" class="b hi"/>`);
  }
  if (hovEp) {
    const stop = hovEp.lane === 'reverify' ? epBase(hovEp) : LANES.find((L) => L.key === hovEp.lane).uF;
    const seg = trunk.filter((p) => p.u <= stop + 1);
    out.hi.push(`<path d="${ribbon(seg, (i) => W(trunkCalls(seg[i].u)) + flare(seg[i].u), proj)}" class="b hv"/>`);
    const L = LANES.find((q) => q.key === hovEp.lane);
    if (L.side) { const ls = lines[L.key].filter((p) => p.u <= epBase(hovEp) + 1); out.hi.push(`<path d="${ribbon(ls, (i) => W(limbCalls(L, ls[i].u)), proj)}" class="b hv"/>`); }
  }
  for (const L of LANES.slice(0, 2)) {
    const pts = lines[L.key];
    out.branches.push(`<path d="${ribbon(pts, (i) => W(limbCalls(L, pts[i].u)), proj)}" class="b"/>`);
    if (selEp && selEp.lane === L.key) {
      const seg = pts.filter((p) => p.u <= epBase(selEp) + 1);
      out.hi.push(`<path d="${ribbon(seg, (i) => W(limbCalls(L, seg[i].u)), proj)}" class="b hi"/>`);
    }
  }

  // Branches (episodes) and twigs (records).
  for (const L of LANES) {
    const parent = lines[L.key];
    const outward = L.side || -1;
    L.eps.forEach((e, idx) => {
      if (e.k === 'answer') return;
      const b = pointAt(parent, epBase(e));
      const s = idx % 2 === 0 ? -outward : outward;
      const slot = e.rs.at(-1).u - e.rs[0].u + unit;
      const len = Math.max(phone ? 16 : 22, slot * (phone ? 1.3 : 1.55));
      const lenC = Math.min(len, phone ? 96 : 150);
      const N = 40, h0 = b.a + s * rad(58), h1 = b.a + s * rad(10) + (rad(-90) - (b.a + s * rad(10))) * 0.16;
      const pts = [{ u: b.u, v: b.v }];
      for (let j = 1; j <= N; j++) { const h = h0 + (h1 - h0) * (j / N); const p = pts.at(-1); pts.push({ u: p.u + (lenC / N) * Math.cos(h), v: p.v + (lenC / N) * Math.sin(h), h }); }
      pts[0].h = h0;
      const fOf = (r) => ((r.u - e.rs[0].u + 0.6 * unit) / slot) * 0.92;
      const calls = e.rs.filter((r) => r.k === 'tool-call');
      const wAtF = (f) => W(calls.reduce((a, r) => a + (fOf(r) >= f - 0.02 ? 1 : 0), 0) || 0.5) * (phone ? 0.9 : 1);
      // A wait over 5 minutes is a dotted internode.
      const waitR = null;
      const segs = [];
      if (waitR) {
        const i = e.rs.indexOf(waitR), fb = fOf(waitR) - 0.03, fa = fOf(e.rs[i - 1]) + 0.03;
        segs.push([0, fa, 'solid'], [fa, fb, 'wait'], [fb, 1, 'solid']);
        const m = pts[Math.round(((fa + fb) / 2) * N)];
        out.labels.push({ p: proj(m), text: `${waitR.wait} min`, cls: 't-sub', dx: phone ? 0 : 0, dy: 0, wait: true, s });
      } else segs.push([0, 1, 'solid']);
      const hiTo = selR && e === selEp ? fOf(selR) : null;
      for (const [fa, fb, kind] of segs) {
        const sub = pts.slice(Math.round(fa * N), Math.round(fb * N) + 1);
        if (kind === 'wait') { out.branches.push(`<path d="${line(sub, proj)}" class="b-wait"/>`); continue; }
        const fw = (i) => wAtF(fa + ((fb - fa) * i) / Math.max(1, sub.length - 1));
        out.branches.push(`<path d="${ribbon(sub, fw, proj)}" class="b${e === hovEp ? ' hv' : ''}"/>`);
        if (hiTo !== null && fa < hiTo) {
          const hs = sub.slice(0, Math.max(2, Math.round((Math.min(hiTo, fb) - fa) * N) + 1));
          out.hi.push(`<path d="${ribbon(hs, fw, proj)}" class="b hi"/>`);
        }
      }
      // Twigs.
      let side = 1;
      e.rs.forEach((r) => {
        if (r.k === 'assistant' || r.k === 'user') return;
        const f = fOf(r), q = pts[Math.min(N, Math.round(f * N))];
        side = -side;
        const fail = r.st === 'error', think = r.k === 'thinking';
        const ang = q.h + side * rad(think ? 70 : 52), tl = think ? (phone ? 4 : 5) : fail ? (phone ? 12 : 16) : phone ? 6 : 7;
        const base = proj(q), tip = proj({ u: q.u + tl * Math.cos(ang), v: q.v + tl * Math.sin(ang) });
        const isSel = r.id === sel;
        const hv = e === hovEp ? ' hv' : '';
        out.twigs.push(`<path d="M${f1(base.x)} ${f1(base.y)}L${f1(tip.x)} ${f1(tip.y)}" class="tw${think ? ' th' : ''}${fail ? ' fail' : ''}${hv}"/>`);
        if (think) return;
        if (fail) {
          const a = 2.8;
          out.tips.push(`<path d="M${f1(tip.x - a)} ${f1(tip.y - a)}L${f1(tip.x + a)} ${f1(tip.y + a)}M${f1(tip.x + a)} ${f1(tip.y - a)}L${f1(tip.x - a)} ${f1(tip.y + a)}" class="x"/>`);
        } else if (r.c === 'read') out.tips.push(`<circle cx="${f1(tip.x)}" cy="${f1(tip.y)}" r="2.4" class="bud${hv}"/>`);
        else { const L = 11, Wd = 4.2; out.tips.push(`<path d="M0 0Q${L / 2} ${-Wd} ${L} 0Q${L / 2} ${Wd} 0 0Z" transform="translate(${f1(tip.x)} ${f1(tip.y)}) rotate(${f1((Math.atan2(tip.y - base.y, tip.x - base.x) * 180) / Math.PI)})" class="leaf${hv}"/>`); }
        if (isSel) {
          out.tips.push(`<circle cx="${f1(tip.x)}" cy="${f1(tip.y)}" r="8" class="ring"/>`);
          out.callout = { tip };
        }
      });
      // Episode glyph at the branch tip, number beyond it.
      const tp = proj(pts.at(-1)), on = selEp === e;
      if (e === hovEp) out.tooltip = { tp, e };
      const r0 = phone ? 4.5 : 5.5;
      out.nodes.push(`<circle cx="${f1(tp.x)}" cy="${f1(tp.y)}" r="${r0 + 2.5}" class="halo"/>`);
      out.nodes.push(glyph(e.k, 2 * r0).replace('<svg', `<svg x="${f1(tp.x - r0)}" y="${f1(tp.y - r0)}"`).replace('class="g ', `class="g t-node${on ? ' on' : ''} `));
      const hEnd = pts.at(-1).h, lp = proj({ u: pts.at(-1).u + 15 * Math.cos(hEnd), v: pts.at(-1).v + 15 * Math.sin(hEnd) });
      if (!phone || [1, 6, 10, 14].includes(e.n)) out.labels.push({ p: lp, text: String(e.n), cls: `t-num${on ? ' on' : ''}`, num: true });
    });
  }

  // Limb tips (answers) and hand-backs to the trunk.
  for (const L of LANES) {
    const tipPt = L.side ? lines[L.key].at(-1) : trunk.at(-1);
    const tp = proj(tipPt), r0 = phone ? 6 : 7;
    const cls = L.key === 'verify' ? 'tip-fail' : L.key === 'reverify' ? 'tip-ok' : '';
    out.nodes.push(`<circle cx="${f1(tp.x)}" cy="${f1(tp.y)}" r="${r0 + 3}" class="halo"/>`);
    out.nodes.push(glyph('answer', 2 * r0).replace('<svg', `<svg x="${f1(tp.x - r0)}" y="${f1(tp.y - r0)}"`).replace('class="g ', `class="g t-node ${cls} `));
    const next = LANES[LANES.indexOf(L) + 1];
    if (next) {
      const to = proj(pointAt(trunk, next.uF));
      const fy = tp.y + (phone ? 0 : (L.side < 0 ? r0 + 3 : -(r0 + 3))), fx = tp.x + (phone ? (L.side < 0 ? r0 + 3 : -(r0 + 3)) : 0);
      const cx = phone ? to.x : (fx + to.x) / 2 + 30, cy = phone ? (fy + to.y) / 2 : fy;
      out.dots.push(`<path d="M${f1(fx)} ${f1(fy)}Q${f1(phone ? fx : to.x)} ${f1(phone ? to.y : fy)} ${f1(to.x)} ${f1(to.y)}" class="back"/>`);
      out.dots.push(`<circle cx="${f1(to.x)}" cy="${f1(to.y)}" r="2.5" class="back-end"/>`);
    }
    L.tip = tp;
  }
  // Root.
  const root = proj({ u: U0 - (phone ? 6 : 10), v: 0 });
  out.nodes.push(`<circle cx="${f1(root.x)}" cy="${f1(root.y)}" r="${phone ? 4.5 : 5.5}" class="root"/>`);

  // Text.
  const T = [];
  if (bare) out.labels = [];
  for (const l of out.labels) {
    if (l.num) { T.push(`<text x="${f1(l.p.x)}" y="${f1(l.p.y + 4)}" text-anchor="middle" class="${l.cls}">${l.text}</text>`); continue; }
    if (l.wait) {
      const off = phone ? { x: l.s * 0 + 10, y: 4, a: 'start' } : { x: 0, y: l.s < 0 ? -10 : 18, a: 'middle' };
      T.push(`<text x="${f1(l.p.x + off.x)}" y="${f1(l.p.y + off.y)}" text-anchor="${off.a}" class="t-sub">${l.text}</text>`);
    }
  }
  const vic = { fail: icon.fail, ok: icon.ok, commit: `<svg class="ic" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h3M11.5 8h3" stroke="var(--slate-12)" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="3.25" fill="none" stroke="var(--slate-12)" stroke-width="1.5"/></svg>` };
  if (bare) {} else if (!phone) {
    for (const L of LANES) {
      const up = L.key === 'reverify' ? 42 : 22, x = L.tip.x + 20, y = L.tip.y - up;
      T.push(`<g transform="translate(${f1(x)} ${f1(y)})"><text x="0" y="14" class="t-lane">${L.name}</text><g transform="translate(0 22)">${vic[L.vicon].replace('class="ic"', '')}</g><text x="20" y="34" class="t-lab">${L.verdict}</text><text x="0" y="54" class="t-sub">${L.agent}, ${L.dur}</text></g>`);
    }
    // Waiting on the trunk.
    const w1 = proj({ u: (LANES[0].uF + LANES[1].uF) / 2, v: 0 }), w2 = proj({ u: (LANES[1].uF + LANES[2].uF) / 2, v: 0 });
    T.push(`<text x="${f1(w1.x)}" y="${f1(w1.y + 24)}" text-anchor="middle" class="t-sub">Main agent waits, 34 min</text>`);
    T.push(`<text x="${f1(w2.x)}" y="${f1(w2.y - 14)}" text-anchor="middle" class="t-sub">12 min</text>`);
    T.push(`<text x="0" y="${f1(root.y + 26)}" class="t-lab">Task</text><text x="0" y="${f1(root.y + 42)}" class="t-sub">0 min</text>`);
  } else {
    for (const L of LANES) {
      T.push(`<text x="${f1(L.tip.x)}" y="${f1(L.tip.y + 26)}" text-anchor="middle" class="t-lab">${L.verdict}</text>`);
    }
  }
  if (out.callout && !phone && !bare) {
    const { tip } = out.callout;
    T.push(`<path d="M${f1(tip.x - 5)} ${f1(tip.y - 9)}L${f1(tip.x - 18)} ${f1(tip.y - 104)}" class="lead"/><g transform="translate(${f1(tip.x - 24)} ${f1(tip.y - 124)})"><text x="0" y="0" text-anchor="end" class="t-lab">Inspect vitest config for log suppression</text><text x="0" y="16" text-anchor="end" class="t-sub">Exit code 2, 16 min</text></g>`);
  }
  if (out.tooltip && !bare) {
    const { tp, e } = out.tooltip;
    const calls = e.calls, fails = e.rs.filter((r) => r.st === 'error').length, wait = e.rs.find((r) => r.wait);
    const line2 = `${e.s} steps, ${calls} tool calls${fails ? `, ${fails} failed` : ''}${wait ? `, ${wait.wait} min wait` : ''}`;
    const x = tp.x + 16, y = tp.y + 10;
    T.push(`<g transform="translate(${f1(x)} ${f1(y)})"><rect x="0" y="0" width="300" height="56" rx="8" class="tip-box"/><text x="12" y="23" class="t-num">${e.n}</text><text x="34" y="23" class="t-ep">${e.t}</text><text x="34" y="42" class="t-sub">${line2}, ${e.at} min</text></g>`);
  }
  const aria = 'Tree: the main agent spawns three subagents in turn. Verify phase 12 fails with one gap after 35 tool calls; Fix phase 12 audit gap commits cceb2d5; Re-verify phase 12 passes.';
  return `<svg class="tree${dim ? ' dim' : ''}${hovEp ? ' hvmode' : ''}" width="${width}" height="${f1(H)}" viewBox="0 0 ${width} ${f1(H)}" role="img" aria-label="${aria}">${out.dots.join('')}${out.twigs.join('')}${out.branches.join('')}${out.hi.join('')}${out.tips.join('')}${out.nodes.join('')}${T.join('')}</svg>`;
}
