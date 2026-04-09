import { act, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import adsReducer, { recordLastCompLastPlace } from '../../src/store/adsSlice'
import challengeReducer from '../../src/store/challengeSlice'
import gameReducer from '../../src/store/gameSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import GameScreen from '../../src/screens/GameScreen/GameScreen'
import settingsReducer from '../../src/store/settingsSlice'
import uiReducer from '../../src/store/uiSlice'
import socialReducer from '../../src/social/socialSlice'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}))

function makeStore() {
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
        ...gameReducer(undefined, { type: '@@INIT' }),
        phase: 'loh_results',
      },
    },
  })
}

describe('GameScreen competition retry prompt removal', () => {
  it('does not show the legacy standalone retry popup and clears the transient marker', async () => {
    const store = makeStore()
    store.dispatch(recordLastCompLastPlace('loh'))

    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameScreen />
        </MemoryRouter>
      </Provider>,
    )

    await act(async () => {})

    expect(screen.queryByText('Want to Retry?')).toBeNull()
    expect(screen.queryByText('Watch a short ad to re-enter the competition and try again.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Watch Ad to Retry' })).toBeNull()
    expect(store.getState().ads.lastCompLastPlaceType).toBeNull()
  })
})
