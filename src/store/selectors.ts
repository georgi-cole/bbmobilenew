/**
 * Lightweight cross-cutting selectors with safe fallbacks.
 * Non-invasive helper so other code can import selectors without failing
 * if the game slice shape changes.
 */
import type { RootState } from './store';

/** True when the game is not awaiting any human-only decision, so advance() is safe to call. */
export const selectAdvanceEnabled = (state: RootState): boolean => {
  const game = state.game;
  return !game.replacementNeeded && !game.awaitingFinal3Eviction;
};

/**
 * True while the game is blocked on a human decision modal
 * (replacement nominee, Final 4 vote, or Final 3 HOH eviction).
 */
export const selectIsWaitingForInput = (state: RootState): boolean => {
  const game = state.game;
  return Boolean(game.replacementNeeded) || Boolean(game.awaitingFinal3Eviction);
};

/**
 * Count of Diary Room entries in the TV feed.
 * Returns the total number of 'diary' type events since game start
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
export const selectPendingActionsCount = (state: RootState): number => {
  return state.game?.nomineeIds?.length ?? 0;
};
