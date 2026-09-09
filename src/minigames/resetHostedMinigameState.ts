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
  switch (reactComponentKey) {
    case 'ClosestWithoutGoingOver':
      dispatch(resetCwgo())
      break
    case 'HoldTheWall':
      dispatch(resetHoldTheWall())
      break
    case 'BiographyBlitz':
      dispatch(resetBiographyBlitz())
      break
    case 'FamousFigures':
      dispatch(resetFamousFigures())
      break
    case 'SilentSaboteur':
      dispatch(resetSilentSaboteur())
      break
    case 'MajorityRules':
      dispatch(resetMajorityRules())
      break
    case 'GlassBridge':
      dispatch(resetGlassBridge())
      break
    case 'BlackjackTournament':
      dispatch(resetBlackjackTournament())
      break
    case 'RiskWheel':
      dispatch(resetRiskWheel())
      break
    case 'WildcardWestern':
      dispatch(resetWildcardWestern())
      break
    case 'Tetris':
      dispatch(resetTetris())
      break
    case 'TiltLabyrinth':
      dispatch(resetTiltLabyrinth())
      break
    case 'HouseOfCards':
      dispatch(resetHouseOfCards())
      break
    case 'MemoryColors':
      dispatch(resetMemoryColors())
      break
  }
}
