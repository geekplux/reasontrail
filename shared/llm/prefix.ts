// Prefix limits of POST /api/next-tokens (docs/llm-provider.md §5), shared by the Worker's validation and the client,
// plus the client's rule for fitting a long prefix into them.

/** Largest request body the Worker reads. */
export const MAX_BODY_BYTES = 4096;
/** Longest prefix, in code points after NFC normalisation. */
export const MAX_PREFIX_CHARS = 1000;

// C0/C1 controls except \t and \n, plus lone surrogates (they would hash and display as U+FFFD).
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
export const BAD_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]|\p{Cs}/u;

const SENTENCE_END = /[.!?…]["'”’)\]]*\s+|\n+/g;
const WORD_GAP = /\s+/g;

/**
 * The end of `prefix` in at most `max` code points: the model only sees the last part, so the end is never changed.
 * The cut moves forward to the first sentence start in the first half of that window, else to the first word start
 * there, else it falls mid-word. A prefix that already fits is returned as is.
 */
export function tailPrefix(prefix: string, max: number = MAX_PREFIX_CHARS): string {
  const points = [...prefix];
  if (points.length <= max) return prefix;
  const tail = points.slice(-max).join('');
  const half = tail.length / 2;
  for (const re of [SENTENCE_END, WORD_GAP]) {
    re.lastIndex = 0;
    const m = re.exec(tail);
    if (m && m.index + m[0].length <= half) return tail.slice(m.index + m[0].length);
  }
  return tail;
}
