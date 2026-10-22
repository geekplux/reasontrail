import { describe, expect, it } from 'vitest';
import { EXPECTED, checkPack } from './check-pack.mjs';

const files = { 'dist/viewer.html': '<script id="reasontrail-data">__REASONTRAIL_DATA__</script>', 'dist/cli.mjs': 'export {}', 'package.json': '{"name":"reasontrail"}', 'README.md': '', LICENSE: '' };
const read = (over = {}) => (f) => ({ ...files, ...over })[f] ?? '';

describe('checkPack', () => {
  it('passes the expected tarball', () => {
    expect(checkPack(EXPECTED.map((f) => `package/${f}`), read())).toEqual([]);
  });

  it('flags extra and missing files, a baked-in session and dependencies', () => {
    const problems = checkPack(['package/dist/cli.mjs', 'package/dist/viewer.html', 'package/package.json', 'package/fixtures/a.jsonl'], read({ 'dist/viewer.html': '{"sessionId":"abc"}', 'package.json': '{"dependencies":{"x":"1"}}' }));
    expect(problems).toEqual([
      'unexpected file in the tarball: fixtures/a.jsonl',
      'missing from the tarball: LICENSE',
      'missing from the tarball: README.md',
      'dist/viewer.html: the data slot is filled (a session is baked in)',
      'dist/viewer.html: contains session data (a "sessionId" value)',
      'package.json: the CLI must have no runtime dependencies',
    ]);
  });
});
