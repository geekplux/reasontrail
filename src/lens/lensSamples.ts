// Recorded lens data (PLAN phase 22, Z1): two sentences from assistant steps of each website sample, each with a
// garden recorded by tools/record-samples from the sentence's opening words (tools/record-samples/lens-prompts.json).
import type { SampleGarden } from '../samples/types';

export interface LensSample {
  /** Session sample id (`src/sessions/samples/index.ts`). */
  sampleId: string;
  /** The assistant step the sentence is from. */
  stepId: string;
  /** The sentence, verbatim from the step's text. */
  sentence: string;
  /** `src/lens/samples/<gardenId>.json`; its prompt is the sentence's opening words. */
  gardenId: string;
}

export const lensSamples: readonly LensSample[] = [
  {
    sampleId: 'implementer-checks',
    stepId: 's141',
    sentence: 'Without a fix, Chrome would read branches in that paint order.',
    gardenId: 'lens-implementer-checks-1',
  },
  {
    sampleId: 'implementer-checks',
    stepId: 's141',
    sentence: "Moving focus selects the branch, so its percentage label shows, and a 2 px focus ring is drawn around the branch's 24 px hit area.",
    gardenId: 'lens-implementer-checks-2',
  },
  {
    sampleId: 'planner-pivot',
    stepId: 's12',
    sentence: 'Now the planner rewrites the plan for the reasoning map (phases 1–9 kept).',
    gardenId: 'lens-planner-pivot-1',
  },
  {
    sampleId: 'planner-pivot',
    stepId: 's108',
    sentence: 'The old garden criteria are kept, with the live prompt box ones (F9–F12) marked superseded.',
    gardenId: 'lens-planner-pivot-2',
  },
  {
    sampleId: 'verify-fail-fix',
    stepId: 's117',
    sentence: "The stash also removed the new test, so I'll check that it fails against the old script on its own.",
    gardenId: 'lens-verify-fail-fix-1',
  },
  {
    sampleId: 'verify-fail-fix',
    stepId: 's120',
    sentence: 'The old script fails the new test on both counts: the false positive on line 1 and the missed nested secret on line 2.',
    gardenId: 'lens-verify-fail-fix-2',
  },
];

/** The recorded sentences of one step (none for steps outside the samples). */
export function lensSamplesFor(sampleId: string, stepId: string): LensSample[] {
  return lensSamples.filter((s) => s.sampleId === sampleId && s.stepId === stepId);
}

/** The recorded sentence matching exactly, if any. */
export function findLensSample(sampleId: string, stepId: string, sentence: string): LensSample | undefined {
  return lensSamples.find((s) => s.sampleId === sampleId && s.stepId === stepId && s.sentence === sentence);
}

const gardens = import.meta.glob<SampleGarden>('./samples/*.json', { import: 'default' });

/** A lens garden, as its own small chunk (about 2 KB gzip) so the map's first view doesn't carry it. */
export function loadLensGarden(gardenId: string): Promise<SampleGarden> {
  const load = gardens[`./samples/${gardenId}.json`];
  return load ? load() : Promise.reject(new Error(`No recorded lens garden "${gardenId}".`));
}
