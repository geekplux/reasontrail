import { Marker } from './GardenView';
import { LEGEND_P } from './metrics';
import { band, branchWidth, dashArray, formatPct, STATE_TEXT, type MarkerKind } from './scales';

const SAMPLE_W = 32;
const keys = (missing: string): [MarkerKind, string, string][] => [
  ['bud', 'filled dot', STATE_TEXT.expandable],
  ['knot', 'dot in a ring', STATE_TEXT.expanded],
  ['ring', 'hollow ring, dashed branch', missing],
  ['diamond', 'diamond, outlined branch', 'on the sampled path'],
];

type SampleKind = 'legend-sample' | 'legend-other' | 'legend-not-recorded';

/** A 32 px butt-capped line sample at the real branch width. */
function Sample({ p, kind = 'legend-sample' }: { p: number; kind?: SampleKind }) {
  const w = branchWidth(p);
  return (
    <svg width={SAMPLE_W} height={20} aria-hidden="true" data-band={band(p)}>
      <line
        data-role={kind}
        data-p={p}
        x1={0}
        x2={SAMPLE_W}
        y1={10}
        y2={10}
        strokeWidth={w}
        // The "other tokens" sample is fitted like the real stubs, so it ends on a whole dash.
        strokeDasharray={kind === 'legend-other' ? dashArray('other', w, SAMPLE_W) : undefined}
      />
    </svg>
  );
}

/** How to read the drawing (DESIGN §18.1, L4): one closed "Key" disclosure that opens on the sentence, then the thickness
 * samples with direct labels and the marker shapes. `missingState`: the hollow ring's meaning (default "not recorded";
 * the live lens names its depth limit). */
export function Legend({ missingState = STATE_TEXT['not-recorded'] }: { missingState?: string | undefined } = {}) {
  return (
    <details className="legend garden-key">
      <summary>Key</summary>
      <p className="legend-lead">Each branch is one possible next token; the thicker the branch, the more likely the token.</p>
      <p className="legend-row">
        <span className="legend-title">Thickness = chance of the next token</span>
        {LEGEND_P.map((p) => (
          <span key={p} className="legend-item">
            <Sample p={p} />
            {formatPct(p)}
          </span>
        ))}
        <span className="legend-item">
          <Sample p={0.25} kind="legend-other" />
          other tokens
        </span>
      </p>
      {/* Safari drops list semantics under list-style: none, so the role is not redundant here. */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul className="legend-row" role="list" aria-label="Branch tips">
        {keys(missingState).map(([kind, shape, text]) => (
          <li key={kind} className="legend-item" data-marker={kind}>
            <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden="true" data-band="hi">
              <Marker kind={kind} />
            </svg>
            {kind === 'ring' ? <Sample p={0.05} kind="legend-not-recorded" /> : null}
            <span className="visually-hidden">{shape}: </span>
            {text}
          </li>
        ))}
      </ul>
    </details>
  );
}
