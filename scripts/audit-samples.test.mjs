import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { audit } from './audit-samples.mjs';

describe('audit:samples (R3)', () => {
  const root = mkdtempSync(join(tmpdir(), 'tg-audit-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'fixtures'), { recursive: true });
  mkdirSync(join(root, 'skills/s/evals'), { recursive: true });
  writeFileSync(join(root, 'fixtures/clean.jsonl'), '{"sessionId":"sess-1","text":"run pnpm test"}\n');

  it('passes clean files and flags planted secrets, eval files and denylisted terms by file, line and rule', async () => {
    expect(await audit(root)).toEqual([]);
    writeFileSync(join(root, 'fixtures/planted.jsonl'), `ok\n{"t":"${['gh', 'p_'].join('')}${'aZ09'.repeat(9)}"}\n`);
    writeFileSync(join(root, 'skills/s/evals/e.md'), `x ${['me', 'example.org'].join('@')}\n`);
    writeFileSync(join(root, '.redact-denylist'), '# names\nPrivate Name\n');
    writeFileSync(join(root, 'fixtures/named.md'), 'a private name here\n');
    expect(await audit(root)).toEqual([
      { file: 'fixtures/named.md', line: 1, rule: 'denylist term #1' },
      { file: 'fixtures/planted.jsonl', line: 2, rule: 'secret:github-token' },
      { file: 'skills/s/evals/e.md', line: 1, rule: 'email' },
    ]);
  });

  it('scans decoded JSON string values, including nested JSON, and ignores escaped newlines after NAME=', async () => {
    const r = mkdtempSync(join(tmpdir(), 'tg-audit-'));
    try {
      mkdirSync(join(r, 'fixtures'));
      const pair = { [['pass', 'word'].join('')]: ['open', 'sesame77'].join('') };
      const nested = JSON.stringify({ type: 'user', message: { content: JSON.stringify(pair) } });
      const newline = JSON.stringify({ type: 'tool', text: `${['GITHUB', 'TOKEN'].join('_')}=\nnext line` });
      writeFileSync(join(r, 'fixtures/a.jsonl'), `${newline}\n${nested}\n`);
      expect(await audit(r)).toEqual([{ file: 'fixtures/a.jsonl', line: 2, rule: 'secret:value' }]);
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  });

  it('scans recorded lens gardens by decoded string, so the "token" key is not a secret name', async () => {
    const r = mkdtempSync(join(tmpdir(), 'tg-audit-'));
    try {
      mkdirSync(join(r, 'src/lens/samples'), { recursive: true });
      const planted = `${['gh', 'p_'].join('')}${'aZ09'.repeat(9)}`;
      writeFileSync(join(r, 'src/lens/samples/g.json'), `{\n  "nodes": {\n    "": [\n      { "token": " the", "logprob": -1.5 },\n      { "token": " ${planted}", "logprob": -2 }\n    ]\n  }\n}\n`);
      expect(await audit(r)).toEqual([{ file: 'src/lens/samples/g.json', line: 5, rule: 'secret:github-token' }]);
    } finally {
      rmSync(r, { recursive: true, force: true });
    }
  });
});
