import { useOverflows } from '../components/useOverflows';
import type { Fork, GardenTree } from './buildTree';
import { entropyBand } from './entropy';
import { WsText } from './GardenView';
import { visibleItems } from './keyboard';
import { formatPct, spokenToken, STATE_TEXT, visibleWs } from './scales';

/** "1.4 bits · medium · ≈ 2.6 choices" (spec §10.2). */
const uncertainty = (f: Fork) => `${f.entropy.toFixed(1)} bits · ${entropyBand(f.entropy)} · ≈ ${(2 ** f.entropy).toFixed(1)} choices`;

/** The text alternative to the drawing (A3): every visible branch, in tree order, with the same numbers. */
export function TableView({ garden, t }: { garden: GardenTree; t: number }) {
  const [ref, position] = useOverflows<HTMLDivElement>();
  const items = visibleItems(garden);
  const said = new Map<string, string>();
  return (
    <div ref={ref} className="table-scroll" role="region" aria-label="Branches as a table" tabIndex={position ? 0 : undefined}>
      <table className="garden-table" data-role="table">
        <caption>
          Visible branches after the prompt, top to bottom as drawn.
          {garden.next ? ` After the prompt: ${uncertainty(garden.next)}.` : ''}
          {t === 1 ? '' : ' Chances at T ≠ 1 are approximate (top-k only).'}
        </caption>
        <thead>
          <tr>
            {['Path', 'Depth', 'Recorded', `At T ${t.toFixed(1)}`, 'Path chance', 'Uncertainty after', 'State'].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(({ branch: b, parentKey }) => {
            const path = `${parentKey === null ? '' : `${said.get(parentKey)} `}${spokenToken(b.token)}`;
            said.set(b.key, path);
            return (
              <tr key={b.key} data-key={b.key}>
                {/* The path as drawn (earlier tokens muted, then this branch's token); spoken as words. */}
                <th scope="row">
                  <span aria-hidden="true">
                    <span className="table-prefix">
                      <WsText text={visibleWs(parentKey ?? '')} Run="span" />
                    </span>
                    <WsText text={visibleWs(b.token)} Run="span" />
                  </span>
                  <span className="visually-hidden">{path}</span>
                </th>
                <td>{b.depth}</td>
                <td>{formatPct(b.recordedP)}</td>
                <td data-role="p">{formatPct(b.p)}</td>
                <td>{formatPct(b.pathP)}</td>
                <td>{b.next ? uncertainty(b.next) : ''}</td>
                <td>{STATE_TEXT[b.state]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
