import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSession } from '../adapter';
import { checkAdapterContract } from '../adapterContract';
import type { SessionGraph, SessionInput, Step } from '../types';
import { claudeCodeAdapter } from './claudeCode';

const DIR = 'fixtures/sessions/claude-code';
const NAMES = readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).sort();

function load(name: string): SessionInput {
  const files = [{ path: `${DIR}/${name}`, text: readFileSync(`${DIR}/${name}`, 'utf8') }];
  const sub = `${DIR}/${name.replace(/\.jsonl$/, '')}/subagents`;
  if (existsSync(sub)) for (const f of readdirSync(sub).sort()) files.push({ path: `${sub}/${f}`, text: readFileSync(`${sub}/${f}`, 'utf8') });
  return { files };
}

function graph(name: string): SessionGraph {
  const g = parseSession(load(name));
  if (!g) throw new Error(`${name} not recognised`);
  return g;
}

const tool = (g: SessionGraph, name: string, kind: Step['kind'] = 'tool-call') => g.steps.filter((s) => s.kind === kind && s.tool?.name === name);

describe('Claude Code adapter contract', () => {
  it.each(NAMES)('%s passes the contract', (name) => {
    expect(checkAdapterContract(claudeCodeAdapter, load(name))).toEqual([]);
  });

  it('emits byte-identical JSON on two runs (M7)', () => {
    for (const name of NAMES) expect(JSON.stringify(graph(name))).toBe(JSON.stringify(graph(name)));
  });

  it('never throws on garbage and is not sniffed as Claude Code', () => {
    expect(parseSession({ files: [{ path: 'x.jsonl', text: 'nope\n[1,2]\n' }] })).toBeUndefined();
    expect(() => claudeCodeAdapter.parse({ files: [{ path: 'x.jsonl', text: '{"type":"user","message":7}\n42\n' }] })).not.toThrow();
    expect(claudeCodeAdapter.parse({ files: [] }).records).toEqual([]);
  });
});

describe('basic.jsonl', () => {
  const g = graph('basic.jsonl');

  it('reads source, title and counts', () => {
    expect(g.source).toMatchObject({ kind: 'claude-code', sessionId: 'sess-basic', cwd: '/work/notes-app', gitBranch: 'fix-slug', model: 'claude-test-model' });
    expect(g.title).toBe('Fix slugify for titles with spaces');
    expect(g.stats).toMatchObject({ skippedLines: 2, partialLines: 1, unknownRecords: 1, ignoredRecords: 7 });
    expect(g.lanes).toEqual([{ id: 'main', name: 'Main', file: `${DIR}/basic.jsonl` }]);
  });

  it('keeps empty thinking as textStored: false', () => {
    const thinking = g.steps.find((s) => s.kind === 'thinking');
    expect(thinking).toMatchObject({ textStored: false });
    expect(thinking?.text).toBeUndefined();
  });

  it('classifies tools and file touches', () => {
    expect(tool(g, 'Read')[0]?.tool).toMatchObject({ category: 'read', files: ['/work/notes-app/src/slug.ts'], summary: 'Read /work/notes-app/src/slug.ts' });
    expect(tool(g, 'Edit')[0]?.tool).toMatchObject({ category: 'edit', files: ['/work/notes-app/src/slug.ts'] });
    expect(tool(g, 'Write')[0]?.tool).toMatchObject({ category: 'write', files: ['/work/notes-app/src/slug.test.ts'] });
    expect(tool(g, 'Grep')[0]?.tool).toMatchObject({ category: 'search', files: ['/work/notes-app/src'] });
    expect(tool(g, 'Glob')[0]?.tool).toMatchObject({ category: 'search', files: [] });
    expect(tool(g, 'WebFetch')[0]?.tool?.category).toBe('web');
    expect(tool(g, 'Frobnicate')[0]?.tool).toMatchObject({ category: 'other', summary: 'Frobnicate' });
    const shellWrite = tool(g, 'Bash')[1]?.tool;
    expect(shellWrite?.category).toBe('run');
    expect(shellWrite?.command).toMatch(/^cat > src\/slug\.ts <<'EOF'\n/);
  });

  it('marks error and interrupted results, and the user interrupt', () => {
    expect(tool(g, 'Bash', 'tool-result').map((s) => s.status)).toEqual(['error', 'ok', 'interrupted', 'ok']);
    expect(g.steps.find((s) => s.kind === 'system' && s.status === 'interrupted')?.text).toBe('[Request interrupted by user]');
    expect(g.steps.find((s) => s.kind === 'system' && s.status === 'error')?.text).toBe('Synthetic overload, retrying');
  });

  it('links results to calls and notes persisted output without inlining it', () => {
    const results = g.steps.filter((s) => s.kind === 'tool-result');
    const resultOf = g.edges.filter((e) => e.kind === 'result-of');
    expect(resultOf).toHaveLength(results.length);
    expect(results.at(-1)?.tool?.persistedOutput).toBe('tool-results/b4syn.txt');
    expect(results.at(-1)?.tool?.command).toBeUndefined();
  });

  it('chains steps through ignored records with next edges and keeps provenance', () => {
    const read = tool(g, 'Read')[0];
    expect(read?.raw).toEqual({ file: `${DIR}/basic.jsonl`, line: 8, uuid: 'b05' });
    const thinking = g.steps.find((s) => s.kind === 'thinking');
    expect(g.edges).toContainEqual({ from: 's0', to: thinking?.id, kind: 'next' });
    expect(g.edges.some((e) => e.kind === 'forks')).toBe(false);
  });
});

describe('rewind.jsonl', () => {
  const g = graph('rewind.jsonl');

  it('adds one forks edge for the edited prompt and none for parallel tool calls', () => {
    const forks = g.edges.filter((e) => e.kind === 'forks');
    const plan = g.steps.find((s) => s.text?.startsWith('Plan:'));
    const edited = g.steps.find((s) => s.text?.startsWith('Keep the toggle'));
    expect(forks).toEqual([{ from: plan?.id, to: edited?.id, kind: 'forks' }]);
  });
});

describe('subagent.jsonl', () => {
  const g = graph('subagent.jsonl');

  it('turns the subagent transcript into a lane spawned by the Agent call', () => {
    const call = tool(g, 'Agent')[0];
    expect(call?.tool?.category).toBe('agent');
    expect(g.lanes[1]).toEqual({
      id: 'agent-a1',
      name: 'Find note storage',
      agentType: 'Explore',
      spawnedBy: call?.id,
      status: 'ok',
      file: `${DIR}/subagent/subagents/agent-a1.jsonl`,
    });
    const first = g.steps.find((s) => s.laneId === 'agent-a1');
    expect(g.edges).toContainEqual({ from: call?.id, to: first?.id, kind: 'spawned' });
  });

  it('interleaves lanes in time order', () => {
    expect(g.steps.map((s) => s.laneId)).toEqual(['main', 'main', ...Array(6).fill('agent-a1'), 'main', 'main']);
    expect(g.title).toBe('Find where notes are saved and summarise it');
  });
});
