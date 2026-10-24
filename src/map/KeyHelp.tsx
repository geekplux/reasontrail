// The shared Keyboard help (DESIGN §18.2): the map's keys, folded behind a "?" summary instead of a line of key hints.
/** `vertical`: the phone's vertical route, where Up and Down move along the steps. */
export function KeyHelp({ vertical = false }: { vertical?: boolean }) {
  return (
    <details className="key-help">
      <summary><span className="key-q" aria-hidden="true">?</span> Keyboard</summary>
      <p className="muted fine">{vertical ? '↑ ↓' : '← →'} previous and next step. ] [ next and previous pattern. Esc closes the details.</p>
    </details>
  );
}
