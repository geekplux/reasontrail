import { describe, expect, it } from 'vitest';
import { progressText } from './messages';

describe('progressText', () => {
  it('counts lines while reading, then says the map is being built', () => {
    expect(progressText(0, 0)).toBe('0 of 0 lines');
    expect(progressText(1234, 56789)).toBe('1,234 of 56,789 lines');
    expect(progressText(56789, 56789)).toBe('Building the map…');
  });
});
