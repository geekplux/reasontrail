import { describe, expect, it } from 'vitest';
import { normalizeSession } from './adapter';
import { buildGraph } from './build/graph';
import { RAW_REDACT_MARGIN, RAW_TEXT_MIN, attachRaw, clipRaw, clipRedacted, rawCap } from './raw';
import { findSecrets, redactText } from './redact';
import { RAW_TEXT_MAX } from './types';

const line = (o: object) => JSON.stringify(o);
const file = {
  path: 'x.jsonl',
  text: [
    line({ type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'fix it, key sk-ant-abcdefghijklmnopqrstuvwx' } }),
    line({ type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-01-01T00:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'a.ts', old_string: 'a\nb', new_string: 'a\nc' } }] } }),
  ].join('\n') + '\n',
};

describe('attachRaw', () => {
  const g = buildGraph(normalizeSession({ files: [file] })!);
  it('puts the verbatim line on the first step of each record only', () => {
    const r = attachRaw(g, [file]);
    expect(r.steps[0]?.rawText).toContain('"type":"user"');
    expect(r.steps[1]?.rawText).toContain('"tool_use"');
    expect(r.steps[2]?.rawText).toBeUndefined();
    expect(g.steps[0]?.rawText).toBeUndefined();
  });
  it('redacts before clipping', () => {
    const r = attachRaw(g, [file], { redact: (t) => redactText(t), max: 160 });
    expect(r.steps[0]?.rawText).toContain('[secret:anthropic-key]');
    expect(r.steps[1]?.rawText).toMatch(/…\n\[cut [\d,]+ characters; full record at x\.jsonl:2\]$/);
  });
  it('keeps edit text on the call, not the result', () => {
    expect(g.steps[2]?.tool?.edit).toEqual({ before: 'a\nb', after: 'a\nc' });
  });
  it('clips', () => {
    expect(clipRaw('abcdef', { file: 'a/b.jsonl', line: 7 }, 3)).toBe('abc…\n[cut 3 characters; full record at a/b.jsonl:7]');
    expect(clipRaw('abc', { file: 'b.jsonl', line: 1 }, 3)).toBe('abc');
  });
});

describe('rawCap (total raw budget)', () => {
  const sized = (lengths: number[], note = 64) => lengths.map((length) => ({ length, note }));
  it('keeps the per-record cap while the total fits', () => {
    expect(RAW_TEXT_MAX).toBe(1024);
    expect(rawCap(sized([10, 5000, 300]))).toBe(1024);
    expect(rawCap([])).toBe(1024);
  });
  it('lowers the cap uniformly to the largest that fits the budget, notes included', () => {
    const records = sized(Array.from({ length: 100 }, () => 5000));
    const cap = rawCap(records, { total: 50_000 });
    expect(cap).toBe(436); // 100 × (436 + 64 note) = 50,000
    const cost = (c: number) => records.reduce((sum, r) => sum + (r.length <= c ? r.length : c + r.note), 0);
    expect(cost(cap)).toBeLessThanOrEqual(50_000);
    expect(cost(cap + 1)).toBeGreaterThan(50_000);
  });
  it('never goes below the minimum', () => {
    expect(rawCap(sized(Array.from({ length: 1000 }, () => 5000)), { total: 1000 })).toBe(RAW_TEXT_MIN);
    expect(rawCap(sized([5000]), { max: 160, total: 10 })).toBe(160);
  });
  it('is deterministic and order-independent', () => {
    const records = sized(Array.from({ length: 500 }, (_, i) => (i * 7919) % 6000));
    const a = rawCap(records, { total: 200_000 });
    expect(rawCap([...records].reverse(), { total: 200_000 })).toBe(a);
    expect(rawCap(records, { total: 200_000 })).toBe(a);
  });
  it('applies the lowered cap to every record of a map', () => {
    const rec = (i: number) => line({ type: i % 2 ? 'assistant' : 'user', uuid: `r${i}`, ...(i ? { parentUuid: `r${i - 1}` } : {}), timestamp: '2026-01-01T00:00:00Z', message: i % 2 ? { role: 'assistant', content: [{ type: 'text', text: 'y'.repeat(3000) }] } : { role: 'user', content: 'y'.repeat(3000) } });
    const big = { path: 'b.jsonl', text: `${[0, 1, 2].map(rec).join('\n')}\n` };
    const g = buildGraph(normalizeSession({ files: [big] })!);
    const note = 2 + `[cut 3,000 characters; full record at b.jsonl:1]`.length;
    const r = attachRaw(g, [big], { total: 3 * (300 + note) });
    const bodies = r.steps.filter((s) => s.rawText).map((s) => s.rawText!.split('…\n')[0]!.length);
    expect(bodies).toEqual([300, 300, 300]);
  });
});

