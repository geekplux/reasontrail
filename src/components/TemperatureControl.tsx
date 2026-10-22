import { useId, type MouseEvent } from 'react';
import { formatT } from '../llm/temperature';

const PRESETS = [
  [0, '0 (greedy)'],
  [1, '1.0'],
  [1.5, '1.5'],
] as const;

/** Opens the "How to read" panel and focuses its summary (the note's link target). */
function openHowToRead(e: MouseEvent) {
  const panel = document.getElementById('how-to-read');
  if (!(panel instanceof HTMLDetailsElement)) return;
  e.preventDefault();
  panel.open = true;
  panel.querySelector('summary')?.focus();
}

/** Temperature (spec §10.4): a native slider with its value, and the top-k approximation note when T ≠ 1. The presets
 * are {@link TemperaturePresets}, folded into More options (DESIGN §18.1). */
export function TemperatureControl({ t, onChange }: { t: number; onChange(t: number): void }) {
  const id = useId();
  return (
    <div className="temperature">
      <label htmlFor={`${id}t`}>Temperature</label>
      <input
        id={`${id}t`}
        type="range"
        min={0}
        max={2}
        step={0.1}
        value={t}
        aria-valuetext={formatT(t)}
        aria-describedby={t === 1 ? undefined : `${id}n`}
        onChange={(e) => onChange(Math.round(Number(e.currentTarget.value) * 10) / 10)}
      />
      {/* The slider's own value text says this; an <output> is also a live region, which would speak every step. */}
      <output htmlFor={`${id}t`} aria-hidden="true">
        {formatT(t)}
      </output>
      {t === 1 ? null : (
        <a id={`${id}n`} className="temperature-note" href="#how-to-read" onClick={openHowToRead}>
          ≈ approximate (top-k only)
        </a>
      )}
    </div>
  );
}

/** The temperature presets: 0 (greedy), 1.0 and 1.5, as pressed toggle buttons. */
export function TemperaturePresets({ t, onChange }: { t: number; onChange(t: number): void }) {
  return (
    <>
      {PRESETS.map(([value, label]) => (
        <button key={value} type="button" className="view-toggle" aria-label={`Temperature ${label}`} aria-pressed={t === value} onClick={() => onChange(value)}>
          {label}
        </button>
      ))}
    </>
  );
}
