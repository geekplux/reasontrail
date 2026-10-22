import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMANDS, NPX } from '../shared/commands';
import { checkCommands, checkRefs, extractRefs, readCommands } from './check-docs.mjs';

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
