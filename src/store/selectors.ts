/**
 * Lightweight cross-cutting selectors with safe fallbacks.
 * Non-invasive helper so other code can import selectors without failing
 * if the game slice shape changes.
 */
import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { selectActiveConfessionalDecision } from './confessionalDecisionSelectors'
import {
  getIncomingSocialModuleAvailability,
  getSocialModuleAvailability,
} from '../social/socialModuleAvailability'

/**
 * True when the game is blocked on a human decision or a mandatory cinematic:
 * - human LOH nominations (nomination_results)
 * - POS use decision (pos_ceremony_results, human POS holder)
 * - POS save target (pos_ceremony_results, human POS holder chose to use it)
 * - replacement nominee picker (pos_ceremony_results)
 * - human live vote (live_vote)
 * - doubleVote Big Eye offer (live_vote — must resolve before vote modal)
 * - voteDeduction Big Eye offer (eviction_results — must resolve before results dismiss)
 * - tie-break (eviction_results)
 * - Final 4 plea / sole-vote / eviction cinematic
 * - Final 3 LOH eviction (awaitingFinal3Eviction)
 * - timed Democracia results reveal before play resumes
 */
export const selectIsWaitingForInput = (state: RootState): boolean => {
  const game = state.game
  const sv = game.specialVeto
  const voxFinalThreeVerdictCanAdvance =
    game.voxPopuli?.status === 'active' &&
    game.voxPopuli.publicVoteContext === 'final3' &&
    game.voteResults == null

  return (
    Boolean(game.replacementNeeded) ||
    Boolean(game.awaitingNominations) ||
    Boolean(game.awaitingPovDecision) ||
    Boolean(game.awaitingPovSaveTarget) ||
    Boolean(game.awaitingMissionImmunityOffer) ||
    Boolean(game.awaitingHumanVote) ||
    Boolean(game.awaitingDoubleVoteOffer) ||
    Boolean(game.awaitingVoteDeductionPrompt) ||
    Boolean(game.awaitingTieBreak) ||
    Boolean(game.awaitingFinal3Eviction) ||
    game.phase === 'final4_eviction' ||
    (Boolean(game.pendingEviction) && !voxFinalThreeVerdictCanAdvance) ||
    Boolean(game.dayStartShock) ||
    Boolean(sv?.awaitingHolderReplacement) ||
    Boolean(sv?.awaitingCoupReplacement1) ||
    Boolean(sv?.awaitingCoupReplacement2) ||
    Boolean(sv?.awaitingVipSecondUseDecision) ||
    Boolean(sv?.awaitingVipSecondSaveTarget) ||
    Boolean(game.democracia?.awaitingHumanVote) ||
    Boolean(game.democracia?.awaitingPublicBreaker) ||
    Boolean(game.democracia?.resultDisplay) ||
    Boolean(game.awaitingCoLohNomination) ||
    Boolean(game.awaitingPosTieBreak) ||
    Boolean(game.twinShock?.promptStage)
  )
}

/** True when the game is not awaiting any human-only decision, so advance() is safe to call. */
export const selectAdvanceEnabled = (state: RootState): boolean => !selectIsWaitingForInput(state)

/**
 * Count of Diary Room entries in the TV feed since game start
 * (used as a badge count on the DR button).
 */
export const selectUnreadDrCount = (state: RootState): number => {
  const feed = state.game?.tvFeed ?? []
  return feed.filter((e) => e.type === 'diary').length
}

/**
 * Count of current nominees on the block.
 * Returns the number of players in nomineeIds (active nominees awaiting eviction).
 */
export const selectCurrentNomineesCount = (state: RootState): number =>
  state.game?.nomineeIds?.length ?? 0

/**
 * @deprecated Use selectCurrentNomineesCount instead.
 * Kept for backward compatibility; returns the same nominee count.
 */
export const selectPendingActionsCount = (state: RootState): number =>
  selectCurrentNomineesCount(state)

/**
 * True when the human/user player exists and is active in the house
 * (status === 'active'). Returns false if they are evicted, in jury,
 * or if no user player is found.
 *
 * Used to gate social interaction UI elements (social panel, inbox button)
 * so evicted players cannot initiate or receive social interactions.
 */
export const selectHumanIsActive = (state: RootState): boolean => {
  const humanPlayer = state.game?.players?.find((p) => p.isUser)
  return humanPlayer?.status === 'active'
}

/** True when the human player is in the house and the current phase permits social modules. */
export const selectHumanCanUseSocialModules = (state: RootState): boolean =>
  getSocialModuleAvailability(state.game).canOpen

/** Incoming messages stay available during vote and result windows. */
export const selectHumanCanUseIncomingSocialModule = (state: RootState): boolean =>
  getIncomingSocialModuleAvailability(state.game).canOpen

export const selectIncomingSocialModuleAvailability = createSelector(
  [(state: RootState) => state.game],
  (game) => getIncomingSocialModuleAvailability(game)
)

/** Debug metadata explaining why a social module can or cannot open. */
export const selectSocialModuleAvailability = createSelector(
  [(state: RootState) => state.game],
  (game) => getSocialModuleAvailability(game)
)

/**
 * Count of actionable Confessional alerts that should be surfaced on the FAB:
 *  - A mission offer is available / currently being offered
 *  - A mission is accepted (Big Eye has an active checklist)
 *  - A mission checklist is complete and reward reveal is pending
 *  - A reward has been claimed and is still eligible for future use
 *  - A doubleVote offer is pending
 *  - A doubleVote is currently active for the live vote
 *  - A voteDeduction prompt is pending
 *  - A required ceremony decision is pending in the Confessional
 */
export const selectConfessionalAlertCount = (state: RootState): number => {
  const humanPlayer = state.game?.players?.find((p) => p.isUser)
  if (humanPlayer?.status === 'evicted' || humanPlayer?.status === 'jury') {
    return 0
  }

  const sm = state.game?.secretMission
  const activeConfessionalDecision = selectActiveConfessionalDecision(state)
  let count = 0

  if (
    sm &&
    (sm.status === 'available' ||
      sm.status === 'offered' ||
      sm.status === 'accepted' ||
      sm.status === 'rewardPending' ||
      (sm.status === 'rewardClaimed' && sm.reward?.eligible))
  ) {
    count += 1
  }

  if (
    state.game?.awaitingDoubleVoteOffer &&
    activeConfessionalDecision?.type !== 'double_vote_offer'
  ) {
    count += 1
  }
  if (state.game?.humanDoubleVoteActive && activeConfessionalDecision?.type !== 'double_vote') {
    count += 1
  }
  if (state.game?.awaitingVoteDeductionPrompt) count += 1
  if (state.game?.twinShock?.promptStage && activeConfessionalDecision?.type !== 'twin_shock') {
    count += 1
  }

  // Ceremony decisions routed to the confessional add a mandatory alert.
  if (activeConfessionalDecision !== null) count += 1

  return count
}

export const selectConfessionalMissionBadge = (state: RootState): boolean =>
  selectConfessionalAlertCount(state) > 0
