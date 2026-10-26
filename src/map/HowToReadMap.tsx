// How to read a map (`?view=how`; v7 §7): one figure (the default sample's tree drawn by the real renderer, with the
// legend) and two short paragraphs, the tree and the list. Shape carries every meaning; colour only repeats it.
import { defaultSessionGraph } from '../sessions/samples';
import { HeroTree } from '../site/HeroTree';

/** The figure's box: the left column at 1440, with text from this width. */
export const HOW_TREE = { height: 340, labelsFrom: 720 } as const;

export function HowToReadMap() {
  return (
    <section className="how-to-read-map" aria-labelledby="how-h">
      <h1 id="how-h" className="page-title" tabIndex={-1}>How to read a map</h1>
      <div className="how-cols">
        <HeroTree id="how-tree" g={defaultSessionGraph} onHover={() => {}} size={HOW_TREE} />
        <div className="how-text">
          <p>
            The session grows left to right from the root. The trunk is the main agent and each subagent is a limb. Every
            branch is an episode, ending in its kind&apos;s glyph (task, explore, change, verify or answer) and its number. Twigs are tool calls: a leaf for a command
            that ran, a bud for a file read, a faint twig for thinking, an orange twig with ✕ for a failure. A part&apos;s
            width grows with the tool calls still ahead on it.
          </p>
          <p>
            The list under the tree has the same episodes in order. The main rail is the main agent; a subagent forks off
            on its own rail and merges back with its verdict. Open an episode to list its steps, and select a step for its
            command, output and source line. ↑ ↓ move, → opens, ← closes, Home and End jump, Enter selects, Esc closes.
          </p>
        </div>
      </div>
    </section>
  );
}
