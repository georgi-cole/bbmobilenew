import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
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

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}))

function makeStore() {
  const gameState = gameReducer(undefined, { type: '@@INIT' })
  const humanPlayer = gameState.players.find((player) => player.isUser)

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
        phase: 'loh_results',
        prevHohId: null,
      },
      publicOpinion: {
        ...publicOpinionReducer(undefined, { type: '@@INIT' }),
        profiles: humanPlayer
          ? {
            [humanPlayer.id]: {
              playerId: humanPlayer.id,
              approval: 39,
              previousApproval: 39,
              seasonApprovals: [39],
              completedDirectionCount: 0,
              cumulativePositiveDelta: 0,
            },
          }
          : {},
      },
    },
  })
}

function renderWithStore(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>
    </Provider>,
  )
}

describe('GameScreen disliked approval prompt gating', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T16:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows the disliked approval prompt only once per day across GameScreen remounts', async () => {
    const store = makeStore()
    const firstRender = renderWithStore(store)

    await act(async () => {})

    expect(screen.getByRole('dialog', { name: /your approval is slipping/i })).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /no thanks/i }))
    })

    expect(screen.queryByRole('dialog', { name: /your approval is slipping/i })).toBeNull()

    firstRender.unmount()

    renderWithStore(store)
    await act(async () => {})

    expect(screen.queryByRole('dialog', { name: /your approval is slipping/i })).toBeNull()
  })

  it('allows the disliked approval prompt to show again on a later day', async () => {
    const store = makeStore()
    const firstRender = renderWithStore(store)

    await act(async () => {})

    expect(screen.getByRole('dialog', { name: /your approval is slipping/i })).toBeTruthy()

    firstRender.unmount()

    vi.setSystemTime(new Date('2026-04-18T16:00:00.000Z'))

    renderWithStore(store)
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: /your approval is slipping/i })).toBeTruthy()
  })
})
