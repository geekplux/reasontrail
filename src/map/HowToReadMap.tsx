// How to read a map (PLAN phase 19): the four glance questions, with the real glyphs. Shape is the code, never colour.
// Folded on the showcase (DESIGN §18.1): a closed <details> with the same label; the footer link opens it.
import { BlazeIcon, KindGlyph } from './Glyph';
import { HONESTY_TEXT } from './HonestyLabel';

const KINDS = [['discuss', 'ask'], ['explore', 'explore'], ['change', 'change'], ['verify', 'verify'], ['delegate', 'delegate'], ['answer', 'answer']] as const;

export function HowToReadMap() {
  return (
    <details id="how-to-read" className="how-to-read-map">
      <summary><span className="section-label">How to read a map</span></summary>
      <ol>
        <li><strong>The task.</strong> The trailhead: what was asked, how long it ran and how many tools it used.</li>
        <li>
          <strong>The route.</strong> Episodes in order, left to right. The glyph names the kind:{' '}
          <span className="how-kinds">{KINDS.map(([k, word]) => <span key={k}><KindGlyph kind={k} />{word}</span>)}</span>
          Subagents run on side trails below.
        </li>
        <li>
          <strong>Where it got stuck.</strong> A numbered blaze marks a
          detected pattern (repeated errors, retries, reverts):{' '}
          <span className="how-kinds"><span><BlazeIcon kind="error-streak" resolved={false} badge="" />open</span><span><BlazeIcon kind="error-streak" resolved badge="" />resolved</span></span>
        </li>
        <li><strong>The destination.</strong> What changed, and whether a test, build, lint or typecheck run checked it.</li>
      </ol>
      <p className="muted">{HONESTY_TEXT} Select any step to see its source line.</p>
    </details>
  );
}
