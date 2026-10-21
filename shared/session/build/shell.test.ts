import { describe, expect, it } from 'vitest';
import { commandHead, commandKey, isVerification, shellEffects, shellReads, verifyCommand, verifyNouns } from './shell';

const W = '/w';
const fx = (cmd: string) => shellEffects(cmd, W);

describe('shellEffects', () => {
  it.each([
    ["cat > a.ts <<'EOF'\nx > not-a-file.ts\nEOF", ['/w/a.ts']],
    ['echo hi >> log/b.txt 2>&1', ['/w/log/b.txt']],
    ['echo hi 2>/dev/null &>c.txt', ['/w/c.txt']],
    ['printf x | tee -a d.md e.md > /dev/null', ['/w/d.md', '/w/e.md']],
    ["sed -i 's/a/b/' f.ts g.ts", ['/w/f.ts', '/w/g.ts']],
    ["sed -i.bak -e 's/a/b/' h.ts", ['/w/h.ts']],
    ["cd /x && sed -n '1,5p' i.ts", []],
    ['cd sub && touch ../j.ts', ['/w/j.ts']],
    ["python3 - <<'EOF'\nopen('k.json', 'w').write('{}')\nopen('read.json').read()\nEOF", ['/w/k.json']],
    ["node -e \"require('fs').writeFileSync('l.txt', 'x')\"", ['/w/l.txt']],
    ['cp m.ts n.ts', ['/w/n.ts']],
    ['cat *.ts > "$OUT"', []],
  ])('%s writes %j', (cmd, writes) => {
    expect(fx(cmd).writes).toEqual(writes);
  });

  it('finds deletes, moves and reverts', () => {
    expect(fx('git mv a.ts b.ts')).toMatchObject({ writes: ['/w/b.ts'], deletes: ['/w/a.ts'] });
    expect(fx('rm -f c.ts && git rm -q d.ts').deletes).toEqual(['/w/c.ts', '/w/d.ts']);
    expect(fx('git checkout -- e.ts f.ts').reverts).toEqual(['/w/e.ts', '/w/f.ts']);
    expect(fx('git checkout HEAD~1 src/g.ts').reverts).toEqual(['/w/src/g.ts']);
    expect(fx('git restore h.ts').reverts).toEqual(['/w/h.ts']);
    expect(fx('git restore --staged i.ts').reverts).toEqual([]);
    expect(fx('git checkout main').reverts).toEqual([]);
    expect(fx('git checkout -b feature/x').reverts).toEqual([]);
    expect(fx('git reset --hard').revertAll).toBe(true);
    expect(fx('git reset HEAD j.ts').revertAll).toBe(false);
    expect(fx('git checkout .').revertAll).toBe(true);
  });
});

describe('commands', () => {
  it('normalizes keys, recognises verification runs and titles', () => {
    expect(commandKey('cd /w && pnpm test 2>&1 | tail -20')).toBe('pnpm test');
    expect(commandKey('pnpm test -- --run')).not.toBe(commandKey('pnpm test'));
    for (const c of ['pnpm test', 'npx vitest run', 'pnpm run typecheck', 'pnpm check:browser --flows all', 'python3 -m pytest -q', 'cargo clippy', 'tsc --noEmit', 'cd x && pnpm lint']) expect(isVerification(c)).toBe(true);
    for (const c of ['cat src/slug.test.ts', 'git commit -m "test build"', 'ls test', 'node scripts/x.mjs', 'echo ok | pnpm test']) expect(isVerification(c)).toBe(false);
    expect(commandHead('cd /w && pnpm run build --x')).toBe('pnpm run build');
    expect(commandHead('python3 -c "\nprint(1)"')).toBe('python3');
  });
});

describe('verification and read summaries (DESIGN §8.9, phase 16 titles)', () => {
  it.each([
    ['cd /w && pnpm -s lint && echo LINT-OK && git diff --numstat', 'pnpm lint', ['lint']],
    ['pnpm -s lint && pnpm -s typecheck; pnpm lint', 'pnpm lint && pnpm typecheck', ['lint', 'typecheck']],
    ['cat && pnpm exec vitest run shared/x.test.ts && rm -f x', 'pnpm exec vitest', ['tests']],
    ['npx tsc --noEmit -p a.json', 'npx tsc', ['typecheck']],
    ['tsc --noEmit', 'tsc', ['typecheck']],
    ['pnpm check:browser --flows all 2>&1 | tail -5', 'pnpm check:browser', ['browser check']],
    ['python3 -m pytest -q', 'python3 -m pytest', ['tests']],
    ['pnpm run build', 'pnpm run build', ['build']],
    ['git status', '', []],
  ])('%s → %s (%j)', (cmd, short, nouns) => {
    expect(verifyCommand(cmd)).toBe(short);
    expect(verifyNouns(cmd)).toEqual(nouns);
  });

  it('finds the files a read-only command looks at and the patterns it searches', () => {
    expect(shellReads("sed -n '194,202p' src/a.ts", W)).toEqual({ files: ['/w/src/a.ts'], patterns: [] });
    expect(shellReads('cd sub && head -n 20 b.md | grep x; cat c.json', W)).toEqual({ files: ['/w/sub/b.md', '/w/sub/c.json'], patterns: [] });
    expect(shellReads('grep -rn -A 2 "flows|FLOWS" scripts/', W)).toEqual({ files: ['/w/scripts'], patterns: ['flows|FLOWS'] });
    expect(shellReads("python3 - <<'EOF'\nprint(open('x.json').read())\nEOF", W)).toEqual({ files: [], patterns: [] });
  });
});
