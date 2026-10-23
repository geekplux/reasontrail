import type { ProviderErrorCode } from '../../shared/llm/types';
import { LIVE_MAX_CALLS } from './cachedProvider';

/** One calm, specific line per failure for the lens and garden; recorded branches always keep working. */
export function providerMessage(code: ProviderErrorCode, retryAfterSec?: number): string {
  switch (code) {
    case 'not_recorded':
      return 'Not in this recording. Choose "Grow live with an open model" to grow this branch.';
    case 'invalid_input':
      return "This text can't be sent to the model as it is. The recorded branches still work.";
    case 'prefix_too_long':
    case 'input_too_large':
      return 'This text is too long to send. Try a shorter sentence.';
    case 'rate_limited':
      return `Growing a little fast. Try again in ${retryAfterSec ?? 60} s.`;
    case 'budget_exhausted':
      return "Live growth has used today's shared budget. Try again tomorrow; the recorded branches still work.";
    case 'session_limit':
      return `This tab has grown its ${LIVE_MAX_CALLS} live branches. Reload the page to grow more.`;
    case 'upstream_error':
      return "The model didn't answer this time. Try again in a moment.";
    case 'unavailable':
      return "Live growth isn't available here (offline, or no Worker behind this site). The recorded branches still work.";
    case 'aborted':
      return 'Stopped.';
  }
}
