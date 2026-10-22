import type { SampleGarden } from '../samples/types';
import { formatRecordedAt, modelLabel } from '../samples/describe';

/** A garden's provenance fields: prompt, model, k and (recorded only) the date. Also shown in the lens's More options. */
export function SpecimenFields({ sample, live = false }: { sample: SampleGarden; live?: boolean }) {
  return (
    <dl className="specimen-fields">
      <dt>Prompt</dt>
      <dd className="specimen-prompt">{sample.prompt}</dd>
      <dt>{live ? 'Grown live with' : 'Recorded with'}</dt>
      <dd>{modelLabel(sample.model)}</dd>
      <dt>Branches per fork</dt>
      <dd>
        <span className="specimen-num">
          <abbr title="top-k">k</abbr> = {sample.k}
        </span>
      </dd>
      {live ? null : (
        <>
          <dt>Recorded on</dt>
          <dd>
            <time dateTime={sample.recordedAt}>{formatRecordedAt(sample.recordedAt)}</time>
          </dd>
        </>
      )}
    </dl>
  );
}

/** The specimen label card (PLAN §3): the provenance of a garden, always visible next to it. `live`: a lens garden grown
 * live (phase 22), so it names the live model and has no recording date. `level`: h2 under a page that has its own h1. */
export function SpecimenLabel({ sample, live = false, level = 'h1' }: { sample: SampleGarden; live?: boolean; level?: 'h1' | 'h2' }) {
  const Heading = level;
  return (
    <section className="specimen" aria-labelledby="specimen-title">
      <p className="specimen-kicker" aria-hidden="true">
        Specimen
      </p>
      <Heading id="specimen-title" className="specimen-title" tabIndex={-1}>
        {sample.title}
      </Heading>
      <SpecimenFields sample={sample} live={live} />
      {sample.model.note ? <p className="specimen-note">{sample.model.note}</p> : null}
    </section>
  );
}
