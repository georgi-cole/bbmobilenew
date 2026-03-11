import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../src/store/gameSlice'
import challengeReducer from '../../src/store/challengeSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import settingsReducer from '../../src/store/settingsSlice'
import type { GameState, Player } from '../../src/types'
import GameScreen from '../../src/screens/GameScreen/GameScreen'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}))

function makeStore(overrides: Partial<GameState> = {}) {
  const players: Player[] = [
    { id: 'user', name: 'You', avatar: '🧑', status: 'active', isUser: true },
    { id: 'f1', name: 'Finalist 1', avatar: '👩', status: 'active', isUser: false },
    { id: 'j1', name: 'Juror 1', avatar: '🧑', status: 'jury', isUser: false },
    { id: 'j2', name: 'Juror 2', avatar: '👩', status: 'jury', isUser: false },
    { id: 'j3', name: 'Juror 3', avatar: '🧑', status: 'jury', isUser: false },
  ]

  const base: GameState = {
    season: 1,
    week: 12,
    phase: 'week_end',
    seed: 77,
    hohId: 'user',
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    pendingMinigame: null,
    minigameResult: null,
    twistActive: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    voteResults: null,
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    evictionSplashId: null,
    players,
    tvFeed: [],
    isLive: false,
  }

  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
    },
    preloadedState: { game: { ...base, ...overrides } },
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

describe('Jury phase transition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the jury phase announcement modal at week_end when only two finalists remain', async () => {
    const store = makeStore()
    renderGameScreen(store)
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: /The Jury Phase Begins/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Spy Jury/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tap to dismiss/i })).toBeTruthy()
  })

  it('shows a non-blocking placeholder toast when Spy Jury is tapped', async () => {
    const store = makeStore()
    renderGameScreen(store)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /Spy Jury/i }))
    expect(screen.getByText(/Jury House coming soon/i)).toBeTruthy()
  })

  it('starts cinematic on dismiss and transitions into jury voting automatically', async () => {
    const store = makeStore()
    renderGameScreen(store)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: /Tap to dismiss/i }))
    expect(screen.getByRole('dialog', { name: /Jury phase cinematic intro/i })).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(4600)
    })

    expect(store.getState().game.phase).toBe('jury')
  })
})