describe('clipRedacted (redact after cutting)', () => {
  const at = { file: 'x.jsonl', line: 4 };
  const KEY = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz0123'].join('-');
  it('redacts a secret that straddles the cap and keeps its placeholder whole', () => {
    const text = `${'a '.repeat(495)}${KEY} ${'b'.repeat(2000)}`;
    const out = clipRedacted(text, at, 1000, (t) => redactText(t));
    expect(out).not.toContain('sk-ant');
    expect(out).toContain('[secret:anthropic-key]…\n[cut ');
  });
  it('leaves out a token cut at the edge of the redacted window (no partial secret)', () => {
    // A quoted secret value longer than the margin: no rule sees its closing quote inside the window.
    const value = 'q'.repeat(RAW_REDACT_MARGIN + 600);
    const text = `{"note":"${'n'.repeat(980)}","api_token":"${value}","more":"${'m'.repeat(500)}"}`;
    const out = clipRedacted(text, at, 1024, (t) => redactText(t));
    expect(out).not.toMatch(/q{2}/);
    expect(out).toMatch(/"api_token":"…\n\[cut [\d,]+ characters; full record at x\.jsonl:4\]$/);
  });
  it('only redacts the cap plus a margin, and counts the cut from the whole record', () => {
    const seen: number[] = [];
    const text = `${'word '.repeat(2000)}`;
    const out = clipRedacted(text, at, 300, (t) => (seen.push(t.length), t));
    expect(seen).toEqual([300 + RAW_REDACT_MARGIN, 300]); // the window, then the kept part
    expect(out).toBe(`${text.slice(0, 300)}…\n[cut ${(text.length - 300).toLocaleString('en-US')} characters; full record at x.jsonl:4]`);
  });
  it('re-redacts the kept part: a cut fragment never matches a rule its whole did not', () => {
    // A long, low-entropy blob (an image's zero padding) whose first part alone looks like a secret.
    const blob = `${'Zq8xK2mW7pL4vN9cT3hB6yR1fJ5dG0sA'.repeat(2)}${'A'.repeat(400)}`;
    const text = `{"data":"${blob}"}`;
    expect(redactText(text)).toBe(text);
    expect(clipRaw(text, at, 80)).toMatch(/^\{"data":"Zq8x/);
    expect(clipRedacted(text, at, 80, (t) => redactText(t))).toBe(`{"data":"[secret:high-entropy]…\n[cut ${(text.length - 80).toLocaleString('en-US')} characters; full record at x.jsonl:4]`);
  });
  it('never leaves a home prefix cut before its user name ("/Users/…")', () => {
    for (const prefix of ['/Users/', '/home/', 'C:\\Users\\']) {
      const head = `see ${prefix}`;
      for (const tail of [' and more text', ` ${'w '.repeat(RAW_REDACT_MARGIN + 50)}`]) {
        const out = clipRedacted(`${head}${tail}`, at, head.length, (t) => redactText(t));
        expect(out.startsWith('see …\n[cut ')).toBe(true);
        expect(findSecrets(out)).toEqual([]);
      }
    }
  });
  it('a cut at any point of a line full of sensitive text leaves no rule hit', () => {
    const sample = `{"cwd":"/Users/alice/proj","home":"/home/bob/x","win":"C:\\Users\\carol\\y","mail":"dev@example.com","key":"${KEY}","url":"https://u:p4ss@host.dev/a","api_token":"Zq8xK2mW7pL4vN9cT3hB6yR1"} -home-dave-proj /Users/ /home/`;
    for (const pad of [0, RAW_REDACT_MARGIN + 40]) {
      const text = `${sample}${' z'.repeat(pad)}`;
      for (let max = 1; max < sample.length; max++) {
        const out = clipRedacted(text, at, max, (t) => redactText(t));
        expect([max, findSecrets(out)]).toEqual([max, []]);
      }
    }
  });
  it('matches redact-then-clip for records within the window', () => {
    const text = `key ${KEY} ${'z '.repeat(200)}`;
    expect(clipRedacted(text, at, 100, (t) => redactText(t))).toBe(clipRaw(redactText(text), at, 100));
  });
});

