import { describe, expect, it } from 'vitest';
import { commandHead, commandKey, isVerification, shellEffects } from './shell';

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
