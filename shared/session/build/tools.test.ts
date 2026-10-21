import { describe, expect, it } from 'vitest';
import { describeTool, toolCategory } from './tools';

describe('toolCategory', () => {
  it('maps known tools and falls back to other', () => {
    expect(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'WebSearch', 'Agent', 'TodoWrite', 'mcp__x__y', 'constructor'].map(toolCategory)).toEqual([
      'read', 'search', 'search', 'edit', 'write', 'run', 'web', 'agent', 'plan', 'other', 'other',
    ]);
  });
});

describe('describeTool', () => {
  it('keeps the shell command verbatim and summarises its first line', () => {
    const t = describeTool('Bash', { command: "sed -i 's/a/b/' src/x.ts\necho done" }, 'c1');
    expect(t).toEqual({ name: 'Bash', category: 'run', summary: "Bash sed -i 's/a/b/' src/x.ts", files: [], callId: 'c1', command: "sed -i 's/a/b/' src/x.ts\necho done" });
  });

  it('tolerates missing or odd input', () => {
    expect(describeTool('Read', null)).toEqual({ name: 'Read', category: 'read', summary: 'Read', files: [] });
    expect(describeTool('WebSearch', { query: 'slug rules' }).summary).toBe('WebSearch slug rules');
  });
});
