// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { DATA_SLOT, TITLE_SLOT } from '../../cli/src/html';
import { findSecrets } from '../../shared/session/redact';
import type { SessionGraph } from '../../shared/session/types';
import { loadGraph } from '../map/loadGraph';
import { defaultSessionGraph } from '../sessions/samples';
import { PLACEHOLDER, planShare, redactCutTails, redactedExcerpts, shareFileName, shareHtml, templateFromDocument } from './exportHtml';

// Built at runtime so the repo never holds a token, an address or a home path.
const TOKEN = ['gh', 'p_', 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2'].join('');
const MAIL = ['ana', 'example.org'].join('@');
const HOME = ['', 'home', 'ana', 'notes'].join('/');

function leaky(): SessionGraph {
  const g = structuredClone(defaultSessionGraph);
  const step = g.steps[1]!;
  step.text = `Use ${TOKEN} and write to ${MAIL} from ${HOME}/a.md`;
  return g;
}

const TEMPLATE = `<!doctype html><html><head><title>${TITLE_SLOT}</title></head><body><div id="root"></div><script id="reasontrail-data" type="application/json">${DATA_SLOT}</script></body></html>`;

describe('planShare', () => {
  it('counts secrets, emails and paths, and previews only redacted text', () => {
    const plan = planShare(leaky());
    expect(plan.counts).toMatchObject({ secrets: 1, emails: 1, paths: 1 });
    expect(plan.counts.total).toBe(3 + plan.counts.cut);
    expect(plan.examples.length).toBeGreaterThan(0);
    const preview = plan.examples.join('\n');
    expect(preview).not.toContain(TOKEN);
    expect(preview).not.toContain(MAIL);
    expect(preview.match(PLACEHOLDER)).toEqual(expect.arrayContaining(['[secret:github-token]', '[email]', '~']));
  });

  it('leaves the input graph unchanged', () => {
    const g = leaky();
    planShare(g);
    expect(g.steps[1]?.text).toContain(TOKEN);
  });
});

describe('shareHtml', () => {
  it('writes a redacted payload the viewer loads, with the shared ribbon count, and no rule matches', () => {
    const plan = planShare(leaky());
    const html = shareHtml(TEMPLATE, plan, '0.1.0');
    expect(html).not.toContain(TOKEN);
    const json = /<script id="reasontrail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    const loaded = loadGraph(json);
    expect(loaded.ok && loaded.payload.meta.shared).toEqual({ replaced: plan.counts.total });
    const strings: string[] = [];
    JSON.parse(json ?? 'null', (_k, v: unknown) => (typeof v === 'string' && strings.push(v), v));
    expect(strings.flatMap((s) => findSecrets(s))).toEqual([]);
  });

  it('names the file after the session id', () => {
    expect(shareFileName(defaultSessionGraph)).toMatch(/^reasontrail-[A-Za-z0-9_-]{1,8}\.html$/);
    expect(shareFileName({ ...defaultSessionGraph, source: { ...defaultSessionGraph.source, sessionId: '../..' } }, 'png')).toBe('reasontrail-map.png');
  });
});

describe('templateFromDocument', () => {
  it('drops the payload, the rendered map and the inflated app script, and keeps the packed app and its loader', () => {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><head><title>My map – Reasontrail</title><style>.x{}</style></head><body><div id="root"><main>map</main></div>` +
        `<script id="reasontrail-data" type="application/json">{"graph":1}</script><script id="reasontrail-app" type="application/octet-stream">AAAA</script>` +
        `<script>document.getElementById('reasontrail-app')</script><script id="reasontrail-run">console.log("inflated app")</script></body></html>`,
      'text/html',
    );
    const t = templateFromDocument(doc);
    expect(t).toContain(`<title>${TITLE_SLOT}</title>`);
    expect(t).toContain(`>${DATA_SLOT}</script>`);
    expect(t).toContain('AAAA');
    expect(t).toContain("getElementById('reasontrail-app')");
    expect(t).not.toContain('inflated app');
    expect(t).not.toContain('<main>');
    expect(t).not.toContain('"graph":1');
  });

  it('refuses a page that is not a map file', () => {
    expect(() => templateFromDocument(new DOMParser().parseFromString('<html><body></body></html>', 'text/html'))).toThrow(/not a Reasontrail map/);
  });
});

describe('redactCutTails', () => {
  it('replaces a secret or address cut by a clip, and keeps ordinary words', () => {
    const counts: Record<string, number> = {};
    const out = redactCutTails({ a: `Use ${TOKEN.slice(0, 12)}…`, b: `mail ${MAIL.slice(0, 7)}…\n[cut 9 characters]`, c: 'Build keyboard…', d: 'no clip ghp_' }, counts);
    expect(out).toEqual({ a: 'Use [secret:cut]…', b: 'mail [secret:cut]…\n[cut 9 characters]', c: 'Build keyboard…', d: 'no clip ghp_' });
    expect(counts).toEqual({ 'secret:cut': 2 });
  });
});

describe('redactedExcerpts', () => {
  it('cuts a raw JSON line to the changed string value, skips near-duplicates and keeps at most 3', () => {
    const raw = (v: string) => JSON.stringify({ type: 'user', message: { content: v } });
    const before = [raw(`mail ${MAIL} now`), raw(`mail ${MAIL} now`), 'a x', 'b x', 'c x', 'd x'];
    const after = [raw('mail [email] now'), raw('mail [email] now'), 'a [email] one', 'b [secret:cut] two', 'c ~ three', 'd ~ four'];
    const out = redactedExcerpts(before, after);
    expect(out[0]).toBe('mail [email] now');
    expect(out).toHaveLength(3);
    expect(out.join('')).not.toMatch(/"\}/);
  });
});
