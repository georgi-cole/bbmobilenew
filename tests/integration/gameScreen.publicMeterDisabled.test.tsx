import { act, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import adsReducer from '../../src/store/adsSlice'
import challengeReducer from '../../src/store/challengeSlice'
import gameReducer from '../../src/store/gameSlice'
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

vi.mock('../../src/components/ui/TvZone', () => ({
  default: ({ externalAnnouncement }: { externalAnnouncement?: { title?: string } | null }) => {
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
  const gameState = gameReducer(undefined, { type: '@@INIT' })

  return configureStore({
    reducer: {
      ads: adsReducer,
      challenge: challengeReducer,
      game: gameReducer,
      publicOpinion: publicOpinionReducer,
      settings: settingsReducer,
      social: socialReducer,
      ui: uiReducer,
    },
    preloadedState: {
      game: {
        ...gameState,
        publicModeEnabled: false,
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

describe('GameScreen public meter gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the Home Hub prompt on the main TV without adding log entries when public mode is disabled', async () => {
    const store = makeStore()
    const initialFeed = store.getState().game.tvFeed
    renderGameScreen(store)

    await act(async () => {})

    const publicMeterButton = screen.getByRole('button', { name: 'Public meter' })

    act(() => {
      publicMeterButton.click()
      publicMeterButton.click()
    })

    expect(screen.getByTestId('tv-zone-announcement')).toHaveTextContent(
      'If you want to activate public mode, go to the store in the home hub.',
    )
    expect(store.getState().game.tvFeed).toEqual(initialFeed)
  })
})
