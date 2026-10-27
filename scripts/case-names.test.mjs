import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// macOS and Windows file systems ignore case, so two tracked paths that differ only in case check out as one file
// and the build imports the wrong module (src/site/StepDetail.tsx vs stepDetail.ts did, 2026-10-27).
describe('tracked file names', () => {
  it('has no two paths that differ only in case', () => {
    const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const seen = new Map();
    const clashes = [];
    for (const f of files) {
      const key = f.toLowerCase();
      if (seen.has(key)) clashes.push(`${seen.get(key)} / ${f}`);
      else seen.set(key, f);
    }
    expect(clashes).toEqual([]);
  });
});
