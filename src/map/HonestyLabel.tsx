// The honesty label (PLAN M5, D29, DESIGN §8.9): always visible, never dismissible.
import { InfoGlyph } from './Glyph';

export const HONESTY_TEXT = "Written reasoning is the agent's own account, not a record of how the model computed.";
export const HOW_TO_READ_URL = 'https://github.com/geekplux/reasontrail#how-to-read-this-map';

export function HonestyLabel() {
  return (
    <p className="honesty" data-honesty="">
      <InfoGlyph />
      <span>
        {HONESTY_TEXT} <a href={HOW_TO_READ_URL}>How to read this map</a>
      </span>
    </p>
  );
}
