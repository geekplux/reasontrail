// Real session maps bundled with the website (PLAN phase 15, D28): the agents that built Reasontrail, trimmed and
// redacted by `pnpm samples:sessions` from tools/session-samples.json. The default is bundled; the others load lazily.
import type { SessionGraph } from '../../../shared/session/types';
import defaultGraph from './verify-fail-fix.graph.json';

export interface SessionSample {
  id: string;
  title: string;
  /** The showcase heading (tools/session-samples.json `displayTitle`). */
  displayTitle?: string;
  /** ≤ 40 characters, for the showcase's sample switcher (DESIGN §13.3). */
  short: string;
  /** The branch the session's work ran on, when it differs from the recorded `source.gitBranch`. */
  branch?: string;
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
    displayTitle: 'Verify phase 12, fix the audit gap, re-verify',
    short: 'A verifier fails, a fix passes',
    // The recorded gitBranch is the main agent's checkout (main); its subagents worked on this branch.
    branch: 'phase-12-structure-redact',
    load: () => Promise.resolve(defaultSessionGraph),
  },
  {
    id: 'implementer-checks',
    title: 'An implementer builds keyboard navigation, fails lint and typecheck, then fixes both',
    displayTitle: 'Build keyboard navigation and a screen-reader table (phase 5)',
    short: 'Lint and typecheck fail, then pass',
    load: () => import('./implementer-checks.graph.json').then((m) => asGraph(m.default)),
  },
  {
    id: 'planner-pivot',
    title: 'The main agent takes a change request and has the planner rewrite the plan',
    displayTitle: 'Plan the reasoning-map pivot',
    short: 'A change request rewrites the plan',
    load: () => import('./planner-pivot.graph.json').then((m) => asGraph(m.default)),
  },
];
