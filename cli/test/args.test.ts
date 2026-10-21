import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args';

describe('parseArgs', () => {
  it('defaults to the newest session for the folder, opened in a browser', () => {
    expect(parseArgs([])).toEqual({ mode: 'auto', share: false, json: false, open: true });
  });

  it('reads every flag, with values as separate or = arguments', () => {
    expect(parseArgs(['--latest', '--share', '--json', '--no-open', '--out', 'x.html', '--source=claude-code'])).toEqual({
      mode: 'latest', share: true, json: true, open: false, out: 'x.html', source: 'claude-code',
    });
    expect(parseArgs(['abc-123'])).toMatchObject({ mode: 'auto', target: 'abc-123' });
    expect(parseArgs(['--current'])).toMatchObject({ mode: 'current' });
    expect(parseArgs(['--list'])).toMatchObject({ mode: 'list' });
  });

  it('lets help and version win over everything else', () => {
    expect(parseArgs(['--latest', '-h'])).toMatchObject({ mode: 'help' });
    expect(parseArgs(['--version'])).toMatchObject({ mode: 'version' });
  });

  it.each([
    [['--bogus'], 'unknown option: --bogus'],
    [['--out'], '--out needs a file path'],
    [['--source', 'gpt'], '--source must be one of claude-code, codex, grok-build'],
    [['--latest', '--current'], 'choose one of --latest, --current'],
    [['a', 'b'], 'more than one session given: a, b'],
    [['a', '--latest'], 'a session path or id cannot be combined with --latest'],
  ])('rejects %j', (argv, error) => {
    expect(parseArgs(argv)).toEqual({ error });
  });
});
