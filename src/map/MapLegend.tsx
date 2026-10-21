// The inline legend (DESIGN §9.1): the real glyphs with their words. Shape is the code; there is no colour key.
import { BlazeIcon, KindGlyph } from './Glyph';
import type { Episode } from '../../shared/session/types';

const KINDS: [Episode['kind'], string][] = [['discuss', 'ask'], ['explore', 'explore'], ['change', 'change'], ['verify', 'verify'], ['delegate', 'delegate'], ['answer', 'answer']];

export function MapLegend() {
  return (
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics under list-style: none
    <ul className="legend" role="list" aria-label="Legend">
      {KINDS.map(([kind, word]) => <li key={kind}><KindGlyph kind={kind} />{word}</li>)}
      <li className="legend-plate"><BlazeIcon kind="error-streak" resolved={false} badge="" />trouble</li>
      <li className="legend-plate"><BlazeIcon kind="error-streak" resolved badge="" />resolved</li>
    </ul>
  );
}
