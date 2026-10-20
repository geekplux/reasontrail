import type { ReactNode } from 'react';
import { mostLikelyPath, pathTo, type GardenTree } from './buildTree';
import { WsText } from './GardenView';
import { formatPct, visibleWs } from './scales';

/** The continuation being read (hovered/selected), or the most likely one: prompt + tokens + path chance. */
/** `note`: a branch note that found no free spot in the drawing (it then follows the path chance). */
export function PathReadout({ garden, labelledKey, note = null }: { garden: GardenTree; labelledKey: string | null; note?: ReactNode }) {
  const path = labelledKey ? pathTo(garden, labelledKey) : [];
  const shown = path.length ? path : mostLikelyPath(garden);
  const last = shown.at(-1);
  return (
    <p className="readout" data-role="readout">
      <span className="readout-kicker">{path.length ? 'Reading:' : 'Most likely:'}</span>{' '}
      <span className="readout-prompt">{garden.prompt}</span>
      {shown.map((b) => (
        <span key={b.key} className="readout-token">
          <WsText text={visibleWs(b.token)} Run="span" />
        </span>
      ))}
      {last ? <span className="readout-p"> path {formatPct(last.pathP)}</span> : null}
      {note ? <> {note}</> : null}
    </p>
  );
}
