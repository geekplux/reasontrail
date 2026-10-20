import { useOverflows } from '../components/useOverflows';
import type { GardenTree } from './buildTree';
import { WsText } from './GardenView';
import { visibleItems } from './keyboard';
import { formatPct, spokenToken, STATE_TEXT, visibleWs } from './scales';

/** The text alternative to the drawing (A3): every visible branch, in tree order, with the same numbers. */
export function TableView({ garden }: { garden: GardenTree }) {
  const [ref, position] = useOverflows<HTMLDivElement>();
  const items = visibleItems(garden);
  const said = new Map<string, string>();
  return (
    <div ref={ref} className="table-scroll" role="region" aria-label="Branches as a table" tabIndex={position ? 0 : undefined}>
      <table className="garden-table" data-role="table">
        <caption>Visible branches after the prompt, top to bottom as drawn</caption>
        <thead>
          <tr>
            {['Path', 'Depth', 'Chance', 'Path chance', 'State'].map((h) => (
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
                <td data-role="p">{formatPct(b.p)}</td>
                <td>{formatPct(b.pathP)}</td>
                <td>{STATE_TEXT[b.state]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
