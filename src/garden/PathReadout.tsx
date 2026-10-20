import type { ReactNode } from 'react';
import { mostLikelyPath, pathTo, type GardenTree } from './buildTree';
import { WsText } from './GardenView';
import { DEPTH_CAP, type SampledPath } from './samplePath';
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

/** Why a sampled walk stopped, in words (spec §10.3). */
export function stopText(s: SampledPath, k: number): string {
  if (s.stop === 'other') return `drew a token outside the top ${k} (other ${formatPct(s.otherP)})`;
  return s.stop === 'depth-cap' ? `depth limit (${DEPTH_CAP} tokens)` : 'the recording ends here';
}

/** The sampled sentence: "Sampled (T 1.0, seed 7): <prompt><tokens> · path x% · stopped: <reason>". */
export function SampledReadout({ prompt, sampled, t, seed, k }: { prompt: string; sampled: SampledPath; t: number; seed: number; k: number }) {
  return (
    <p className="readout-sampled" data-role="sampled-readout">
      <span className="readout-kicker">{`Sampled (T ${t.toFixed(1)}, seed ${seed}):`}</span>{' '}
      <span className="readout-prompt">{prompt}</span>
      {sampled.keys.map((key, i) => (
        <span key={key} className="readout-token readout-token-sampled">
          <WsText text={visibleWs(key.slice(i ? sampled.keys[i - 1]!.length : 0))} Run="span" />
        </span>
      ))}
      <span className="readout-p">{` · path ${formatPct(sampled.p)} · stopped: ${stopText(sampled, k)}`}</span>
    </p>
  );
}
