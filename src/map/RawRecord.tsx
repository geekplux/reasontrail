// "Show raw" (DESIGN §8.10, DM19): the verbatim record in a <pre>, as text (React escapes it; never HTML), with
// redaction placeholders marked "Redacted". The <pre> scrolls, so it is a tab stop; map keys do nothing inside it.
import { fileLabel } from './outline';
import { redactionParts } from './details';

export function RawRecord({ file, line, text }: { file: string; line: number; text?: string | undefined }) {
  const label = `Raw record, ${fileLabel(file)} line ${line}`;
  return (
    <figure className="raw">
      <figcaption className="mono muted" title={file}>{fileLabel(file)}:{line}</figcaption>
      {text === undefined ? (
        <p className="muted">This record is not included in this map. It is at line {line} of {file}.</p>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must be keyboard-reachable
        <pre className="raw-pre mono" tabIndex={0} aria-label={label}>
          {redactionParts(text).map((p, i) => (p.redacted ? <span key={i} className="redacted" title="Redacted">{p.text}</span> : p.text))}
        </pre>
      )}
    </figure>
  );
}
