import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../src/store/gameSlice'
import profilesReducer from '../../src/store/profilesSlice'
import challengeReducer from '../../src/store/challengeSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import settingsReducer from '../../src/store/settingsSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import GameScreen from '../../src/screens/GameScreen/GameScreen'
import { AVATAR_TILE_LONG_PRESS_DELAY_MS } from '../../src/components/HouseguestGrid/AvatarTile'
import { enrichPlayer } from '../../src/utils/houseguestLookup'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div className="tv-zone" data-testid="tv-zone" />,
}))

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
    },
  })
}

function findProfilePlayer(store: ReturnType<typeof makeStore>) {
  const player = store.getState().game.players.find((candidate) => {
    const enriched = enrichPlayer(candidate)
    return candidate.status === 'active' && enriched.age !== undefined && Boolean(enriched.profession)
  })
  if (!player) throw new Error('Expected at least one active player with profile metadata')
  return { player, enrichedPlayer: enrichPlayer(player) }
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

describe('GameScreen avatar hold preview', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the player dialog on the main game screen while an avatar is held and dismisses it on release', () => {
    vi.useFakeTimers()

    const store = makeStore()
    const { player, enrichedPlayer } = findProfilePlayer(store)

    renderGameScreen(store)

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') })

    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] })

    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS)
    })

    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument()

    fireEvent.touchEnd(tile)

    expect(
      screen.queryByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeNull()
  })
})
