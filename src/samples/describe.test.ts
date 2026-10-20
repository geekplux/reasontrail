import { describe, expect, it } from 'vitest';
import { formatRecordedAt, modelLabel } from './describe';

describe('modelLabel', () => {
  it('drops the org and ONNX suffix and appends the dtype', () => {
    expect(modelLabel({ provider: 'fixture', name: 'onnx-community/SmolLM2-135M-ONNX', dtype: 'q8' })).toBe('SmolLM2-135M (q8)');
    expect(modelLabel({ provider: 'workers-ai', name: '@cf/zai-org/glm-4.7-flash' })).toBe('glm-4.7-flash');
  });
});

describe('formatRecordedAt', () => {
  it('formats ISO dates without depending on locale or time zone', () => {
    expect(formatRecordedAt('2026-10-19')).toBe('19 October 2026');
    expect(formatRecordedAt('2026-01-02T10:00:00Z')).toBe('2 January 2026');
    expect(formatRecordedAt('someday')).toBe('someday');
  });
});
