import type { SampleGarden } from '../samples/types';

/**
 * Native radio group of the recorded gardens (F2): Tab enters on the chosen one, arrow keys move and choose.
 * Each option shows its title; its prompt is part of its accessible name and the specimen label shows it once chosen.
 */
export function SamplePicker(props: { samples: readonly SampleGarden[]; value: string; onChange(id: string): void }) {
  const { samples, value, onChange } = props;
  return (
    <fieldset className="picker">
      <legend className="picker-legend">Recorded gardens</legend>
      <div className="picker-options">
        {samples.map((s) => (
          <label key={s.id} className="picker-option">
            <input type="radio" name="sample" value={s.id} checked={s.id === value} onChange={() => onChange(s.id)} />
            {s.title}<span className="visually-hidden">{`: ${s.prompt}`}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
