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
});
