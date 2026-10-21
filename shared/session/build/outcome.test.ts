// Outcome: scratch and build output never count as files changed (phase 15 content review).
import { describe, expect, it } from 'vitest';
import type { Step } from '../types';
import { buildOutcome, type FileEvent, isScratchOutput } from './outcome';

const step = { id: 's0', seq: 0, laneId: 'main', kind: 'tool-call', tool: { category: 'edit', files: [] } } as unknown as Step;
const write = (path: string): FileEvent => ({ path, step, type: 'write' });

describe('isScratchOutput', () => {
  it('matches scratch and build directories, relative or absolute', () => {
    const scratch = ['.tmp/plant', '.tmp/plant/a.jsonl', 'tmp/x.txt', '/tmp/x', 'node_modules/a/b.js', 'cli/dist/cli.mjs', 'dist', '.wrangler/dry-run/index.js', '/w/p/.tmp/a'];
    const kept = ['src/tmpl.ts', 'docs/distance.md', 'scripts/audit-samples.mjs', 'src/.tmpfile', 'wrangler.toml'];
    expect(scratch.filter((p) => !isScratchOutput(p))).toEqual([]);
    expect(kept.filter(isScratchOutput)).toEqual([]);
  });
});

describe('buildOutcome', () => {
  it('leaves scratch and build output out of files changed', () => {
    const history = ['/w/p/.tmp/plant/a.jsonl', '/w/p/scripts/audit-samples.mjs', '/tmp/x', '/w/p/cli/dist/cli.mjs', '/w/p/.wrangler/out.js', '/w/p/node_modules/a.js'].map(write);
    expect(buildOutcome([step], history, [], 'main', '/w/p').files).toEqual([{ path: 'scripts/audit-samples.mjs', edits: 1, created: false }]);
  });
});
