import { describe, expect, it } from 'vitest';
import { checkFile, checkFrontmatter, frontmatter, missingRefs } from './audit.mjs';

const fm = (body) => frontmatter(`---\n${body}\n---\n# x\n`);
const ok = 'name: reasontrail\ndescription: Map this session. Use only when asked to map it. Do not use for code.';

describe('skill audit', () => {
  it('accepts a narrow description and flags missing, long or unknown fields', () => {
    expect(checkFrontmatter(fm(ok))).toEqual([]);
    expect(checkFrontmatter(undefined)).toEqual(['SKILL.md has no --- frontmatter --- block']);
    expect(checkFrontmatter(fm('name: Reason Trail'))).toEqual(expect.arrayContaining(['frontmatter needs description', 'name must be "reasontrail", the folder name']));
    expect(checkFrontmatter(fm(`${ok}\nversion: 1`))).toEqual(['unknown frontmatter field: version']);
    expect(checkFrontmatter(fm(`name: reasontrail\ndescription: ${'x'.repeat(1025)}`))).toContain('description is 1025 characters (max 1024)');
  });

  it('finds missing referenced files, network calls in the kit, home paths and secrets', () => {
    expect(missingRefs('see `references/privacy.md` and `references/nope.md`')).toEqual(['referenced file missing: references/nope.md']);
    expect(checkFile('kit/run.mjs', "const r = await fetch('https://example.com');")).toEqual(['kit/run.mjs: the kit must make no network calls']);
    expect(checkFile('kit/run.mjs', "import https from 'node:https';")).toHaveLength(1);
    expect(checkFile('references/a.md', `open ${['', 'home', 'alice', 'x'].join('/')}`)).toEqual(['references/a.md: absolute home path']);
    expect(checkFile('SKILL.md', `key ghp_${'a'.repeat(36)}`)).toEqual(['SKILL.md: looks like a secret']);
    expect(checkFile('references/privacy.md', 'home paths (`/home/<you>/…` becomes `~/…`)')).toEqual([]);
  });
});
