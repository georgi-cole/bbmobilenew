import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import SeasonFinaleOverlay from '../src/components/SeasonFinale/SeasonFinaleOverlay'
import gameReducer from '../src/store/gameSlice'
import settingsReducer from '../src/store/settingsSlice'
import uiReducer from '../src/store/uiSlice'

vi.mock('../src/components/FinalLightsOutSequence/FinalLightsOutSequence', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      Finish lights transition
    </button>
  ),
}))

vi.mock('../src/screens/Credits/Credits', () => ({
  default: ({ autoPlay, onComplete }: { autoPlay?: boolean; onComplete?: () => void }) => (
    <button type="button" data-autoplay={String(autoPlay)} onClick={onComplete}>
      Finish credits
    </button>
  ),
}))

function makeStore() {
  const baseGame = gameReducer(undefined, { type: '@@INIT' })
  const winnerId = baseGame.players[0]?.id ?? 'winner'

  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, ui: uiReducer },
    preloadedState: {
      game: {
        ...baseGame,
        players: baseGame.players.map((player, index) => ({
          ...player,
          isWinner: player.id === winnerId,
          finalRank: index === 0 ? 1 : player.finalRank,
        })),
        seasonFinale: {
          phase: 'lightsOffTransition',
          winnerId,
          interviewIndex: 0,
          goodbyeIndex: 0,
          isChatOpen: false,
          isLightsOffAnimating: true,
          publicFavoriteEnabled: false,
        },
      },
      settings: settingsReducer(undefined, { type: '@@INIT' }),
      ui: uiReducer(undefined, { type: '@@INIT' }),
    },
  })
}

describe('SeasonFinaleOverlay credits handoff', () => {
  it('autoplays credits after lights out and only completes the season after credits finish', async () => {
    const store = makeStore()

    render(
      <Provider store={store}>
        <MemoryRouter>
          <SeasonFinaleOverlay />
        </MemoryRouter>
      </Provider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Finish lights transition' }))

    const creditsButton = screen.getByRole('button', { name: 'Finish credits' })
    expect(creditsButton).toHaveAttribute('data-autoplay', 'true')
    expect(store.getState().game.seasonFinale?.phase).toBe('lightsOffTransition')

    fireEvent.click(creditsButton)

    await waitFor(() => {
      expect(store.getState().game.seasonFinale?.phase).toBe('seasonComplete')
    })
  })
})
