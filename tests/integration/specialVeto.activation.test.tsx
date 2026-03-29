import { describe, it, expect, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../src/store/gameSlice'
import challengeReducer from '../../src/store/challengeSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import settingsReducer, { DEFAULT_SETTINGS } from '../../src/store/settingsSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import type { GameState, Player } from '../../src/types'
import GameScreen from '../../src/screens/GameScreen/GameScreen'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}))

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? 'user' : `p${i}`,
    name: i === 0 ? 'You' : `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }))
}

function makePlayersWithEvictions(aliveCount: number, evictedCount: number): Player[] {
  const evicted: Player[] = Array.from({ length: evictedCount }, (_, i) => ({
    id: `evicted${i}`,
    name: `Evicted ${i}`,
    avatar: '🧑',
    status: 'evicted' as const,
    isUser: false,
  }))
  const alive = makePlayers(aliveCount)
  return [...evicted, ...alive]
}

function makeStore(gameOverrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 3,
    phase: 'pov_results',
    seed: 42,
    hohId: 'p1',
    prevHohId: null,
    nomineeIds: ['p2', 'p3'],
    povWinnerId: 'p4',
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    aiReplacementStep: 0,
    aiReplacementWaiting: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    players: makePlayersWithEvictions(8, 5),
    tvFeed: [],
    isLive: false,
    twistActive: false,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    specialVeto: {
      seasonUsed: false,
      activeType: null,
      activatedWeek: null,
      vipUseStage: 0,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    },
  }

  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: {
        ...DEFAULT_SETTINGS,
        sim: {
          ...DEFAULT_SETTINGS.sim,
          enableTwists: true,
          specialSafetyChance: 100,
        },
      },
    },
  })
}

describe('GameScreen special veto activation wiring', () => {
  it('dispatches tryActivateSpecialVeto when entering pov_results', async () => {
    const store = makeStore()

    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameScreen />
        </MemoryRouter>
      </Provider>,
    )

    await act(async () => {})

    const state = store.getState().game
    expect(state.specialVeto?.seasonUsed).toBe(true)
    expect(state.specialVeto?.activeType).not.toBeNull()
    expect(state.twistActive).toBe(true)
    expect(['vip_veto', 'diamond_pov', 'coup_detat', 'spotlight_veto']).toContain(state.tvFeed[0]?.major)
  })
})
