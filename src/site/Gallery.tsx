// The sample switcher (DESIGN §13.3): a quiet segmented control of the bundled sessions, a <select> below 768 px.
// Choosing one swaps the live map in place and writes `?session=` (Back returns to the previous sample).
import type { SessionSample } from '../sessions/samples';

export function Gallery({ samples, current, onChoose }: { samples: readonly SessionSample[]; current: string; onChoose(id: string): void }) {
  return (
    <fieldset className="gallery">
      <legend className="section-label">Samples</legend>
      <div className="gallery-segments">
        {samples.map((s) => (
          <label key={s.id} title={s.title}>
            <input type="radio" name="session" value={s.id} checked={s.id === current} onChange={() => onChoose(s.id)} />
            <span>{s.short}</span>
          </label>
        ))}
      </div>
      <select className="gallery-select" aria-label="Sample session" value={current} onChange={(e) => onChoose(e.target.value)}>
        {samples.map((s) => (
          <option key={s.id} value={s.id}>{s.short}</option>
        ))}
      </select>
    </fieldset>
  );
}
