import * as React from 'react'
import { act, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import adsReducer from '../../src/store/adsSlice'
import challengeReducer from '../../src/store/challengeSlice'
import gameReducer from '../../src/store/gameSlice'
import profilesReducer from '../../src/store/profilesSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import GameScreen from '../../src/screens/GameScreen/GameScreen'
import {
  BATTLE_BACK_ANNOUNCEMENT_SEQUENCE,
  buildBattleBackFeedMessage,
} from '../../src/screens/GameScreen/battleBackFlow'
import settingsReducer from '../../src/store/settingsSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/store/confessionalDecisionSelectors', () => ({
  selectActiveConfessionalDecision: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: function TvZoneMock({
    externalAnnouncement,
  }: {
    externalAnnouncement?: { title?: string } | null
  }) {
    return (
      <div data-testid="tv-zone">
        {externalAnnouncement?.title ? (
          <p data-testid="tv-zone-announcement">{externalAnnouncement.title}</p>
        ) : null}
      </div>
    )
  },
}))

function makeStore() {
  const baseState = gameReducer(undefined, { type: '@@INIT' })
  const candidateIds = baseState.players.slice(1, 4).map((player) => player.id)
  const players = baseState.players.map((player) =>
    candidateIds.includes(player.id)
      ? { ...player, status: 'jury' as const }
      : player,
  )

  return configureStore({
    reducer: {
      ads: adsReducer,
      challenge: challengeReducer,
      game: gameReducer,
      profiles: profilesReducer,
      publicOpinion: publicOpinionReducer,
      settings: settingsReducer,
      social: socialReducer,
      ui: uiReducer,
    },
    preloadedState: {
      game: {
        ...baseState,
        players,
        battleBack: {
          used: false,
          active: true,
          competitionActive: false,
          weekDecided: 4,
          candidates: candidateIds,
          winnerId: null,
        },
        twistActive: true,
        tvFeed: [
          {
            id: 'battle-back-major',
            text: '🔥 SHOCK: Back 2 the Game is here! Tribunal members will compete for a chance to return! 🏆',
            type: 'twist',
            timestamp: 1,
            major: 'battle_back',
          },
        ],
      },
    },
  })
}

function renderGameScreen(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>
    </Provider>,
  )
}

describe('GameScreen Back 2 the Game follow-up announcements', () => {
  it('keeps staged follow-ups out of external announcements and adds them to the tv feed on play', async () => {
    const store = makeStore()
    renderGameScreen(store)

    await act(async () => {})

    expect(screen.queryByTestId('tv-zone-announcement')).toBeNull()

    for (const [index, announcement] of BATTLE_BACK_ANNOUNCEMENT_SEQUENCE.entries()) {
      const expectedMessage = buildBattleBackFeedMessage(announcement)
      const existingCount = store
        .getState()
        .game
        .tvFeed.filter((event) => event.text === expectedMessage).length

      act(() => {
        window.dispatchEvent(new CustomEvent('ui:playPressed'))
      })

      const insertedEvents = store.getState().game.tvFeed.filter((event) => event.text === expectedMessage)
      expect(insertedEvents).toHaveLength(existingCount + 1)
      expect(insertedEvents[0]?.type).toBe('game')
      expect(insertedEvents[0]?.major).toBeUndefined()
      expect(store.getState().game.battleBack?.competitionActive).toBe(
        index === BATTLE_BACK_ANNOUNCEMENT_SEQUENCE.length - 1,
      )
      expect(screen.queryByTestId('tv-zone-announcement')).toBeNull()
    }

    expect(store.getState().game.battleBack?.competitionActive).toBe(true)
  })
})
