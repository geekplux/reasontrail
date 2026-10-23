import type { SampleGarden } from './types';
import autumn from './autumn.json';
import cat from './cat.json';
import language from './language.json';
import lighthouse from './lighthouse.json';
import recipe from './recipe.json';
import robot from './robot.json';

/**
 * Recorded gardens bundled with the app, so the first view needs no network and no key.
 * Produced by tools/record-samples (SmolLM2-135M, q8); the first entry is the default.
 */
export const samples: readonly SampleGarden[] = [lighthouse, robot, language, autumn, recipe, cat] as SampleGarden[];

export const defaultSample: SampleGarden = samples[0]!;
