// What the map hands the zoom-in lens: the sentence, where it came from, and its recording if there is one.
// The website provides `LensContext`; without it (the local viewer) the detail panel offers no lens.
import { createContext } from 'react';
import type { LensSample } from './lensSamples';

export interface LensTarget {
  /** The sentence, verbatim. */
  sentence: string;
  /** The opening words the garden grows from. */
  prompt: string;
  stepId: string;
  /** "<lane> › <episode>", for the breadcrumb and provenance. */
  where: string;
  /** The session sample's title, when the map is a website sample. */
  sampleTitle: string | undefined;
  /** The recorded lens garden for this sentence; none means it can only grow live, after an opt-in. */
  recorded: LensSample | undefined;
  /** Where the sentence was on screen, so the lens can move it into place (the lens transition). */
  from?: DOMRect | undefined;
}

export interface LensOpener {
  /** The session sample the map shows, or null for a dropped file. */
  sampleId: string | null;
  sampleTitle: string | undefined;
  open(target: LensTarget): void;
}

export const LensContext = createContext<LensOpener | null>(null);
