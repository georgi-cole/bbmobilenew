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

  it('shows only the current top three and represents their share in one segmented bar', () => {
    const store = configureStore({
      reducer: {
        publicOpinion: publicOpinionReducer,
      },
    })
    const candidates = createInitialGameState({ seed: 92 }).players.slice(0, 7)
    const { container } = render(
      <Provider store={store}>
        <PublicFavoriteOverlay
          candidates={candidates}
          seed={92}
          mode="favorite"
          eliminationIntervalMs={120_000}
          onComplete={vi.fn()}
        />
      </Provider>
    )

    act(() => screen.getByRole('button', { name: /^Lock / }).click())

    expect(container.querySelectorAll('.pf-overlay__top-three-player')).toHaveLength(3)
    expect(container.querySelectorAll('.pf-overlay__rank-card')).toHaveLength(0)
    expect(
      container.querySelectorAll('.pf-overlay__share-track .pf-overlay__share-segment')
    ).toHaveLength(3)
    expect(container.querySelector('.pf-overlay__share-segment--field')).toBeNull()
    expect(
      screen.getByRole('img', {
        name: /Segments show relative shares within the visible top three/,
      })
    ).toBeTruthy()
  })

  it('centers the last two players while the audience vote stays live', () => {
    const store = configureStore({
      reducer: {
        publicOpinion: publicOpinionReducer,
      },
    })
    const candidates = createInitialGameState({ seed: 93 }).players.slice(0, 3)
    const { container } = render(
      <Provider store={store}>
        <PublicFavoriteOverlay
          candidates={candidates}
          seed={93}
          mode="favorite"
          onComplete={vi.fn()}
        />
      </Provider>
    )

    expect(screen.getByText('Who takes the audience?')).toBeTruthy()
    expect(screen.queryByText('Live audience vote')).toBeNull()
    act(() => screen.getByRole('button', { name: /^Lock / }).click())

    act(() => screen.getByRole('button', { name: /Fast forward public favorite vote/i }).click())
    act(() => vi.advanceTimersByTime(900))

    expect(screen.getByText('Final 2')).toBeTruthy()
    expect(container.querySelector('.pf-overlay__top-three-candidates--final-two')).toBeTruthy()
    expect(container.querySelectorAll('.pf-overlay__top-three-player')).toHaveLength(2)
    expect(
      container.querySelectorAll('.pf-overlay__share-track .pf-overlay__share-segment')
    ).toHaveLength(2)
    expect(screen.queryByText(/leaves the count/i)).toBeNull()

    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText(/leaves the count/i)).toBeNull()
  })

  it('requires one forecast before opening the vote and carries the pick into the player rail', () => {
    const store = configureStore({
      reducer: {
        publicOpinion: publicOpinionReducer,
      },
    })
    const candidates = createInitialGameState({ seed: 94 }).players.slice(0, 4)
    const { container } = render(
      <Provider store={store}>
        <PublicFavoriteOverlay
          candidates={candidates}
          seed={94}
          mode="favorite"
          eliminationIntervalMs={120_000}
          onComplete={vi.fn()}
        />
      </Provider>
    )

    act(() => screen.getByText(candidates[2].name).closest('button')?.click())
    act(() => screen.getByRole('button', { name: /^Lock / }).click())

    const markedPlayer = container.querySelector('.pf-overlay__audience-rail-player.is-forecast')
    expect(markedPlayer).toHaveTextContent(candidates[2].name)
  })

  it('offers every eligible housemate in the forecast, including casts of 16 or more', () => {
    const store = configureStore({
      reducer: {
        publicOpinion: publicOpinionReducer,
      },
    })
    const candidates = createInitialGameState({ seed: 95 }).players
    const { container } = render(
      <Provider store={store}>
        <PublicFavoriteOverlay
          candidates={candidates}
          seed={95}
          mode="favorite"
          onComplete={vi.fn()}
        />
      </Provider>
    )

    expect(candidates.length).toBeGreaterThanOrEqual(16)
    expect(
      screen.getByLabelText(`Choose your forecast from ${candidates.length} eligible housemates`)
    ).toBeTruthy()
    expect(container.querySelectorAll('.pf-overlay__forecast-cast-player')).toHaveLength(
      candidates.length
    )
  })
})
