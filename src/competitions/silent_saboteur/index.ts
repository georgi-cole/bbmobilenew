/**
 * Silent Saboteur competition — public API re-exports.
 *
 * Consumers should import from here rather than reaching into the feature
 * directory directly.
 */

export {
  default as silentSaboteurReducer,
  initSilentSaboteur,
  advanceIntro,
  selectVictim,
  submitVote,
  advanceReveal,
  startNextRound,
  submitJuryVote,
  advanceWinner,
  markSilentSaboteurOutcomeResolved,
  resetSilentSaboteur,
} from '../../features/silentSaboteur/silentSaboteurSlice';

export type {
  SilentSaboteurState,
  SilentSaboteurPhase,
  SilentSaboteurPrizeType,
  EliminationReason,
  RevealInfo,
} from '../../features/silentSaboteur/silentSaboteurSlice';

export { resolveSilentSaboteurOutcome } from '../../features/silentSaboteur/thunks';
