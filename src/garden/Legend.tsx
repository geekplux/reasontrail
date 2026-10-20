import { Marker } from './GardenView';
import { LEGEND_P } from './metrics';
import { band, branchWidth, dashArray, formatPct, type MarkerKind } from './scales';

const SAMPLE_W = 32;
const KEYS: [MarkerKind, string][] = [
  ['bud', 'can grow'],
  ['knot', 'grown'],
  ['ring', 'not recorded'],
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

/** How to read the drawing: thickness samples with direct labels, then the marker shapes. */
export function Legend() {
  return (
    <div className="legend">
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
      <p className="legend-row">
        {KEYS.map(([kind, text]) => (
          <span key={kind} className="legend-item" data-marker={kind}>
            <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden="true" data-band="hi">
              <Marker kind={kind} />
            </svg>
            {kind === 'ring' ? <Sample p={0.05} kind="legend-not-recorded" /> : null}
            {text}
          </span>
        ))}
      </p>
    </div>
  );
}
