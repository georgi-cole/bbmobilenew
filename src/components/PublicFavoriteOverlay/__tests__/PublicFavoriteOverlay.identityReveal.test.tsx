import { configureStore } from '@reduxjs/toolkit'
import { act, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import publicOpinionReducer from '../../../publicOpinion/publicOpinionSlice'
import { createInitialGameState } from '../../../store/gameSlice'
import PublicFavoriteOverlay from '../PublicFavoriteOverlay'

describe('PublicFavoriteOverlay finale identity reveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows anonymous finalists for ten seconds, then reveals them without an interstitial', () => {
    const store = configureStore({
      reducer: {
        publicOpinion: publicOpinionReducer,
      },
    })
    const candidates = createInitialGameState({ seed: 91 }).players.slice(1, 3)

    render(
      <Provider store={store}>
        <PublicFavoriteOverlay
          candidates={candidates}
          seed={91}
          mode="season_winner"
          onComplete={vi.fn()}
        />
      </Provider>
    )

    expect(screen.getAllByText('?').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(candidates[0].name)).toBeNull()
    expect(screen.queryByText(candidates[1].name)).toBeNull()

    act(() => vi.advanceTimersByTime(9500))
    expect(screen.queryByText(candidates[0].name)).toBeNull()

    act(() => vi.advanceTimersByTime(1000))

    expect(screen.getAllByText(candidates[0].name).length).toBeGreaterThan(0)
    expect(screen.getAllByText(candidates[1].name).length).toBeGreaterThan(0)
    expect(screen.queryByText('The masks come off')).toBeNull()

    act(() => vi.advanceTimersByTime(9500))
    expect(screen.getByLabelText('Final reveal in 0:03')).toBeTruthy()
  })
})
