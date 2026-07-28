/**
 * Tests for the FloatingActionBar component.
 *
 * Covers:
 *  1. Social button badge shows human player's energy value from energyBank.
 *  2. Badge is absent when there is no human player.
 *  3. Flash CSS class is added to the social button when energy changes.
 *  4. Flash CSS class is removed after the animation interval.
 *  5. ARIA label on social button includes energy value.
 *  6. FAB button order reflects the redesigned layout.
 *  7. Social actions badge remains visible on the inbox-style button.
 *  8. Public Meter and Diary Room buttons navigate to their routes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import type { ComponentProps } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import gameReducer, { advance, hydrateGame, triggerSecretMission } from '../../../store/gameSlice'
import socialReducer, {
  setEnergyBankEntry,
  applyEnergyDelta,
  pushIncomingInteraction,
} from '../../../social/socialSlice'
import profilesReducer from '../../../store/profilesSlice'
import challengeReducer from '../../../store/challengeSlice'
import publicOpinionReducer, { addDirection } from '../../../publicOpinion/publicOpinionSlice'
import FloatingActionBar from '../FloatingActionBar'
import { resolveBalancedDockBottom } from '../floatingActionBarLayout'
import type { RootState } from '../../../store/store'
import type { PublicDirection } from '../../../publicOpinion/types'
import { createSecretMissionState } from '../../../bb/secretMission'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(hasHuman = true, gameOverrides: Partial<RootState['game']> = {}) {
  const base = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      publicOpinion: publicOpinionReducer,
    },
  })
  const defaultState = base.getState() as RootState
  const players = hasHuman
    ? defaultState.game.players
    : defaultState.game.players.map((p) => ({ ...p, isUser: false }))

  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: { ...defaultState.game, players, ...gameOverrides },
      social: defaultState.social,
      profiles: defaultState.profiles,
      challenge: defaultState.challenge,
      publicOpinion: defaultState.publicOpinion,
    },
  })
}

function makeDirection(
  playerId: string,
  overrides: Partial<PublicDirection> = {}
): PublicDirection {
  return {
    id: `dir-${playerId}`,
    type: 'win_competition',
    playerId,
    description: 'Win the next competition!',
    status: 'active',
    createdWeek: 1,
    expiresAtWeek: 2,
    approvalDelta: 5,
    ...overrides,
  }
}

function makeAiSafetyCeremonyStore(seed = 1244317494) {
  const initial = makeStore().getState().game
  const [, loh, safetyHolder, otherNominee] = initial.players
  const players = initial.players.map((player) => {
    if (player.id === loh.id) return { ...player, isUser: false, status: 'loh' as const }
    if (player.id === safetyHolder.id) {
      return { ...player, isUser: false, status: 'nominated+pos' as const }
    }
    if (player.id === otherNominee.id) {
      return { ...player, isUser: false, status: 'nominated' as const }
    }
    return { ...player, status: 'active' as const }
  })

  return makeStore(true, {
    phase: 'pos_ceremony',
    seed,
    lohId: loh.id,
    posWinnerId: safetyHolder.id,
    nomineeIds: [safetyHolder.id, otherNominee.id],
    players,
    povSavedId: null,
    povProtectedIds: [],
    aiReplacementStep: 0,
    aiReplacementWaiting: false,
    pendingMinigame: null,
    tvFeed: [],
  })
}

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderFAB(
  store: ReturnType<typeof makeStore>,
  initialEntry = '/game',
  props: Partial<ComponentProps<typeof FloatingActionBar>> = {}
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <FloatingActionBar {...props} />
        <LocationDisplay />
      </Provider>
    </MemoryRouter>
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('FloatingActionBar – responsive placement', () => {
  it('centers the dock between the content above it and navbar', () => {
    expect(
      resolveBalancedDockBottom({
        gameBottom: 800,
        lowerBoundary: 800,
        contentBottom: 600,
        dockHeight: 80,
        minimumGap: 8,
      })
    ).toBe(60)
  })

  it('accounts for mode-specific content appended below the roster', () => {
    expect(
      resolveBalancedDockBottom({
        gameBottom: 800,
        lowerBoundary: 800,
        contentBottom: 660,
        dockHeight: 80,
        minimumGap: 8,
      })
    ).toBe(30)
  })
})

describe('FloatingActionBar – social energy badge', () => {
  it('shows a badge with the human player energy value', () => {
    const store = makeStore()
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 8 }))
    })
    renderFAB(store)
    // Badge text should reflect energy value
    expect(screen.getByText('8')).toBeDefined()
  })

  it('keeps the social button unlabeled by count when human energy is 0', () => {
    const store = makeStore()
    renderFAB(store)
    const socialButton = screen.getByRole('button', { name: 'Social' })
    expect(socialButton).toBeDefined()
    expect(socialButton).toHaveAttribute('aria-label', 'Social')
    expect(socialButton.querySelector('.dock-hit-area__badge')).toBeNull()
  })

  it('clamps the social energy badge to the supported cap', () => {
    const store = makeStore()
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 150 }))
    })
    renderFAB(store)
    expect(screen.getByText('30')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Social (30)' })).toBeDefined()
  })

  it('ARIA label on social button includes energy value', () => {
    const store = makeStore()
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    })
    renderFAB(store)
    expect(screen.getByRole('button', { name: 'Social (5)' })).toBeDefined()
  })
})

describe('FloatingActionBar – social module availability', () => {
  it('opens outgoing and incoming social modules for nominated humans outside blocked phases', () => {
    const store = makeStore(true, {
      phase: 'social_1',
      players: makeStore()
        .getState()
        .game.players.map((player) =>
          player.isUser ? { ...player, status: 'nominated' } : player
        ),
    })
    renderFAB(store)

    act(() => {
      screen.getByRole('button', { name: 'Social' }).click()
      screen.getByRole('button', { name: 'Incoming requests' }).click()
    })

    expect(store.getState().social.panelOpen).toBe(true)
    expect(store.getState().social.incomingInboxOpen).toBe(true)
  })

  it('blocks outgoing actions but keeps incoming vote pitches accessible during live vote', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = makeStore(true, { phase: 'live_vote' })
    renderFAB(store)

    act(() => {
      screen.getByRole('button', { name: 'Social' }).click()
      screen.getByRole('button', { name: 'Incoming requests' }).click()
    })

    expect(store.getState().social.panelOpen).toBe(false)
    expect(store.getState().social.incomingInboxOpen).toBe(true)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Outgoing social module did not open: Outgoing social actions are blocked during the live_vote phase.'
      ),
      expect.objectContaining({ phase: 'live_vote', moduleKind: 'outgoing' })
    )

    warnSpy.mockRestore()
  })
})

describe('FloatingActionBar – social button flash animation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds flash class to social button when energy changes', () => {
    const store = makeStore()
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    renderFAB(store)

    // Change energy — should trigger flash (deferred via setTimeout(0))
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }))
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    const btn = screen.getByRole('button', { name: 'Social (10)' })
    expect(btn.className).toContain('dock-node--flash')
  })

  it('removes flash class after 600ms', () => {
    const store = makeStore()
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    renderFAB(store)

    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }))
    })

    act(() => {
      vi.advanceTimersByTime(600)
    })

    const btn = screen.getByRole('button', { name: 'Social (10)' })
    expect(btn.className).not.toContain('dock-node--flash')
  })

  it('adds flash class when energy changes via applyEnergyDelta', () => {
    const store = makeStore()
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    })
    act(() => {
      vi.advanceTimersByTime(0)
    }) // flush deferred flash-on from initial change
    renderFAB(store)

    act(() => {
      store.dispatch(applyEnergyDelta({ playerId: humanId, delta: -2 }))
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    const btn = screen.getByRole('button', { name: 'Social (3)' })
    expect(btn.className).toContain('dock-node--flash')
  })
})

describe('FloatingActionBar – inbox badge', () => {
  it('shows pending incoming interaction count on the inbox button', () => {
    const store = makeStore()
    act(() => {
      store.dispatch(
        pushIncomingInteraction({
          id: 'incoming-1',
          fromId: 'p2',
          type: 'compliment',
          text: 'Great move.',
          createdAt: 10,
          createdWeek: 1,
          expiresAtWeek: 1,
          read: false,
          requiresResponse: true,
          resolved: false,
        })
      )
    })
    renderFAB(store)
    expect(screen.getByText('1')).toBeDefined()
    expect(screen.getByRole('button', { name: /incoming requests \(1\)/i })).toBeDefined()
  })
})

describe('FloatingActionBar – layout', () => {
  it('renders the redesigned button order', () => {
    const store = makeStore()
    renderFAB(store)

    const toolbar = screen.getByRole('toolbar', { name: /game actions/i })
    const labels = Array.from(toolbar.querySelectorAll('button')).map((button) =>
      button.getAttribute('aria-label')
    )
    expect(labels).toEqual([
      'Social',
      'Incoming requests',
      'Advance to next phase',
      'Public meter',
      'Confessional',
    ])
  })

  it('no save button is present in the FAB', () => {
    const store = makeStore()
    renderFAB(store)
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('accepts the primary advance action only once for the current phase', () => {
    const store = makeStore(true, { phase: 'week_end', week: 1 })
    renderFAB(store)

    const playButton = screen.getByRole('button', { name: 'Advance to next phase' })
    act(() => {
      playButton.click()
      playButton.click()
    })

    expect(store.getState().game.week).toBe(2)
    expect(store.getState().game.phase).toBe('week_start')
  })

  it('continues every deterministic AI Safety result step once without locking the phase', () => {
    const store = makeAiSafetyCeremonyStore()
    const safetyHolderId = store.getState().game.posWinnerId!
    renderFAB(store)

    const activateTwice = () => {
      const playButton = screen.getByRole('button', { name: 'Advance to next phase' })
      act(() => {
        playButton.click()
        playButton.click()
      })
    }

    activateTwice()
    let game = store.getState().game
    expect(game.phase).toBe('pos_ceremony_results')
    expect(game.aiReplacementStep).toBe(1)
    expect(game.povSavedId).toBe(safetyHolderId)
    expect(game.pendingMinigame).toBeNull()
    expect(game.tvFeed.filter((event) => event.text.includes('Power of Safety on'))).toHaveLength(1)

    activateTwice()
    game = store.getState().game
    expect(game.phase).toBe('pos_ceremony_results')
    expect(game.aiReplacementStep).toBe(2)
    expect(
      game.tvFeed.filter((event) => event.text.includes('is selecting a backup nominee'))
    ).toHaveLength(1)

    activateTwice()
    game = store.getState().game
    expect(game.phase).toBe('pos_ceremony_results')
    expect(game.aiReplacementStep).toBe(0)
    expect(game.nomineeIds).toHaveLength(2)
    expect(
      game.tvFeed.filter(
        (event) => event.text.includes('named') && event.text.includes('backup nominee')
      )
    ).toHaveLength(1)

    activateTwice()
    game = store.getState().game
    expect(game.phase).toBe('social_2')
    expect(game.pendingMinigame).toBeNull()
    expect(game.tvFeed.filter((event) => event.text.includes('Power of Safety on'))).toHaveLength(1)

    const replay = makeAiSafetyCeremonyStore()
    replay.dispatch(advance())
    replay.dispatch(advance())
    replay.dispatch(advance())
    replay.dispatch(advance())
    const replayedGame = replay.getState().game

    expect({
      phase: replayedGame.phase,
      seed: replayedGame.seed,
      nomineeIds: replayedGame.nomineeIds,
      povSavedId: replayedGame.povSavedId,
    }).toEqual({
      phase: game.phase,
      seed: game.seed,
      nomineeIds: game.nomineeIds,
      povSavedId: game.povSavedId,
    })
  })
})

describe('FloatingActionBar – navigation buttons', () => {
  it('navigates to public meter when the Public meter button is clicked', async () => {
    const store = makeStore(true, { publicModeEnabled: true })
    renderFAB(store, '/game')
    act(() => {
      screen.getByRole('button', { name: 'Public meter' }).click()
    })
    expect(screen.getByTestId('location').textContent).toBe('/public-meter')
  })

  it('shows an active public request badge and opens requests tab when the user has active requests', async () => {
    const store = makeStore(true, { publicModeEnabled: true })
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    act(() => {
      store.dispatch(addDirection(makeDirection(humanId)))
      store.dispatch(addDirection(makeDirection(humanId, { id: 'dir-2' })))
    })
    renderFAB(store, '/game')

    expect(screen.queryByText('2')).not.toBeNull()
    act(() => {
      screen.getByRole('button', { name: /public meter \(2\)/i }).click()
    })
    expect(screen.getByTestId('location').textContent).toBe('/public-meter?tab=requests')
  })

  it('does not navigate to public meter when public mode is disabled', async () => {
    const onPublicMeterBlocked = vi.fn()
    const store = makeStore(true, { publicModeEnabled: false })
    renderFAB(store, '/game', { onPublicMeterBlocked })

    act(() => {
      screen.getByRole('button', { name: 'Public meter' }).click()
    })

    expect(screen.getByTestId('location').textContent).toBe('/game')
    expect(onPublicMeterBlocked).toHaveBeenCalledTimes(1)
  })

  it('navigates to diary room when the Confessional button is clicked', async () => {
    const store = makeStore()
    renderFAB(store, '/game')
    act(() => {
      screen.getByRole('button', { name: 'Confessional' }).click()
    })
    expect(screen.getByTestId('location').textContent).toBe('/diary-room')
  })

  it('shows a numbered confessional badge when alerts are waiting', () => {
    const store = makeStore(true, {
      secretMission: createSecretMissionState(1),
      awaitingDoubleVoteOffer: true,
    })
    renderFAB(store, '/game')

    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Confessional (2)' })).toBeDefined()
  })

  it('hides confessional alerts once the human player is evicted', () => {
    const store = makeStore(true, {
      secretMission: createSecretMissionState(1),
      awaitingDoubleVoteOffer: true,
    })
    const game = store.getState().game
    store.dispatch(
      hydrateGame({
        ...game,
        players: game.players.map((player) =>
          player.isUser ? { ...player, status: 'evicted' } : player
        ),
      })
    )

    renderFAB(store, '/game')

    expect(screen.queryByText('2')).toBeNull()
    expect(screen.getByRole('button', { name: 'Confessional' })).toBeDefined()
  })

  it('lets the player press Play once before locking it for a pending confessional decision', () => {
    const store = makeStore(true, {
      phase: 'live_vote',
      awaitingHumanVote: true,
    })
    renderFAB(store, '/game')

    const playButton = screen.getByRole('button', { name: 'Advance to next phase' })
    expect(playButton).not.toBeDisabled()

    act(() => {
      playButton.click()
    })

    expect(store.getState().game.phase).toBe('live_vote')
    expect(playButton).toBeDisabled()
  })
})

describe('FloatingActionBar – confessional alert animation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 250,
      y: 780,
      width: 44,
      height: 44,
      top: 780,
      left: 250,
      bottom: 824,
      right: 294,
      toJSON: () => ({}),
    } as DOMRect)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('animates the confessional button when a new alert arrives', () => {
    const store = makeStore()
    renderFAB(store)

    act(() => {
      store.dispatch(triggerSecretMission(1))
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    const button = screen.getByRole('button', { name: 'Confessional (1)' })
    expect(button.className).toContain('dock-hit-area--confessional-flash')

    act(() => {
      vi.advanceTimersByTime(1800)
    })
    expect(button.className).not.toContain('dock-hit-area--confessional-flash')
  })

  it('restarts the confessional animation when the alert count increases again mid-flash', () => {
    const store = makeStore()
    renderFAB(store)

    act(() => {
      store.dispatch(triggerSecretMission(1))
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    const button = screen.getByRole('button', { name: 'Confessional (1)' })
    expect(button.className).toContain('dock-hit-area--confessional-flash')
    const firstFlashClassName = button.className

    act(() => {
      vi.advanceTimersByTime(900)
    })
    act(() => {
      store.dispatch(
        hydrateGame({
          ...store.getState().game,
          awaitingDoubleVoteOffer: true,
        })
      )
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    const retriggeredButton = screen.getByRole('button', { name: 'Confessional (2)' })
    expect(retriggeredButton.className).toContain('dock-hit-area--confessional-flash')
    expect(retriggeredButton.className).not.toBe(firstFlashClassName)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole('button', { name: 'Confessional (2)' }).className).toContain(
      'dock-hit-area--confessional-flash'
    )

    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(screen.getByRole('button', { name: 'Confessional (2)' }).className).not.toContain(
      'dock-hit-area--confessional-flash'
    )
  })

  it('keeps the confessional icon pulsing after play is pressed until the confessional is opened', () => {
    const store = makeStore(true, {
      phase: 'live_vote',
      awaitingHumanVote: true,
    })
    renderFAB(store, '/game')

    act(() => {
      screen.getByRole('button', { name: 'Advance to next phase' }).click()
    })

    const confessionalButton = screen.getByRole('button', { name: 'Confessional (1)' })
    expect(confessionalButton.className).toContain('dock-hit-area--confessional-persistent')
    expect(confessionalButton.className).not.toContain('dock-hit-area--confessional-flash')
    expect(screen.getByTestId('confessional-spotlight')).toBeDefined()

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('button', { name: 'Confessional (1)' }).className).toContain(
      'dock-hit-area--confessional-persistent'
    )
    expect(screen.queryByTestId('confessional-spotlight')).toBeNull()
    expect(store.getState().game.hasSeenConfessionalSpotlight).toBe(true)

    act(() => {
      confessionalButton.click()
    })

    expect(screen.getByTestId('location').textContent).toBe('/diary-room')
    expect(screen.getByRole('button', { name: 'Confessional (1)' }).className).not.toContain(
      'dock-hit-area--confessional-persistent'
    )
  })

  it('marks the spotlight as seen immediately when the player clicks Confessional during the tutorial', () => {
    const store = makeStore(true, {
      phase: 'live_vote',
      awaitingHumanVote: true,
    })
    renderFAB(store, '/game')

    act(() => {
      screen.getByRole('button', { name: 'Advance to next phase' }).click()
    })

    expect(screen.getByTestId('confessional-spotlight')).toBeDefined()

    act(() => {
      screen.getByRole('button', { name: 'Confessional (1)' }).click()
    })

    expect(screen.queryByTestId('confessional-spotlight')).toBeNull()
    expect(store.getState().game.hasSeenConfessionalSpotlight).toBe(true)
    expect(screen.getByTestId('location').textContent).toBe('/diary-room')
  })

  it('does not replay the spotlight after it has already been seen in the same season', () => {
    const store = makeStore(true, {
      phase: 'live_vote',
      awaitingHumanVote: true,
      hasSeenConfessionalSpotlight: true,
    })
    renderFAB(store, '/game')

    act(() => {
      screen.getByRole('button', { name: 'Advance to next phase' }).click()
    })

    expect(screen.queryByTestId('confessional-spotlight')).toBeNull()
  })
})
