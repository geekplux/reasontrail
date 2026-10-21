// `--ai` (PLAN X5, phase 21) against a fake /api/structure on 127.0.0.1, started and closed inside each test.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { loadGraph } from '../../src/map/loadGraph';
import { parseArgs } from '../src/args';
import { run } from '../src/main';
import { EXIT } from '../src/meta';
import { sandbox } from './sandbox';

// Built at runtime so no secret-shaped string is committed (pnpm audit:samples scans the repo).
const TOKEN = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');

type Handler = (body: { steps: { id: string; kind: string; text: string }[] }, res: ServerResponse) => void;

/** A fake endpoint; by default labels the first step and links the last step to it. */
async function fakeServer(handler?: Handler) {
  const bodies: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      bodies.push(data);
      const body = JSON.parse(data);
      if (handler) return handler(body, res);
      const ids = body.steps.map((s: { id: string }) => s.id);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: '@cf/fake/model', cached: false, labels: [{ stepId: ids[0], label: 'decision', confidence: 0.8 }, { stepId: 'ghost', label: 'answer', confidence: 1 }], links: [{ claimStepId: ids.at(-1), supportStepIds: [ids[0], 'ghost'] }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  onTestFinished(() => new Promise<void>((r) => server.close(() => r())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/structure`;
  return { url, bodies, server };
}

function setup(text?: string) {
  const sb = sandbox();
  if (text === undefined) sb.add('basic', 'sess-ai', 1_000);
  else {
    const rec = (o: object) => JSON.stringify({ sessionId: 'sess-ai', cwd: '/work/notes-app', ...o });
    writeFileSync(
      join(sb.store, 'sess-ai.jsonl'),
      [
        rec({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: text } }),
        rec({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-10-01T10:00:05.000Z', message: { role: 'assistant', model: 'm', content: [{ type: 'text', text: 'Done.' }] } }),
      ].join('\n') + '\n',
    );
  }
  const out = join(sb.root, 'map.html');
  const payload = () => {
    const html = readFileSync(out, 'utf8');
    const loaded = loadGraph(/<script id="reasontrail-data" type="application\/json">(.*)<\/script>/s.exec(html)?.[1]);
    if (!loaded.ok) throw new Error(loaded.reason);
    return { html, ...loaded.payload };
  };
  return { sb, out, payload };
}

describe('--ai arguments', () => {
  it('parses --ai, --api and --yes, and rejects them where they do not apply', () => {
    expect(parseArgs(['--ai', '--api', 'http://127.0.0.1:9/api/structure', '-y'])).toMatchObject({ ai: true, yes: true, api: 'http://127.0.0.1:9/api/structure' });
    expect(parseArgs(['--ai', '--api', 'ftp://x'])).toEqual({ error: expect.stringMatching(/http\(s\) URL/) });
    expect(parseArgs(['--api', 'https://x.test/api/structure'])).toEqual({ error: '--api only applies to --ai' });
    expect(parseArgs(['--yes'])).toEqual({ error: '--yes only applies to --ai' });
    expect(parseArgs(['--ai', '--json'])).toEqual({ error: expect.stringMatching(/cannot be combined with --json/) });
  });
});

describe('--ai', () => {
  it('prints what it sends, sends redacted batches only, and embeds the overlay apart from the graph', async () => {
    const { url, bodies } = await fakeServer();
    const { sb, out, payload } = setup(`Use ${TOKEN} to fix the build`);
    expect(await run(['--ai', '--api', url, '--yes', '--no-open', '--out', out], sb.ctx())).toBe(EXIT.ok);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain(TOKEN.slice(4));
    expect(bodies[0]).toContain('[secret:github-token]');
    const err = sb.lines.err.join('\n');
    expect(err).toMatch(new RegExp(`will send 2 step summaries in 1 request \\(\\d+ characters\\) to ${url}`));
    expect(err).toMatch(/Only redacted text is sent/);
    expect(err).toMatch(/SHA-256/);
    expect(err).toMatch(/1 labels and 1 claim links, suggested by @cf\/fake\/model/);
    expect(err).toMatch(/only the redacted step summaries above were sent/);
    const p = payload();
    expect(p.labels).toMatchObject({ model: '@cf/fake/model', labels: [{ label: 'decision', confidence: 0.8 }] });
    const ids = new Set(p.graph.steps.map((s) => s.id));
    expect(p.labels?.labels.every((l) => ids.has(l.stepId))).toBe(true);
    expect(p.labels?.links).toEqual([{ claimStepId: expect.any(String), supportStepIds: [p.labels?.labels[0]?.stepId] }]);
    expect(p.graph.steps[0]?.text).toContain(TOKEN); // the private map itself is not redacted
  });

  it('without a terminal and without --yes, refuses (exit 1) and sends nothing', async () => {
    const { url, bodies } = await fakeServer();
    const { sb, out } = setup();
    expect(await run(['--ai', '--api', url, '--no-open', '--out', out], sb.ctx())).toBe(EXIT.usage);
    expect(bodies).toHaveLength(0);
    expect(existsSync(out)).toBe(false);
    expect(sb.lines.err.at(-1)).toMatch(/run it in a terminal or add --yes/);
  });

  it('on a terminal, asks first; "no" sends nothing and writes the map without labels', async () => {
    const { url, bodies } = await fakeServer();
    const { sb, out, payload } = setup();
    const asked: string[] = [];
    const ctx = { ...sb.ctx(), isTTY: true, confirm: async (q: string) => (asked.push(q), false) };
    expect(await run(['--ai', '--api', url, '--no-open', '--out', out], ctx)).toBe(EXIT.ok);
    expect(asked).toEqual(['Send them? [y/N] ']);
    expect(bodies).toHaveLength(0);
    expect(payload().labels).toBeUndefined();
    expect(sb.lines.err.join('\n')).toMatch(/Nothing was sent[\s\S]*nothing was uploaded/);
    const yes = { ...ctx, confirm: async () => true };
    expect(await run(['--ai', '--api', url, '--no-open', '--out', out], yes)).toBe(EXIT.ok);
    expect(bodies).toHaveLength(1);
    expect(payload().labels).toBeDefined();
  });

  it.each([
    ['a 404 page', (res: ServerResponse) => (res.writeHead(404, { 'content-type': 'text/html' }), res.end('<p>no</p>')), /could not be reached or has no AI labels/],
    ['a rate limit', (res: ServerResponse) => (res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '9' }), res.end('{"error":{"code":"rate_limited","message":"x"}}')), /Try again in 9 s/],
    ['an upstream error', (res: ServerResponse) => (res.writeHead(502, { 'content-type': 'application/json' }), res.end('{"error":{"code":"upstream_error","message":"x"}}')), /couldn't label this session/],
  ])('on %s, writes the map without labels, prints a calm message and exits 0', async (_, reply, message) => {
    const { url } = await fakeServer((_b, res) => reply(res));
    const { sb, out, payload } = setup();
    expect(await run(['--ai', '--api', url, '--yes', '--no-open', '--out', out], sb.ctx())).toBe(EXIT.ok);
    expect(sb.lines.err.join('\n')).toMatch(message);
    expect(payload().labels).toBeUndefined();
  });

  it('when the endpoint is unreachable, writes the map without labels', async () => {
    const { url, server } = await fakeServer();
    await new Promise<void>((r) => server.close(() => r()));
    const { sb, out, payload } = setup();
    expect(await run(['--ai', '--api', url, '--yes', '--no-open', '--out', out], sb.ctx())).toBe(EXIT.ok);
    expect(sb.lines.err.join('\n')).toMatch(/No AI labels: .* could not be reached/);
    expect(payload().labels).toBeUndefined();
  });
});
