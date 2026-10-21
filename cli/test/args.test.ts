import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args';

describe('parseArgs', () => {
  it('defaults to the newest session for the folder, opened in a browser', () => {
    expect(parseArgs([])).toEqual({ mode: 'auto', share: false, json: false, open: true, ai: false, yes: false });
  });

  it('reads every flag, with values as separate or = arguments', () => {
    expect(parseArgs(['--latest', '--share', '--json', '--no-open', '--out', 'x.html', '--source=claude-code'])).toEqual({
      mode: 'latest', share: true, json: true, open: false, ai: false, yes: false, out: 'x.html', source: 'claude-code',
    });
    expect(parseArgs(['abc-123'])).toMatchObject({ mode: 'auto', target: 'abc-123' });
    expect(parseArgs(['--current'])).toMatchObject({ mode: 'current' });
    expect(parseArgs(['--list'])).toMatchObject({ mode: 'list' });
    expect(parseArgs(['x.jsonl', '--trim', '10:399'])).toMatchObject({ target: 'x.jsonl', trim: { from: 10, to: 399 } });
    expect(parseArgs(['--trim=0:0'])).toMatchObject({ trim: { from: 0, to: 0 } });
    expect(parseArgs(['--source', 'grok'])).toMatchObject({ source: 'grok-build' });
    expect(parseArgs(['--source=grok-build'])).toMatchObject({ source: 'grok-build' });
    expect(parseArgs(['--source', 'codex', '--list'])).toMatchObject({ source: 'codex', mode: 'list' });
  });

  it('lets help and version win over everything else', () => {
    expect(parseArgs(['--latest', '-h'])).toMatchObject({ mode: 'help' });
    expect(parseArgs(['--version'])).toMatchObject({ mode: 'version' });
  });

  it.each([
    [['--bogus'], 'unknown option: --bogus'],
    [['--out'], '--out needs a file path'],
    [['--trim'], '--trim needs <from>:<to> step numbers, from <= to'],
    [['--trim', '5:2'], '--trim needs <from>:<to> step numbers, from <= to'],
    [['--trim', '1-5'], '--trim needs <from>:<to> step numbers, from <= to'],
    [['--source', 'gpt'], '--source must be one of claude-code, grok, codex'],
    [['--latest', '--current'], 'choose one of --latest, --current'],
    [['a', 'b'], 'more than one session given: a, b'],
    [['a', '--latest'], 'a session path or id cannot be combined with --latest'],
  ])('rejects %j', (argv, error) => {
    expect(parseArgs(argv)).toEqual({ error });
  });
});
