/** "How to read this garden" (spec §10.4): a closed-by-default footer panel, at most 120 words. */
export function HowToRead() {
  return (
    <details id="how-to-read" className="how-to-read">
      <summary>How to read this garden</summary>
      <p>
        Each branch is one possible next token. Its thickness, and the number shown on hover or focus, is the model’s
        chance of choosing it; “path” is the chance of the whole continuation. Only the top 5 tokens were recorded, so
        the dashed “other” stub lumps everything else together. Temperature reshapes those chances: below 1 the
        favourite gains, above 1 the choices even out, 0 always takes the favourite. Tempered numbers are therefore
        approximate (top-k only). “Next … bits” measures how uncertain the following
        choice is. “Sample a path” rolls a seeded die at each fork. Recorded means the answers were saved in advance; a
        hollow ring marks where the recording ends.
      </p>
    </details>
  );
}
