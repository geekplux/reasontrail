// Synthetic redaction corpus (PLAN R2): no real secrets. Secret-shaped strings are built at runtime from fragments, so
// nothing in this file looks like a credential to a scanner. Home paths are built the same way.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSession, parseSession } from './adapter';
import { buildGraph } from './build/graph';
import { findSecrets, redactGraph, redactSession, redactText } from './redact';

/** Deterministic pseudo-random string over an alphabet (LCG; not for security). */
function rnd(n: number, seed: number, abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  let x = seed;
  let out = '';
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out += abc[(x >>> 16) % abc.length];
  }
  return out;
}
const j = (...parts: string[]) => parts.join('');
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const HEX = '0123456789abcdef';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HOME = j('/ho', 'me/');
const USERS = j('/Us', 'ers/');
const pem = (kind: string) => j('-----BEGIN ', kind, ' PRIVATE KEY-----\n', rnd(64, 7, B64), '\n', rnd(64, 8, B64), '\n-----END ', kind, ' PRIVATE KEY-----');

/** [name, input, expected output]. */
const CASES: [string, string, string][] = [
  ['anthropic key', `key ${j('sk-', 'ant-', 'api03-')}${rnd(40, 1)} end`, 'key [secret:anthropic-key] end'],
  ['openai project key', j('sk-', 'proj-', rnd(40, 2)), '[secret:openai-key]'],
  ['openai legacy key', j('sk-', rnd(48, 3)), '[secret:openai-key]'],
  ['github ghp', `use ${j('gh', 'p_', rnd(36, 4))}`, 'use [secret:github-token]'],
  ['github gho', j('gh', 'o_', rnd(36, 5)), '[secret:github-token]'],
  ['github ghs', j('gh', 's_', rnd(36, 6)), '[secret:github-token]'],
  ['github fine-grained', j('github', '_pat_', rnd(22, 7), '_', rnd(59, 8)), '[secret:github-token]'],
  ['slack bot', j('xo', 'xb-', '1234567890-', rnd(24, 9)), '[secret:slack-token]'],
  ['slack user', j('xo', 'xp-', rnd(30, 10)), '[secret:slack-token]'],
  ['aws access key', `id ${j('AK', 'IA', rnd(16, 11, UP))}.`, 'id [secret:aws-key].'],
  ['google api key', j('AI', 'za', rnd(35, 12)), '[secret:google-key]'],
  ['jwt', j('ey', 'J', rnd(20, 13), '.', 'ey', 'J', rnd(30, 14), '.', rnd(32, 15)), '[secret:jwt]'],
  ['pem rsa', `a\n${pem('RSA')}\nb`, 'a\n[secret:private-key]\nb'],
  ['pem openssh', pem('OPENSSH'), '[secret:private-key]'],
  ['bearer header', `Authorization: Bearer ${rnd(24, 16)}`, 'Authorization: Bearer [secret:auth]'],
  ['basic header', `authorization: Basic ${rnd(20, 17, B64)}==`, 'authorization: Basic [secret:auth]'],
  ['curl token header', `curl -H "Authorization: token ${rnd(20, 18)}" x`, 'curl -H "Authorization: token [secret:auth]" x'],
  ['env key', j('OPENAI_API', '_KEY=', 'abc123def'), 'OPENAI_API_KEY=[secret:value]'],
  ['export token', `export ${j('GITHUB', '_TOKEN')}=${rnd(12, 19)}`, 'export GITHUB_TOKEN=[secret:value]'],
  ['quoted password', j('DB_PASS', 'WORD=', "'hunter22'"), 'DB_PASSWORD=[secret:value]'],
  ['cli flag', j('--api', '-key=', 'abcd1234'), '--api-key=[secret:value]'],
  ['json apiKey', j('{"api', 'Key": "', 'abc-123-def', '"}'), '{"apiKey": "[secret:value]"}'],
  ['json client secret', j('"client', '_secret":"', rnd(10, 20), '"'), '"client_secret":"[secret:value]"'],
  ['json password', j('"pass', 'word": "', 'opensesame', '"'), '"password": "[secret:value]"'],
  ['cookie session', j('Cookie: sess', 'ion=', 'abc123xyz'), 'Cookie: session=[secret:value]'],
  ['url query token', j('https://example.org/cb?access', '_token=', 'abc123', '&page=2'), 'https://example.org/cb?access_token=[secret:value]&page=2'],
  ['url credentials', j('https://', 'deploy:', 'pa55word', '@git.example.org/x'), 'https://[secret:url-credentials]@git.example.org/x'],
  ['email', j('mail jane.doe', '@', 'example.com now'), 'mail [email] now'],
  ['co-author email', j('Co-Authored-By: Bot <noreply', '@', 'example.org>'), 'Co-Authored-By: Bot <[email]>'],
  ['linux home', j('cat ', HOME, 'alice/proj/a.ts'), 'cat ~/proj/a.ts'],
  ['mac home', j(USERS, 'bob/Desktop/x.md'), '~/Desktop/x.md'],
  ['windows home', j('C:\\', 'Users\\', 'carol\\proj'), '~\\proj'],
  ['claude project dir', j(HOME, 'dave/.claude/projects/-ho', 'me-dave-notes/s.jsonl'), '~/.claude/projects/-~-notes/s.jsonl'],
  ['high entropy', `value ${rnd(40, 21)} here`, 'value [secret:high-entropy] here'],
  ['high entropy base64', rnd(44, 22, B64.slice(0, 63)), '[secret:high-entropy]'],
  // False-positive guards (R2): left exactly as they are.
  ['short git sha', 'commit a1b2c3d fixed it', 'commit a1b2c3d fixed it'],
  ['full git sha', `HEAD is ${rnd(40, 23, HEX)}`, `HEAD is ${rnd(40, 23, HEX)}`],
  ['uuid', '3f2b8c1e-9d4a-4e6f-8b7c-2a1d0e9f8c7b', '3f2b8c1e-9d4a-4e6f-8b7c-2a1d0e9f8c7b'],
  ['upper uuid', '3F2B8C1E-9D4A-4E6F-8B7C-2A1D0E9F8C7B', '3F2B8C1E-9D4A-4E6F-8B7C-2A1D0E9F8C7B'],
  ['lockfile integrity', `integrity: sha512-${rnd(86, 24, B64)}==`, `integrity: sha512-${rnd(86, 24, B64)}==`],
  ['sha256 hex', rnd(64, 25, HEX), rnd(64, 25, HEX)],
  ['long words', 'antidisestablishmentarianism internationalization', 'antidisestablishmentarianism internationalization'],
  ['kebab branch', 'phase-12-structure-redact-and-more-words-here', 'phase-12-structure-redact-and-more-words-here'],
  ['camel identifier', 'someVeryLongCamelCaseIdentifierNameForTests', 'someVeryLongCamelCaseIdentifierNameForTests'],
  ['session id pair', '"sessionId":"sess-basic"', '"sessionId":"sess-basic"'],
  ['author pair', '"author": "Jane"', '"author": "Jane"'],
  ['numeric token setting', 'max_tokens=100 --max-tokens=2048', 'max_tokens=100 --max-tokens=2048'],
  ['git remote', 'git@github.com:owner/repo.git', 'git@github.com:owner/repo.git'],
  ['code assignment', 'const tokenCount = 5; const key = getKey();', 'const tokenCount = 5; const key = getKey();'],
  ['env reference', 'API_KEY=$API_KEY pnpm dev', 'API_KEY=$API_KEY pnpm dev'],
  ['npm scope', '@vitejs/plugin-react@6.0.1', '@vitejs/plugin-react@6.0.1'],
  ['words with sk-', 'the risk-assessment-for-the-new-module is done', 'the risk-assessment-for-the-new-module is done'],
  ['tmp path', 'mkdir -p /tmp/x && ls /home', 'mkdir -p /tmp/x && ls /home'],
];

