import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeHtml, jsonForScript, renderHtml } from '../src/html';
import { run } from '../src/main';
import { EXIT, VERSION } from '../src/meta';
import { openerFor } from '../src/open';
import { sandbox } from './sandbox';

const XSS = '</script><script>alert(1)</script>';
// Built at runtime so no secret-shaped string is committed (pnpm audit:samples scans the repo).
const TOKEN = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
const HOME_DIR = ['', 'home', 'ana'].join('/');

function session(text: string): string {
  const rec = (o: object) => JSON.stringify({ sessionId: 'sess-xss', cwd: '/work/notes-app', ...o });
  return [
    rec({ type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: text } }),
    rec({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-10-01T10:00:05.000Z', message: { role: 'assistant', model: 'm', content: [{ type: 'text', text: 'Done.' }] } }),
  ].join('\n') + '\n';
}

describe('html', () => {
  it('embeds JSON that cannot close the script element', () => {
    const json = jsonForScript({ t: `${XSS}&\u2028` });
    expect(json).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(json)).toEqual({ t: `${XSS}&\u2028` });
    expect(escapeHtml(`<a href="x">'&`)).toBe('&#60;a href=&#34;x&#34;&#62;&#39;&#38;');
  });

  it('fills both slots, keeps $ patterns literal, and refuses a template without slots', () => {
    const graph = { title: 'Cost $& and $1 <b>' } as never;
    const html = renderHtml('<title>__REASONTRAIL_TITLE__</title><script>__REASONTRAIL_DATA__</script>', { graph, meta: { version: '1' } });
    expect(html).toContain('<title>Cost $&#38; and $1 &#60;b&#62; · Reasontrail</title>');
    expect(() => renderHtml('<p></p>', { graph, meta: { version: '1' } })).toThrow(/slot/);
  });
});

describe('run', () => {
  it('prints help and the version', () => {
    const sb = sandbox();
    expect(run(['--version'], sb.ctx())).toBe(EXIT.ok);
    expect(sb.lines.out).toEqual([VERSION]);
    expect(run(['--help'], sb.ctx())).toBe(EXIT.ok);
    expect(sb.lines.out[1]).toMatch(/Exit codes: 0 ok, 1 bad arguments, 2 no session found, 3 unreadable or unsupported file/);
  });

  it('exits 1 on bad arguments, 2 with no session, 3 on an unsupported file', () => {
    const sb = sandbox();
    expect(run(['--nope'], sb.ctx())).toBe(EXIT.usage);
    expect(run(['--latest'], sb.ctx())).toBe(EXIT.notFound);
    expect(run(['--list'], sb.ctx())).toBe(EXIT.notFound);
    const bad = join(sb.root, 'notes.jsonl');
    writeFileSync(bad, '{"hello":"world"}\n');
    expect(run([bad, '--no-open'], sb.ctx())).toBe(EXIT.unreadable);
    expect(sb.lines.err.at(-1)).toMatch(/this doesn't look like a Claude Code session \(\.jsonl\)\. Codex and Grok Build sessions are not supported yet\./);
  });

  it('writes the HTML, always prints the session used, and never opens with --no-open', () => {
    const sb = sandbox();
    sb.add('subagent', 'sess-1', 1_000);
    let opened = 0;
    const ctx = { ...sb.ctx(), open: () => ++opened > 0 };
    const out = join(sb.root, 'map.html');
    expect(run(['--no-open', '--out', out], ctx)).toBe(EXIT.ok);
    expect(opened).toBe(0);
    expect(sb.lines.out).toEqual([out]);
    expect(sb.lines.err[0]).toBe(`Session: ${join(sb.store, 'sess-1.jsonl')} (newest for this folder)`);
    expect(readFileSync(out, 'utf8')).toContain('"schemaVersion":1');
    expect(run(['--out', out], ctx)).toBe(EXIT.ok);
    expect(opened).toBe(1);
  });

  it('renders a transcript holding </script> as data, not markup (AC3)', () => {
    const sb = sandbox();
    const file = join(sb.store, 'sess-xss.jsonl');
    writeFileSync(file, session(`Show ${XSS} as text`));
    const out = join(sb.root, 'x.html');
    expect(run([file, '--no-open', '--out', out], sb.ctx())).toBe(EXIT.ok);
    const html = readFileSync(out, 'utf8');
    expect(html.match(/<script/g)).toHaveLength(1);
    const data = /<script id="reasontrail-data" type="application\/json">(.*)<\/script>/s.exec(html)?.[1] ?? '';
    expect(JSON.parse(data).graph.steps[0].text).toBe(`Show ${XSS} as text`);
  });

  it('--share redacts secrets, emails and home paths and writes into the current folder', () => {
    const sb = sandbox();
    writeFileSync(join(sb.store, 'sess-xss.jsonl'), session(`Token ${TOKEN} from ana@example.org in ${HOME_DIR}/notes`));
    expect(run(['--share', '--no-open'], sb.ctx())).toBe(EXIT.ok);
    expect(sb.lines.out).toEqual([join(sb.cwd, 'reasontrail-sess-xss.html')]);
    expect(sb.lines.err).toContain('Redacted: 1 secrets, 1 emails, 1 paths; 0 non-conversation records dropped.');
    const html = readFileSync(sb.lines.out[0] as string, 'utf8');
    for (const leak of [TOKEN.slice(0, 8), 'ana@example.org', HOME_DIR]) expect(html).not.toContain(leak);
    expect(html).toContain('[secret:github-token]');
    expect(html).toContain('"shared":{"replaced":3}');
  });

  it('--json prints the graph to stdout and writes no file', () => {
    const sb = sandbox();
    sb.add('basic', 'sess-j', 1_000);
    expect(run(['--json'], sb.ctx())).toBe(EXIT.ok);
    expect(JSON.parse(sb.lines.out[0] as string)).toMatchObject({ schemaVersion: 1, source: { kind: 'claude-code' } });
  });

  it('--trim keeps only the given step range', () => {
    const sb = sandbox();
    sb.add('basic', 'sess-t', 1_000);
    expect(run(['--json'], sb.ctx())).toBe(EXIT.ok);
    expect(run(['--json', '--trim', '1:2'], sb.ctx())).toBe(EXIT.ok);
    const [full, cut] = sb.lines.out.map((l) => JSON.parse(l as string) as { steps: { text?: string }[] });
    expect(full?.steps.length).toBeGreaterThan(3);
    expect(cut?.steps.map((s) => s.text)).toEqual(full?.steps.slice(1, 3).map((s) => s.text));
  });
});

describe('openerFor', () => {
  it('uses the platform opener, and none on Linux without a display', () => {
    expect(openerFor('darwin', {}, '/f.html')).toEqual(['open', ['/f.html']]);
    expect(openerFor('linux', {}, '/f.html')).toBeUndefined();
    expect(openerFor('linux', { WAYLAND_DISPLAY: 'w' }, '/f.html')).toEqual(['xdg-open', ['/f.html']]);
  });
});
