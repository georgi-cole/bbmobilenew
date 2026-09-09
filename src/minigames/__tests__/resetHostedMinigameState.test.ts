import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import majorityRulesReducer, {
  initMajorityRules,
} from '../../features/majorityRules/majorityRulesSlice'
import type { MajorityRulesState } from '../../features/majorityRules/majorityRulesSlice'
import { resetAllHostedMinigameState, resetHostedMinigameState } from '../resetHostedMinigameState'

describe('resetHostedMinigameState', () => {
  it('clears a completed Majority Rules run before the retry mounts', () => {
    const initializedStore = configureStore({
      reducer: { majorityRules: majorityRulesReducer },
    })

    initializedStore.dispatch(
      initMajorityRules({
        participantIds: ['human', 'ai'],
        competitionType: 'LOH',
        seed: 7,
        humanPlayerId: 'human',
      })
    )
    const staleState: MajorityRulesState = {
      ...initializedStore.getState().majorityRules,
      phase: 'complete',
      winnerId: 'ai',
      eliminatedIds: ['human'],
    }
    const testStore = configureStore({
      reducer: { majorityRules: majorityRulesReducer },
      // Reproduce the result retained after "Skip to results".
      preloadedState: {
        majorityRules: staleState,
      },
    })
    expect(testStore.getState().majorityRules.phase).toBe('complete')

    resetHostedMinigameState(testStore.dispatch, 'MajorityRules')

    expect(testStore.getState().majorityRules.phase).toBe('idle')
    expect(testStore.getState().majorityRules.winnerId).toBeNull()
    expect(testStore.getState().majorityRules.eliminatedIds).toEqual([])
  })

  it.each([
    ['ClosestWithoutGoingOver', 'cwgo/resetCwgo'],
    ['HoldTheWall', 'holdTheWall/resetHoldTheWall'],
    ['BiographyBlitz', 'biographyBlitz/resetBiographyBlitz'],
    ['FamousFigures', 'famousFigures/resetFamousFigures'],
    ['SilentSaboteur', 'silentSaboteur/resetSilentSaboteur'],
    ['MajorityRules', 'majorityRules/resetMajorityRules'],
    ['GlassBridge', 'glassBridge/resetGlassBridge'],
    ['BlackjackTournament', 'blackjackTournament/resetBlackjackTournament'],
    ['RiskWheel', 'riskWheel/resetRiskWheel'],
    ['WildcardWestern', 'wildcardWestern/resetWildcardWestern'],
    ['Tetris', 'tetris/resetTetris'],
    ['TiltLabyrinth', 'tiltLabyrinth/resetTiltLabyrinth'],
    ['HouseOfCards', 'houseOfCards/resetHouseOfCards'],
    ['MemoryColors', 'memoryColors/resetMemoryColors'],
  ])('resets the stored state for %s', (gameKey, actionType) => {
    const dispatch = vi.fn()

    resetHostedMinigameState(dispatch, gameKey)

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: actionType }))
  })

  it('clears every feature-owned minigame session when a season is reset', () => {
    const dispatch = vi.fn()

    resetAllHostedMinigameState(dispatch)

    expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual([
      'cwgo/resetCwgo',
      'holdTheWall/resetHoldTheWall',
      'biographyBlitz/resetBiographyBlitz',
      'famousFigures/resetFamousFigures',
      'silentSaboteur/resetSilentSaboteur',
      'majorityRules/resetMajorityRules',
      'glassBridge/resetGlassBridge',
      'blackjackTournament/resetBlackjackTournament',
      'riskWheel/resetRiskWheel',
      'wildcardWestern/resetWildcardWestern',
      'tetris/resetTetris',
      'tiltLabyrinth/resetTiltLabyrinth',
      'houseOfCards/resetHouseOfCards',
      'memoryColors/resetMemoryColors',
    ])
  })
})
