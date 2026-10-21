// The step strip (DESIGN §10.1): one row per step of the selected episode or pattern, under the map. Evidence rows
// have the wash; the selected row an ink bar and 600 weight. One tab stop: ↑ ↓ Home End move, Enter or a click selects.
import { useRef, type KeyboardEvent } from 'react';
import type { SessionGraph } from '../../shared/session/types';
import { StatusGlyph, UnstoredGlyph } from './Glyph';
import { exitCode, rowLabel, rowStatus, rowStatusWord, type Row } from './details';
import { duration, isUnstoredThinking } from './outline';

interface Props {
  g: SessionGraph;
  rows: Row[];
  selected: string | undefined;
  evidence: ReadonlySet<string>;
  heading: string;
  onPick(id: string): void;
}

/** "7 min" after the session start, or nothing. */
export function since(g: SessionGraph, t: string | undefined): string {
  const ms = t && g.source.startedAt ? Date.parse(t) - Date.parse(g.source.startedAt) : Number.NaN;
  return Number.isFinite(ms) ? duration(ms) : '';
}

export function rowWords(r: Row): string {
  const word = rowStatusWord(r);
  const exit = exitCode(r);
  return [word, exit !== undefined ? `exit ${exit}` : ''].filter(Boolean).join(' · ');
}

export function StepList({ g, rows, selected, evidence, heading, onPick }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const at = Math.max(0, rows.findIndex((r) => r.id === selected));
  const focusRow = (i: number) => ref.current?.querySelectorAll<HTMLButtonElement>('button')[i]?.focus();
  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    const i = Number((e.target as HTMLElement).closest('[data-i]')?.getAttribute('data-i') ?? at);
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
          const status = rowStatus(r);
          const t = since(g, r.step.t);
          const lines = r.ids.map((id) => g.steps.find((s) => s.id === id)?.raw.line ?? 0);
          const where = lines.length > 1 && lines[0] !== lines.at(-1) && isUnstoredThinking(r.step) ? `jsonl:${lines[0]}–${lines.at(-1)}` : `jsonl:${lines[0]}`;
          return (
            <li key={r.id} data-i={i} data-step={r.id} data-evidence={ev ? 'true' : undefined}>
              <button type="button" tabIndex={i === at ? 0 : -1} aria-current={r.id === selected ? 'true' : undefined} onClick={() => onPick(r.id)}>
                {isUnstoredThinking(r.step) ? <UnstoredGlyph /> : status ? <StatusGlyph status={status} /> : <span className="glyph-space" aria-hidden="true" />}
                <span className="mono step-label">{rowLabel(r)}</span>
                <span className="step-word">{rowWords(r)}{ev ? <span className="visually-hidden">, evidence</span> : null}</span>
                <span className="mono muted step-where">{[t, where].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
