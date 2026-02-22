/**
 * Lightweight cross-cutting selectors with safe fallbacks.
 * Non-invasive helper so other code can import selectors without failing
 * if the game slice shape changes.
 */
import type { RootState } from './store';

/**
 * True when the game is blocked on a human decision modal:
 * - human HOH nominations (nomination_results)
 * - POV use decision (pov_ceremony_results, human POV holder)
 * - POV save target (pov_ceremony_results, human POV holder chose to use it)
 * - replacement nominee picker (pov_ceremony_results)
 * - human live vote (live_vote)
 * - tie-break (eviction_results)
 * - Final 4 solo eviction vote (human is POV holder)
 * - Final 3 HOH eviction (awaitingFinal3Eviction)
 */
export const selectIsWaitingForInput = (state: RootState): boolean => {
  const game = state.game;

  // Final 4: human POV holder must choose via TvDecisionModal, not advance()
  const isFinal4HumanPovDecision =
    game?.phase === 'final4_eviction' &&
    Boolean(game?.povWinnerId) &&
    game.players.some((p) => p.id === game.povWinnerId && p.isUser);

  return (
    Boolean(game.replacementNeeded) ||
    Boolean(game.awaitingNominations) ||
    Boolean(game.awaitingPovDecision) ||
    Boolean(game.awaitingPovSaveTarget) ||
    Boolean(game.awaitingHumanVote) ||
    Boolean(game.awaitingTieBreak) ||
    Boolean(game.awaitingFinal3Eviction) ||
    isFinal4HumanPovDecision
  );
};

/** True when the game is not awaiting any human-only decision, so advance() is safe to call. */
export const selectAdvanceEnabled = (state: RootState): boolean =>
  !selectIsWaitingForInput(state);

/**
 * Count of Diary Room entries in the TV feed since game start
 * (used as a badge count on the DR button).
 */
export const selectUnreadDrCount = (state: RootState): number => {
  const feed = state.game?.tvFeed ?? [];
  return feed.filter((e) => e.type === 'diary').length;
};

/**
 * Count of current nominees on the block.
 * Returns the number of players in nomineeIds (active nominees awaiting eviction).
 */
export const selectCurrentNomineesCount = (state: RootState): number =>
  state.game?.nomineeIds?.length ?? 0;

/**
 * @deprecated Use selectCurrentNomineesCount instead.
 * Kept for backward compatibility; returns the same nominee count.
 */
export const selectPendingActionsCount = (state: RootState): number =>
  selectCurrentNomineesCount(state);

