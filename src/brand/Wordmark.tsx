import { LogoMark } from './LogoMark';

/**
 * The wordmark (DESIGN §4.2): the trail mark, "reason" in IBM Plex Mono 500 and "trail" in Instrument Serif Italic,
 * baseline-aligned with no space (the change of typeface is the join). Announced as one name, "Reasontrail".
 */
export function Wordmark() {
  return (
    <span className="wordmark" role="img" aria-label="Reasontrail">
      <LogoMark />
      <span className="wordmark-text">
        <span className="wordmark-reason">reason</span>
        <span className="wordmark-trail">trail</span>
      </span>
    </span>
  );
}