describe('redactText corpus (R1, R2)', () => {
  it('has at least 40 cases', () => expect(CASES.length).toBeGreaterThanOrEqual(40));
  it.each(CASES)('%s', (_, input, expected) => {
    expect(redactText(input)).toBe(expected);
    expect(redactText(expected)).toBe(expected);
    expect(findSecrets(expected)).toEqual([]);
  });
});

describe('redactGraph (R1, R4)', () => {
  const DIR = 'fixtures/sessions/claude-code';
  const g = parseSession({ files: [{ path: j(HOME, 'erin/fx/basic.jsonl'), text: readFileSync(`${DIR}/basic.jsonl`, 'utf8') }] });
  if (!g) throw new Error('fixture');
  const planted = structuredClone(g);
  const user = planted.steps[0];
  const sys = planted.steps.find((s) => s.kind === 'system' && s.status);
  if (!user || !sys) throw new Error('fixture shape');
  user.text = `token ${j('gh', 'p_', rnd(36, 30))} for ${j('erin', '@', 'example.com')}`;
  planted.steps.push({ ...sys, id: 's99', seq: 99, kind: 'system', text: '<system-reminder>local note</system-reminder>' }, { ...sys, id: 's100', seq: 100, kind: 'tool-result', text: Array.from({ length: 6 }, (_, i) => `VAR_${i}=v${i}`).join('\n') });
  delete planted.steps.at(-2)?.status;
  delete planted.steps.at(-1)?.status;
  const before = JSON.stringify(planted);
  const { graph, summary } = redactGraph(planted);

  it('replaces secrets, emails and home paths everywhere, keeps ids, and leaves the input untouched', () => {
    expect(graph.steps[0]?.text).toBe('token [secret:github-token] for [email]');
    expect(graph.source.file).toBe('~/fx/basic.jsonl');
    expect(graph.steps.every((s) => s.raw.file === '~/fx/basic.jsonl')).toBe(true);
    expect(graph.steps.map((s) => s.id)).toEqual(planted.steps.map((s) => s.id));
    expect(summary.replaced).toMatchObject({ 'secret:github-token': 1, email: 1 });
    expect(summary.replaced['home-path']).toBeGreaterThan(30);
    expect(JSON.stringify(planted)).toBe(before);
    expect(findSecrets(JSON.stringify(graph))).toEqual([]);
  });

  it('drops non-conversation content but keeps interrupt and error events', () => {
    expect(graph.steps.at(-2)?.text).toBe('[dropped: system record]');
    expect(graph.steps.at(-1)?.text).toBe('[dropped: environment dump]');
    expect(graph.steps.find((s) => s.status === 'interrupted' && s.kind === 'system')?.text).toBe('[Request interrupted by user]');
    expect(summary.dropped).toBe(2);
  });

  it('is deterministic', () => expect(JSON.stringify(redactGraph(planted))).toBe(JSON.stringify(redactGraph(planted))));
});

describe('redactSession (before the graph clips text)', () => {
  it('never leaves a cut-off secret in a clipped title', () => {
    const token = ['gh', 'p_', 'Q1w2E3r4T5y6U7i8O9p0A1s2D3f4G5h6J7k8'].join('');
    const text = `Please look at this long request about the build. It uses ${token} today`;
    const line = JSON.stringify({ type: 'user', sessionId: 's', uuid: 'u', parentUuid: null, message: { role: 'user', content: text } });
    const session = normalizeSession({ files: [{ path: 's.jsonl', text: `${line}\n` }] });
    if (!session) throw new Error('fixture not recognised');
    const counts: Record<string, number> = {};
    const json = JSON.stringify(redactGraph(buildGraph(redactSession(session, counts))).graph);
    expect(json).not.toContain(token.slice(0, 8));
    expect(counts).toEqual({ 'secret:github-token': 1 });
    expect(JSON.stringify(redactGraph(buildGraph(session)).graph)).toContain(token.slice(0, 8)); // why this exists
  });
});
