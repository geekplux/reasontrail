import { describe, expect, it } from 'vitest';
import { firstLines, readJsonl } from './jsonl';

describe('readJsonl', () => {
  it('parses lines, skips blanks, accepts CRLF and a final line without newline', () => {
    expect(readJsonl('{"a":1}\r\n\n{"b":2}')).toEqual({ records: [{ line: 1, value: { a: 1 } }, { line: 3, value: { b: 2 } }], malformed: 0, partial: 0 });
  });

  it('counts malformed lines and a partial last line separately', () => {
    expect(readJsonl('{"a":1}\nnope\n{"b":')).toMatchObject({ malformed: 1, partial: 1 });
    expect(readJsonl('{"b":\n')).toMatchObject({ malformed: 1, partial: 0 });
  });
});

describe('firstLines', () => {
  it('returns the first non-blank lines', () => {
    expect(firstLines('\n a \n\nb\nc', 2)).toEqual(['a', 'b']);
  });
});
