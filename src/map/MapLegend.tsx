// The Key (DESIGN §9.1, §18.2 CL3): the real glyphs with their words, folded behind the Key button at the right end of
// the route header and shown as a row under it. Shape is the code; there is no colour key. Each glyph also says its kind in its own accessible name.
import { BlazeIcon, KindGlyph } from './Glyph';
import type { Episode, SessionGraph } from '../../shared/session/types';

const KINDS: [Episode['kind'], string][] = [['discuss', 'ask'], ['explore', 'explore'], ['change', 'change'], ['verify', 'verify'], ['delegate', 'delegate'], ['answer', 'answer']];

/** The legend entries a map actually shows (chat maps list only these): episode kinds, then the plate states. */
export function legendKinds(g: SessionGraph): Set<string> {
  const present = new Set<string>(g.episodes.map((e) => e.kind));
  present.add('answer'); // the ◉ terminus is always drawn
  if (g.trouble.some((t) => !t.resolved)) present.add('trouble');
  if (g.trouble.some((t) => t.resolved)) present.add('resolved');
  return present;
}

/** `kinds`: show only these entries (by kind, or "trouble" / "resolved"); all of them when omitted. */
export function MapLegend({ kinds, id, open = true }: { kinds?: Set<string> | undefined; id?: string; open?: boolean } = {}) {
  const has = (k: string) => !kinds || kinds.has(k);
  return (
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics under list-style: none
    <ul id={id} className="legend" role="list" aria-label="Legend" hidden={!open}>
      {KINDS.filter(([kind]) => has(kind)).map(([kind, word]) => <li key={kind}><KindGlyph kind={kind} />{word}</li>)}
      {has('trouble') && <li className="legend-plate"><BlazeIcon kind="error-streak" resolved={false} badge="" />trouble</li>}
      {has('resolved') && <li className="legend-plate"><BlazeIcon kind="error-streak" resolved badge="" />resolved</li>}
    </ul>
  );
}
