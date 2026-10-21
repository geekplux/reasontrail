// Real session maps bundled with the website (PLAN phase 15, D28): the agents that built Reasontrail, trimmed and
// redacted by `pnpm samples:sessions` from tools/session-samples.json. The default is bundled; the others load lazily.
import type { SessionGraph } from '../../../shared/session/types';
import defaultGraph from './verify-fail-fix.graph.json';

export interface SessionSample {
  id: string;
  title: string;
  load: () => Promise<SessionGraph>;
}

const asGraph = (json: unknown) => json as SessionGraph;

/** The first view's map, available without a network request. */
export const defaultSessionGraph: SessionGraph = asGraph(defaultGraph);

/** Every sample, default first. Titles match tools/session-samples.json (checked by a test). */
export const sessionSamples: readonly SessionSample[] = [
  {
    id: 'verify-fail-fix',
    title: 'A verifier fails phase 12, an implementer fixes it, a second verifier passes',
    load: () => Promise.resolve(defaultSessionGraph),
  },
  {
    id: 'implementer-checks',
    title: 'An implementer builds keyboard navigation, fails lint and typecheck, then fixes both',
    load: () => import('./implementer-checks.graph.json').then((m) => asGraph(m.default)),
  },
  {
    id: 'planner-pivot',
    title: 'The main agent takes a change request and has the planner rewrite the plan',
    load: () => import('./planner-pivot.graph.json').then((m) => asGraph(m.default)),
  },
];
