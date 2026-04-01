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
 * - Final 4 solo eviction vote (awaitingPovDecision set after plea sequence)
 * - Final 3 HOH eviction (awaitingFinal3Eviction)
 */
export const selectIsWaitingForInput = (state: RootState): boolean => {
  const game = state.game;
  const sv = game.specialVeto;

  return (
    Boolean(game.replacementNeeded) ||
    Boolean(game.awaitingNominations) ||
    Boolean(game.awaitingPovDecision) ||
    Boolean(game.awaitingPovSaveTarget) ||
    Boolean(game.awaitingHumanVote) ||
    Boolean(game.awaitingTieBreak) ||
    Boolean(game.awaitingFinal3Eviction) ||
    Boolean(sv?.awaitingHolderReplacement) ||
    Boolean(sv?.awaitingCoupReplacement1) ||
    Boolean(sv?.awaitingCoupReplacement2) ||
    Boolean(sv?.awaitingVipSecondUseDecision) ||
    Boolean(sv?.awaitingVipSecondSaveTarget)
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

/**
 * True when the human/user player exists and is active in the house
 * (status === 'active'). Returns false if they are evicted, in jury,
 * or if no user player is found.
 *
 * Used to gate social interaction UI elements (social panel, inbox button)
 * so evicted players cannot initiate or receive social interactions.
 */
export const selectHumanIsActive = (state: RootState): boolean => {
  const humanPlayer = state.game?.players?.find((p) => p.isUser);
  return humanPlayer?.status === 'active';
};


/**
 * Returns true when the Confessional FAB should show the Turkish blue
 * secret-mission badge (PR 1 + PR 2 conditions):
 *  - A mission offer is available / currently being offered
 *  - A mission is accepted (Big Eye has an active prompt)
 *  - A mission checklist is complete and reward reveal is pending
 *  - A reward has been claimed and is still eligible for future use (PR 2)
 */
export const selectConfessionalMissionBadge = (state: RootState): boolean => {
  const sm = state.game?.secretMission;
  if (!sm) return false;
  if (
    sm.status === 'available' ||
    sm.status === 'offered' ||
    sm.status === 'accepted' ||
    sm.status === 'rewardPending'
  ) return true;
  // Show badge for a claimed (non-empty, non-expired, non-consumed) reward so
  // the player is reminded they have a power waiting (prep for PR 3 activation).
  if (sm.status === 'rewardClaimed' && sm.reward?.eligible) return true;
  return false;
};
