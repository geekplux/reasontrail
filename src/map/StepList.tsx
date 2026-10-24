// The step strip (DESIGN §10.1, §18.3): one row per step of the selected episode or pattern, under the map, unboxed on
// paper; each record's location is in the detail panel. Evidence rows have the wash; the selected row a 2 px ink bar
// and 600 weight. One tab stop: ↑ ↓ Home End move, Enter or a click selects
// (and announces "Step n of N"), Esc closes the details.
import { useRef, type KeyboardEvent } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { KindGlyph, StatusGlyph, UnstoredGlyph } from './Glyph';
import { exitCode, rowLabel, rowStatus, rowStatusWord, stepSay, type Row } from './details';
import { duration, isUnstoredThinking } from './outline';

interface Props {
  g: SessionGraph;
  rows: Row[];
  selected: string | undefined;
  evidence: ReadonlySet<string>;
  heading: string;
  onPick(id: string): void;
  /** Esc in the strip closes the details (focus goes back to the opener). */
  onClose(): void;
  announce(text: string): void;
}

/** "7 min" after the session start, or nothing. */
export function since(g: SessionGraph, t: string | undefined): string {
  const ms = t && g.source.startedAt ? Date.parse(t) - Date.parse(g.source.startedAt) : Number.NaN;
  return Number.isFinite(ms) ? duration(ms) : '';
}

export function rowWords(r: Row): string {
  const word = rowStatusWord(r);
  const exit = exitCode(r);
  return [word, exit !== undefined ? `exit ${exit}` : ''].filter(Boolean).join(', ');
}

/** The row's glyph: ▶ for the user's asks, the dotted square for unstored thinking, else its status (or a space). */
export function RowGlyph({ row }: { row: Row }) {
  const status = rowStatus(row);
  if (row.step.kind === 'user') return <KindGlyph kind="discuss" />;
  if (isUnstoredThinking(row.step)) return <UnstoredGlyph />;
  return status ? <StatusGlyph status={status} /> : <span className="glyph-space" aria-hidden="true" />;
}

export function StepList({ g, rows, selected, evidence, heading, onPick, onClose, announce }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const at = Math.max(0, rows.findIndex((r) => r.id === selected));
  const focusRow = (i: number) => ref.current?.querySelectorAll<HTMLButtonElement>('button')[i]?.focus();
  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    const i = Number((e.target as HTMLElement).closest('[data-i]')?.getAttribute('data-i') ?? at);
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
    if (to === undefined || to < 0 || to >= rows.length) return;
    e.preventDefault();
    focusRow(to);
  };
  return (
    <section className="step-strip" aria-label={heading}>
      <h3 className="section-label">{heading}</h3>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys move between the row buttons */}
      <ol ref={ref} className="step-rows" onKeyDown={onKeyDown}>
        {rows.map((r, i) => {
          const ev = r.ids.some((id) => evidence.has(id));
          const t = since(g, r.step.t);
          return (
            <li key={r.id} data-i={i} data-step={r.id} data-evidence={ev ? 'true' : undefined}>
              <button type="button" tabIndex={i === at ? 0 : -1} aria-current={r.id === selected ? 'true' : undefined} onClick={() => {
                onPick(r.id);
                announce(stepSay('Step', i + 1, rows.length, r));
              }}>
                <RowGlyph row={r} />
                <span className="mono step-label">{rowLabel(r)}</span>
                <span className="step-word">{rowWords(r)}{ev ? <span className="visually-hidden">, evidence</span> : null}</span>
                <span className="mono muted step-where">{t}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
