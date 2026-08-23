import * as React from 'react'
import { act, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import adsReducer from '../../src/store/adsSlice'
import challengeReducer from '../../src/store/challengeSlice'
import gameReducer from '../../src/store/gameSlice'
import profilesReducer from '../../src/store/profilesSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import GameScreen from '../../src/screens/GameScreen/GameScreen'
import settingsReducer from '../../src/store/settingsSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/store/confessionalDecisionSelectors', () => ({
  selectActiveConfessionalDecision: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => {
  return {
    default: function TvZoneMock({
      externalAnnouncement,
      onExternalAnnouncementDismiss,
    }: {
      externalAnnouncement?: { title?: string; autoDismissMs?: number | null } | null
      onExternalAnnouncementDismiss?: (() => void) | undefined
    }) {
      React.useEffect(() => {
        if (!externalAnnouncement?.autoDismissMs || !onExternalAnnouncementDismiss) {
          return
        }

        const timer = window.setTimeout(() => {
          onExternalAnnouncementDismiss()
        }, externalAnnouncement.autoDismissMs)

        return () => {
          window.clearTimeout(timer)
        }
      }, [externalAnnouncement, onExternalAnnouncementDismiss])

      return (
        <div data-testid="tv-zone">
          {externalAnnouncement?.title ? (
            <p data-testid="tv-zone-announcement">{externalAnnouncement.title}</p>
          ) : null}
        </div>
      )
    },
  }
})

function makeStore(gameOverrides: Partial<ReturnType<typeof gameReducer>> = {}) {
  const gameState = gameReducer(undefined, { type: '@@INIT' })

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
        ...gameState,
        status: 'active',
        publicModeEnabled: false,
        ...gameOverrides,
      },
    },
  })
}

function renderGameScreen(store: ReturnType<typeof makeStore>) {
  function LocationProbe() {
    const location = useLocation()
    return <output data-testid="location-probe">{location.pathname}</output>
  }

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/game']}>
        <GameScreen />
        <LocationProbe />
      </MemoryRouter>
    </Provider>
  )
}

describe('GameScreen public meter gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('opens the Store without putting a disabled-mode message on the faux TV', async () => {
    const store = makeStore()
    const initialFeed = store.getState().game.tvFeed
    renderGameScreen(store)

    await act(async () => {})

    const publicMeterButton = screen.getByRole('button', { name: 'Public meter' })

    act(() => {
      publicMeterButton.click()
      publicMeterButton.click()
    })

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/store')
    expect(screen.queryByTestId('tv-zone-announcement')).toBeNull()
    expect(store.getState().game.tvFeed).toEqual(initialFeed)
  })

  it('shows the in-house social gating announcement without adding log entries during live vote', async () => {
    const store = makeStore({ phase: 'live_vote' })
    const initialFeed = store.getState().game.tvFeed
    renderGameScreen(store)

    await act(async () => {})

    act(() => {
      screen.getByRole('button', { name: 'Social' }).click()
    })

    expect(screen.getByTestId('tv-zone-announcement')).toHaveTextContent(
      'Everybody is currently waiting to vote or be voted, so no time for chit-chat now.'
    )
    expect(store.getState().game.tvFeed).toEqual(initialFeed)

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByTestId('tv-zone-announcement')).toBeNull()
  })

  it('shows the terminal season-over state instead of out-of-house social actions', async () => {
    const baseGameState = gameReducer(undefined, { type: '@@INIT' })
    const store = makeStore({
      players: baseGameState.players.map((player) =>
        player.isUser ? { ...player, status: 'evicted' } : player
      ),
    })
    const initialFeed = store.getState().game.tvFeed
    renderGameScreen(store)

    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Your season is over' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'You were eliminated before the Tribunal began, so you cannot return to the game or cast a finale vote.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Social' })).toHaveAttribute('aria-disabled', 'true')
    expect(store.getState().game.tvFeed).toEqual(initialFeed)
  })
})
