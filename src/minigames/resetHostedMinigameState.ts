import type { Dispatch, UnknownAction } from '@reduxjs/toolkit'
import { resetCwgo } from '../features/cwgo/cwgoCompetitionSlice'
import { resetHoldTheWall } from '../features/holdTheWall/holdTheWallSlice'
import { resetBiographyBlitz } from '../features/biographyBlitz/biography_blitz_logic'
import { resetFamousFigures } from '../features/famousFigures/famousFiguresSlice'
import { resetSilentSaboteur } from '../features/silentSaboteur/silentSaboteurSlice'
import { resetMajorityRules } from '../features/majorityRules/majorityRulesSlice'
import { resetGlassBridge } from '../features/glassBridge/glassBridgeSlice'
import { resetBlackjackTournament } from '../features/blackjackTournament/blackjackTournamentSlice'
import { resetRiskWheel } from '../features/riskWheel/riskWheelSlice'
import { resetWildcardWestern } from '../features/wildcardWestern/wildcardWesternSlice'
import { resetTetris } from '../features/tetris/tetrisSlice'
import { resetTiltLabyrinth } from '../features/tiltLabyrinth/tiltLabyrinthSlice'
import { resetHouseOfCards } from '../features/houseOfCards/houseOfCardsSlice'
import { resetMemoryColors } from '../features/memoryColors/memoryColorsSlice'

const hostedMinigameResetters = {
  ClosestWithoutGoingOver: resetCwgo,
  HoldTheWall: resetHoldTheWall,
  BiographyBlitz: resetBiographyBlitz,
  FamousFigures: resetFamousFigures,
  SilentSaboteur: resetSilentSaboteur,
  MajorityRules: resetMajorityRules,
  GlassBridge: resetGlassBridge,
  BlackjackTournament: resetBlackjackTournament,
  RiskWheel: resetRiskWheel,
  WildcardWestern: resetWildcardWestern,
  Tetris: resetTetris,
  TiltLabyrinth: resetTiltLabyrinth,
  HouseOfCards: resetHouseOfCards,
  MemoryColors: resetMemoryColors,
} as const

/**
 * Clears feature-owned state before MinigameHost mounts a new attempt.
 *
 * React minigames mount after the host countdown. Without this boundary, a
 * remount can briefly read the prior attempt's completed Redux state and report
 * it again before its own initialization effect runs.
 */
export function resetHostedMinigameState(
  dispatch: Dispatch<UnknownAction>,
  reactComponentKey?: string
) {
  const reset = reactComponentKey
    ? hostedMinigameResetters[reactComponentKey as keyof typeof hostedMinigameResetters]
    : undefined
  if (reset) dispatch(reset())
}

/** Clears every feature-owned minigame session when a whole season is reset. */
export function resetAllHostedMinigameState(dispatch: Dispatch<UnknownAction>) {
  for (const reset of Object.values(hostedMinigameResetters)) {
    dispatch(reset())
  }
}
