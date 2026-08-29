/** Short establishing beat before the first Tribunal member enters. */
export const FIRST_CLUE_DELAY_MS = 1400
/** Keep each statement up long enough to finish typing and then be read. */
export const clueReadingHoldMs = (phrase = ''): number =>
  Math.min(9000, Math.max(4600, phrase.length * 58 + 2100))
/** Extra hold time after the public juror speaks before starting the season recap. */
export const PUBLIC_VOTE_RECAP_HOLD_MS = 4200
/** Initial suspense delay before the first vote chip appears in revealVotes. */
export const VOTE_REVEAL_INITIAL_DELAY_MS = 800
/** Additional stagger between each subsequent revealed vote chip. */
export const VOTE_REVEAL_STAGGER_MS = 2000
/** Delay before handing off from the final tally to the winner cinematic. */
export const WINNER_CINEMATIC_DELAY_MS = 1500
