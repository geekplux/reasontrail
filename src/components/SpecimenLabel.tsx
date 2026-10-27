import type { SampleGarden } from '../samples/types';
import { formatRecordedAt, modelLabel } from '../samples/describe';

/** A garden's provenance fields: prompt, model, k and (recorded only) the date. Also shown in the lens's More options.
 * `prompt`: false when the prompt is already shown beside them. */
export function SpecimenFields({ sample, live = false, prompt = true }: { sample: SampleGarden; live?: boolean; prompt?: boolean }) {
  return (
    <dl className="specimen-fields">
      {prompt ? (
        <>
          <dt>Prompt</dt>
          <dd className="specimen-prompt">{sample.prompt}</dd>
        </>
      ) : null}
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

/** The specimen label: unboxed, the garden's prompt, with the rest of its provenance in a closed "About this
 * garden". Its title is the heading for screen readers only: the picker's selected tab already shows it. `live`: a lens garden grown live, so it names the live model
 * and has no recording date. `level`: h2 under a page that has its own h1. */
export function SpecimenLabel({ sample, live = false, level = 'h1' }: { sample: SampleGarden; live?: boolean; level?: 'h1' | 'h2' }) {
  const Heading = level;
  return (
    <section className="specimen" aria-labelledby="specimen-title">
      <Heading id="specimen-title" className="specimen-title visually-hidden">
        {sample.title}
      </Heading>
      <p className="specimen-prompt">
        <span className="visually-hidden">Prompt: </span>
        {sample.prompt}
      </p>
      <details className="specimen-about">
        <summary>About this garden</summary>
        <SpecimenFields sample={sample} live={live} prompt={false} />
        {sample.model.note ? <p className="specimen-note">{sample.model.note}</p> : null}
      </details>
    </section>
  );
}
