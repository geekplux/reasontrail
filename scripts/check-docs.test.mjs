import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMANDS, NPX } from '../shared/commands';
import { checkCommands, checkDemoLinks, checkRefs, extractRefs, readCommands, readSamples } from './check-docs.mjs';

const source = readFileSync(new URL('../shared/commands.ts', import.meta.url), 'utf8');

describe('readCommands', () => {
  it('reads exactly the commands the TypeScript module exports', () => {
    expect(readCommands(source)).toEqual({ npx: NPX, commands: Object.values(COMMANDS) });
  });
});

describe('extractRefs and checkRefs', () => {
  const md = [
    '<img src="docs/a.webp" alt="A map">',
    '<picture><source srcset="docs/dark.png"><img alt="" src="docs/light.png"></picture>',
    '[ok](CONTRIBUTING.md#setup) [web](https://example.com) [top](#quick-start)',
    '![](docs/no-alt.png)',
    '`[code](not/a/link.md)`',
    '```md\n[fenced](missing.md)\n```',
  ].join('\n');

  it('finds Markdown and HTML links and images, but not code', () => {
    expect(extractRefs(md).map((r) => r.target)).toEqual(['CONTRIBUTING.md#setup', 'https://example.com', '#quick-start', 'docs/no-alt.png', 'docs/a.webp', 'docs/dark.png', 'docs/light.png']);
  });

  it('reports missing files and missing alt text, resolving from the file’s folder', () => {
    const has = (p) => ['CONTRIBUTING.md', 'docs/a.webp', 'docs/dark.png', 'docs/light.png', 'docs/no-alt.png'].includes(p);
    expect(checkRefs('README.md', md, has)).toEqual(['README.md:4: image without alt text: docs/no-alt.png', 'README.md:2: image without alt text: docs/light.png']);
    expect(checkRefs('docs/X.md', '[up](../CONTRIBUTING.md) [gone](gone.md)', has)).toEqual(['docs/X.md:1: link does not resolve to a committed file: gone.md']);
  });

  it('checks both halves of a linked image', () => {
    const has = (p) => p === 'docs/a.webp';
    expect(extractRefs('x\n[![A map](docs/a.webp)](https://reasontrail.geekplux.com/) [![](b.png)](c.md)').map((r) => [r.kind, r.target, r.alt, r.line])).toEqual([
      ['image', 'docs/a.webp', 'A map', 2],
      ['link', 'https://reasontrail.geekplux.com/', undefined, 2],
      ['image', 'b.png', '', 2],
      ['link', 'c.md', undefined, 2],
    ]);
    expect(checkRefs('README.md', '[![](b.png)](c.md)', has)).toEqual(['README.md:1: image without alt text: b.png', 'README.md:1: image does not resolve to a committed file: b.png', 'README.md:1: link does not resolve to a committed file: c.md']);
  });

  it('rejects alt text that only names the kind of image', () => {
    const has = () => true;
    expect(checkRefs('README.md', '![Screenshot](a.png)\n<img src="b.png" alt=" logo ">\n![A map of a session](c.png)', has)).toEqual([
      'README.md:1: image alt text does not describe it ("Screenshot"): a.png',
      'README.md:2: image alt text does not describe it ("logo"): b.png',
    ]);
  });
});

describe('checkCommands', () => {
  const cmds = readCommands(source);
  it('accepts the shared commands, also through the local CLI from a clone', () => {
    const md = '```sh\nnpx reasontrail install-skill   # once\nnpx reasontrail\n```\n> ```sh\n> pnpm install && node cli/dist/cli.mjs --list\n> ```';
    expect(checkCommands(md, cmds)).toEqual([]);
  });
  it('rejects a command that is not shared and requires the two first-run commands', () => {
    expect(checkCommands('Run `npx reasontrail --open-all`.', cmds)).toEqual([
      'README.md: command not in shared/commands.ts: npx reasontrail --open-all',
      'README.md: missing the command npx reasontrail install-skill',
      'README.md: missing the command npx reasontrail',
    ]);
  });
});

describe('checkDemoLinks', () => {
  const samples = new Map([['planner-pivot', new Set(['s12', 's13'])]]);
  it('accepts the bare origin and links to a sample step, in Markdown, HTML and code', () => {
    const md = '[demo](https://reasontrail.geekplux.com)\n<a href="https://reasontrail.geekplux.com/?session=planner-pivot&amp;step=s13">x</a>\n`https://reasontrail.geekplux.com/?session=planner-pivot&step=s12`';
    expect(checkDemoLinks('examples/README.md', md, samples)).toEqual([]);
  });
  it('rejects unknown samples and steps', () => {
    const md = 'https://reasontrail.geekplux.com/?session=nope\n\n(https://reasontrail.geekplux.com/?session=planner-pivot&step=s99) https://reasontrail.geekplux.com/?step=s1';
    expect(checkDemoLinks('README.md', md, samples)).toEqual([
      'README.md:1: demo link names an unknown sample "nope": https://reasontrail.geekplux.com/?session=nope',
      'README.md:3: demo link names a step "s99" that planner-pivot does not have: https://reasontrail.geekplux.com/?session=planner-pivot&step=s99',
      'README.md:3: demo link has a step but no session: https://reasontrail.geekplux.com/?step=s1',
    ]);
  });
  it('reads the bundled samples and their step ids', () => {
    const real = readSamples(new URL('../src/sessions/samples/', import.meta.url).pathname);
    expect([...real.keys()].sort()).toEqual(['implementer-checks', 'planner-pivot', 'verify-fail-fix']);
    expect(real.get('implementer-checks')?.has('s53')).toBe(true);
  });
});
