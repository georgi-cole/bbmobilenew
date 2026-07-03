import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../src/store/gameSlice'
import challengeReducer from '../../src/store/challengeSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import settingsReducer, { setGameUX } from '../../src/store/settingsSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import GameScreen from '../../src/screens/GameScreen/GameScreen'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: ({ mainLogMaxVisible }: { mainLogMaxVisible?: number }) => (
    <div className="tv-zone" data-log-rows={mainLogMaxVisible ?? 2} data-testid="tv-zone" />
  ),
}))

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
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

describe('GameScreen compact roster balancing', () => {
  it('expands the tv stack for the supported two-row compact mode and requests a taller log feed', () => {
    const store = makeStore()

    store.dispatch(setGameUX({ compactRoster: true, compactRosterLayout: 'two-rows' }))

    const { container } = renderGameScreen(store)

    expect(container.firstElementChild).toHaveClass('game-screen--compact-roster-balance')
    expect(screen.getByTestId('tv-zone')).toHaveAttribute('data-log-rows', '6')
  })

  it('keeps the roster balance active on narrow viewports so the TV log stays visible', () => {
    const store = makeStore()

    store.dispatch(setGameUX({ compactRoster: true, compactRosterLayout: 'small' }))
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('innerHeight', 844)

    const { container } = renderGameScreen(store)

    expect(container.firstElementChild).toHaveClass('game-screen--compact-roster-balance')
    expect(screen.getByTestId('tv-zone')).toHaveAttribute('data-log-rows', '6')
  })
})
