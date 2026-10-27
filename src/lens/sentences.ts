// Sentences of an assistant's text for the zoom-in lens: where each one starts and ends, which
// ones are worth zooming into, and the opening words a garden grows from (the recorded lens gardens use the same rule).

export interface Sentence {
  /** The sentence, verbatim and trimmed. */
  text: string;
  /** Offsets in the source text: `source.slice(start, end) === text`. */
  start: number;
  end: number;
  /** At least `MIN_WORDS` words and not a table row or code fence: offered for zooming. */
  zoomable: boolean;
}

/** Shorter fragments (headings like "**What works now**", "Done.") are left as plain text. */
export const MIN_WORDS = 4;
/** The lens grows from at most this many opening words. */
export const OPENING_WORDS = 8;
/** Words the model is left to predict at least, so a short sentence is not given away whole. */
const LEFT_TO_PREDICT = 2;

// A sentence ends at . ! ? or … (plus closing quotes, brackets or markdown emphasis) before a space, or at a line break.
const END = /[.!?…]+["'”’)\]*_`]*(?=\s|$)|\n/g;
const WORD = /[\p{L}\p{N}]/u;

/** Splits `text` into sentences in reading order; the gaps between them (spaces, line breaks) belong to none. */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const body = raw.trim();
    if (!body) return;
    const at = start + raw.indexOf(body);
    const words = plainText(body).split(/\s+/).filter((w) => WORD.test(w)).length;
    out.push({ text: body, start: at, end: at + body.length, zoomable: words >= MIN_WORDS && !/^(\||```)/.test(body) });
  };
  for (const m of text.matchAll(END)) {
    push(m[0] === '\n' ? m.index : m.index + m[0].length);
    start = m.index + m[0].length;
  }
  push(text.length);
  return out;
}

/** The sentence without markdown marks: list bullets, heading hashes, emphasis and code ticks. */
export function plainText(sentence: string): string {
  return sentence
    .replace(/^\s*(?:[-*+]|\d+[.)]|#{1,6})\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The opening words the lens grows from: up to `OPENING_WORDS`, leaving at least two words of the sentence to predict. */
export function openingWords(sentence: string): string {
  const words = plainText(sentence).split(' ').filter(Boolean);
  const n = Math.max(1, Math.min(OPENING_WORDS, words.length - LEFT_TO_PREDICT));
  return words.slice(0, n).join(' ');
}
