// Every threshold of the deterministic structuring rules, in one place.

/** A lane shows at most this many top-level episodes; more are grouped. */
export const MAX_TOP_EPISODES = 12;
/** An episode holds at most this many steps. */
export const MAX_EPISODE_STEPS = 40;
/** From this many steps on, an episode also splits where the touched file changes. */
export const FILE_SPLIT_STEPS = 30;
/** A change of dominant tool kind starts a new episode once the current one has this many steps... */
export const MIN_EPISODE_STEPS = 3;
/** ...and the next this-many tool calls are mostly of the new kind. */
export const KIND_WINDOW = 3;

/** Consecutive failed tool results that make an error streak. */
export const ERROR_STREAK_MIN = 2;
/** A retry is the same call again within this many lane steps after a failure. */
export const RETRY_WINDOW = 10;
/** Edits to one file within one episode that count as churn. */
export const CHURN_MIN_EDITS = 4;
