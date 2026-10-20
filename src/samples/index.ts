import type { SampleGarden } from './types';
import lighthouse from './lighthouse.json';

/** Recorded gardens bundled with the app, so the first view needs no network and no key. */
export const samples: readonly SampleGarden[] = [lighthouse as SampleGarden];

export const defaultSample: SampleGarden = samples[0]!;
