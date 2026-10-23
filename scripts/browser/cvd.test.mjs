import { expect, it } from 'vitest';
import { MACHADO } from '../../src/styles/colorMath';
import { MATRICES } from './cvd.mjs';

it('uses the same Machado matrices as the palette tests', () => {
  expect(MATRICES).toEqual(MACHADO);
});
