import { Marker } from './GardenView';
import { LEGEND_P } from './metrics';
import { band, branchWidth, formatPct, type MarkerKind } from './scales';

const SAMPLE_W = 32;
const KEYS: [MarkerKind, string][] = [
  ['bud', 'can grow'],
  ['knot', 'grown'],
  ['ring', 'not recorded'],
];

/** A 32 px butt-capped line sample at the real branch width. */
function Sample({ p, other = false }: { p: number; other?: boolean }) {
  const w = branchWidth(p);
  return (
    <svg width={SAMPLE_W} height={20} aria-hidden="true" data-band={band(p)}>
      <line data-role={other ? 'legend-other' : 'legend-sample'} data-p={p} x1={0} x2={SAMPLE_W} y1={10} y2={10} strokeWidth={w} />
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
          <Sample p={0.25} other />
          other tokens
        </span>
      </p>
      <p className="legend-row">
        {KEYS.map(([kind, text]) => (
          <span key={kind} className="legend-item" data-marker={kind}>
            <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden="true" data-band="hi">
              <Marker kind={kind} />
            </svg>
            {text}
          </span>
        ))}
      </p>
    </div>
  );
}
