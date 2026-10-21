/** "How to read this garden" (spec §10.4): a closed-by-default footer panel, at most 120 words. */
export function HowToRead() {
  return (
    <details id="how-to-read" className="how-to-read">
      <summary>How to read this garden</summary>
      <p>
        Each branch is one possible next token; its thickness (and the number on hover or focus) is the model’s chance
        of choosing it, and “path” is the chance of the whole continuation. Only the few most likely tokens were
        recorded; the dashed “other” stub is the rest. Temperature: below 1 the favourite gains, above 1 the choices
        even out and hidden “other” tokens gain too; 0 always takes the favourite. Tempered numbers are approximate
        (top-k only). “Next … bits” measures how uncertain the following choice is (a lower bound: “other” counts as
        one choice). “Sample a path” rolls a seeded die at each fork. A hollow ring marks where the recording ends.
      </p>
    </details>
  );
}
