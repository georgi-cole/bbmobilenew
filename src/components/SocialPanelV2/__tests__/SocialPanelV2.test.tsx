/**
 * Tests for the SocialPanelV2 component.
 *
 * Covers:
 *  1. Does not render when game phase is not a social phase.
 *  2. Renders the modal during social_1 phase with a human player.
 *  3. Renders the modal during social_2 phase with a human player.
 *  4. Displays the human player's energy chip.
 *  5. Shows energy as 0 when no entry exists in energyBank.
 *  6. Renders player roster and action grid placeholders.
 *  7. Renders a disabled Execute button in the footer.
 *  8. Close button hides the modal.
 *  9. Does not render when there is no human player.
 * 10. Modal re-opens when transitioning between social_1 and social_2 after being closed.
 * 11. Execute button enabled when idle action (needsTargets: false) is selected.
 * 12. Execute button disabled when target-requiring action is selected without a player.
 * 13. Execute button enabled when action and a player are both selected.
 * 14. Execute shows success feedback after idle action is performed.
 * 15. Execute shows 'Insufficient resources' feedback when player cannot afford action.
 * 16. After successful execute, action selection is cleared (button returns to disabled).
 * 17. Execute button gains the pulse class immediately after a successful execution.
 * 18. Execute button pulse class is removed after 850 ms.
 * 19. [A11y] Resource chips have aria-live="polite".
 * 20. [A11y] Execute button has aria-busy attribute (false when idle).
 * 21. [A11y] Skip link is rendered inside the dialog.
 * 22. [A11y] Skip link href points to the body section (#sp2-body).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import settingsReducer from '../../../store/settingsSlice'
import gameReducer, { setPhase } from '../../../store/gameSlice'
import socialReducer, {
  setEnergyBankEntry,
  setInfluenceBankEntry,
  openSocialPanel,
} from '../../../social/socialSlice'
import { initManeuvers } from '../../../social/SocialManeuvers'
import SocialPanelV2 from '../SocialPanelV2'
import type { RootState } from '../../../store/store'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore(overrides?: {
  phase?: string
  energyBank?: Record<string, number>
  hasHuman?: boolean
  humanStatus?: RootState['game']['players'][number]['status']
  /** Override status for specific players by id. */
  playerStatusOverrides?: Record<string, RootState['game']['players'][number]['status']>
  lohId?: string | null
  dramaMode?: boolean
  posWinnerId?: string | null
  povSavedId?: string | null
  nomineeIds?: string[]
}) {
  const base = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
  })
  const defaultState = base.getState() as RootState

  // Build the preloaded state by patching the default game state.
  let players =
    overrides?.hasHuman === false
      ? defaultState.game.players.map((p) => ({ ...p, isUser: false }))
      : defaultState.game.players.map((player) =>
          player.isUser && overrides?.humanStatus
            ? { ...player, status: overrides.humanStatus }
            : player
        )

  // Apply per-player status overrides (e.g. set a player to 'loh').
  if (overrides?.playerStatusOverrides) {
    const statusMap = overrides.playerStatusOverrides
    players = players.map((p) => {
      const newStatus = statusMap[p.id]
      return newStatus ? { ...p, status: newStatus } : p
    })
  }

  const preloadedState = {
    game: {
      ...defaultState.game,
      players,
      phase: (overrides?.phase ?? defaultState.game.phase) as RootState['game']['phase'],
      lohId: overrides?.lohId ?? defaultState.game.lohId,
      posWinnerId: overrides?.posWinnerId ?? defaultState.game.posWinnerId,
      povSavedId: overrides?.povSavedId ?? defaultState.game.povSavedId,
      nomineeIds: overrides?.nomineeIds ?? defaultState.game.nomineeIds,
    },
    social: defaultState.social,
    settings: {
      ...defaultState.settings,
      gameUX: { ...defaultState.settings.gameUX, dramaMode: overrides?.dramaMode ?? false },
    },
  }

  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
    preloadedState,
  })

  if (overrides?.energyBank) {
    for (const [id, value] of Object.entries(overrides.energyBank)) {
      store.dispatch(setEnergyBankEntry({ playerId: id, value }))
    }
  }

  return store
}

function renderPanel(store: ReturnType<typeof makeStore>) {
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <SocialPanelV2 />
      </Provider>
    </MemoryRouter>
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SocialPanelV2 – visibility', () => {
  it('does not render when phase is not social', () => {
    const store = makeStore({ phase: 'loh_comp' })
    renderPanel(store)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not render during social_1 unless explicitly opened', () => {
    const store = makeStore({ phase: 'social_1' })
    renderPanel(store)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders during social_1 phase when opened via FAB', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('renders during social_2 phase when opened via FAB', () => {
    const store = makeStore({ phase: 'social_2' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('renders for a nominated human player while still in the house', () => {
    const store = makeStore({ phase: 'social_1', humanStatus: 'nominated' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('does not render when there is no human player', () => {
    const store = makeStore({ phase: 'social_1', hasHuman: false })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('SocialPanelV2 – energy display', () => {
  it('displays the human player energy chip', () => {
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 7 }))
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText(/Energy: 7/)).toBeDefined()
  })

  it('shows energy as 0 when no energyBank entry exists', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText(/Energy: 0/)).toBeDefined()
  })
})

describe('SocialPanelV2 – layout', () => {
  it('renders player roster placeholder', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText('Player roster')).toBeDefined()
  })

  it('renders action grid placeholder', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText('Action grid')).toBeDefined()
  })

  it('renders a disabled Execute button', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders the Recent Activity log above the footer', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByLabelText('Recent Activity log')).toBeDefined()
  })

  it('Recent Activity log is outside the Action grid column', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const actionsColumn = screen.getByLabelText('Action grid')
    const recentLog = screen.getByLabelText('Recent Activity log')
    expect(actionsColumn.contains(recentLog)).toBe(false)
  })
})

describe('SocialPanelV2 – close behaviour', () => {
  it('hides the modal when the close button is clicked', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(screen.getByRole('dialog')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not re-open when the phase transitions after closing (FAB-only open)', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)

    // Close the modal.
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Phase transition should NOT re-open the panel.
    act(() => {
      store.dispatch(setPhase('social_2'))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes and logs the reason when the phase changes to live vote', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)

    expect(screen.getByRole('dialog')).toBeDefined()

    act(() => {
      store.dispatch(setPhase('live_vote'))
    })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.getState().social.panelOpen).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Outgoing social module did not open: Outgoing social actions are blocked during the live_vote phase.'
      ),
      expect.objectContaining({ phase: 'live_vote' })
    )

    warnSpy.mockRestore()
  })
})

// ── Execute flow ───────────────────────────────────────────────────────────

describe('SocialPanelV2 – execute flow', () => {
  let store: ReturnType<typeof makeStore>
  let humanId: string

  beforeEach(() => {
    store = makeStore({ phase: 'social_1' })
    humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)
  })

  it('execute button is enabled when a targetless action (idle) is selected', () => {
    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }))
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('execute button stays disabled when a target-requiring action is selected without a player', () => {
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('group chat requires two people and its cost grows with the group', () => {
    const players = store
      .getState()
      .game.players.filter((p) => !p.isUser)
      .slice(0, 3)
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[0].name, 'i') })[0])
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[1].name, 'i') })[0])
    expect((btn as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Cost:.*2/)).toBeDefined()

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(players[2].name, 'i') })[0])
    expect(screen.getByText(/Cost:.*3/)).toBeDefined()
  })

  it('does not execute any group target when the aggregate price is unaffordable', () => {
    const players = store
      .getState()
      .game.players.filter((p) => !p.isUser)
      .slice(0, 6)
    act(() => store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 3 })))
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    players.forEach((player) => {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    expect(store.getState().social.energyBank[humanId]).toBe(3)
    expect(store.getState().social.sessionLogs).toHaveLength(0)
    expect(screen.getByText(/Nothing was spent/)).toBeDefined()
  }, 60_000)

  it('keeps multi-select active for compatible actions and charges once per selected player', () => {
    const players = store
      .getState()
      .game.players.filter((p) => !p.isUser)
      .slice(0, 3)
    act(() => store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 })))
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))
    players.forEach((player) => {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0])
    })
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    expect(screen.getByText(/Cost:.*3/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    expect(store.getState().social.energyBank[humanId]).toBe(2)
    const logs = store
      .getState()
      .social.sessionLogs.filter((entry) => entry.actionId === 'compliment')
    expect(logs.map((entry) => entry.targetId).sort()).toEqual(
      players.map((player) => player.id).sort()
    )
  })

  it('clears action and player selection after closing and reopening the panel', () => {
    const player = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(player.name, 'i') })[0])
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      false
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))
    act(() => store.dispatch(openSocialPanel()))

    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(screen.getByRole('button', { name: /Compliment/i }).getAttribute('aria-pressed')).toBe(
      'false'
    )
  })

  it('Drama Mode group chat uses plain taps for multi-select and scales its displayed cost', () => {
    cleanup()
    store = makeStore({ phase: 'social_1', dramaMode: true })
    humanId = store.getState().game.players.find((player) => player.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)
    const people = store
      .getState()
      .game.players.filter((player) => !player.isUser)
      .slice(0, 3)
    fireEvent.click(screen.getByRole('button', { name: /Group Chat/i }))

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(people[0].name, 'i') })[0])
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      true
    )

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(people[1].name, 'i') })[0])
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      false
    )
    expect(screen.getByText(/Cost:.*2/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(people[2].name, 'i') })[0])
    expect((screen.getByRole('button', { name: 'Execute' }) as HTMLButtonElement).disabled).toBe(
      false
    )
    expect(screen.getByText(/Cost:.*3/)).toBeInTheDocument()
  })

  it('execute button is enabled when action and a player are both selected', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])

    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('charges energy and records the action only once after two rapid execute taps', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])

    const execute = screen.getByRole('button', { name: 'Execute' })
    fireEvent.click(execute)
    fireEvent.click(execute)

    expect(store.getState().social.energyBank[humanId]).toBe(4)
    expect(
      store.getState().social.sessionLogs.filter((entry) => entry.actionId === 'compliment')
    ).toHaveLength(1)
  })

  it('shows feedback after executing idle action', () => {
    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(screen.getByRole('status')).toBeDefined()
  })

  it('targetless actions ignore previously selected non-user targets when executing', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])

    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const logs = store.getState().social.sessionLogs
    expect(logs.at(-1)?.targetId).toBe(humanId)
  })

  it('shows "Insufficient energy" when player cannot afford the action', () => {
    act(() => {
      store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 0 }))
    })
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    expect(screen.getByRole('status').textContent).toContain('Insufficient resources')
  })

  it('execute button stays enabled after a successful execution (action grid remains stable)', () => {
    // Bug fix regression: after a successful execute the state must NOT be
    // cleared so that (a) the action grid stays visible and (b) no stray
    // preview popup "%" appears because selectedTarget became null while
    // previewActionId was still set.
    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    // After success, action stays selected → button remains enabled
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })

  it('action grid remains visible (cards are rendered) after a successful execution', () => {
    // Regression test: cards must not disappear from the DOM after execute.
    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))
    // The action grid wrapper should still be present
    expect(screen.getByLabelText('Action grid')).toBeDefined()
    // And it must contain at least one action card
    const grid = screen.getByLabelText('Action grid')
    const cards = grid.querySelectorAll('[data-action-id]')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('uses the clicked player as the primary target after a reverse shift selection', () => {
    const players = store.getState().game.players.filter((p) => !p.isUser)
    const firstTarget = players[0]
    const secondTarget = players[1]

    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(secondTarget.name, 'i') })[0])
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(firstTarget.name, 'i') })[0], {
      shiftKey: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const logs = store.getState().social.sessionLogs
    expect(logs.at(-1)?.targetId).toBe(firstTarget.id)
  })
})

// ── Success pulse animation ────────────────────────────────────────────────

describe('SocialPanelV2 – success pulse', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('execute button gains the pulse class immediately after a successful execution', () => {
    vi.useFakeTimers()
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLElement).className).toContain('sp2-footer__execute--pulse')
  })

  it('execute button pulse class is removed after 850 ms', () => {
    vi.useFakeTimers()
    const store = makeStore({ phase: 'social_1' })
    const humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getByRole('button', { name: /Stay Idle/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }))

    act(() => {
      vi.advanceTimersByTime(850)
    })

    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLElement).className).not.toContain('sp2-footer__execute--pulse')
  })
})

// ── Accessibility attributes ───────────────────────────────────────────────

describe('SocialPanelV2 – accessibility', () => {
  it('resource chips have aria-live="polite"', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const energyChip = screen.getByLabelText(/Energy: 0/)
    expect(energyChip.getAttribute('aria-live')).toBe('polite')
    const influenceChip = screen.getByLabelText(/Influence: 0/)
    expect(influenceChip.getAttribute('aria-live')).toBe('polite')
    const infoChip = screen.getByLabelText(/Info: 0/)
    expect(infoChip.getAttribute('aria-live')).toBe('polite')
  })

  it('execute button has aria-busy="false" when idle', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect(btn.getAttribute('aria-busy')).toBe('false')
  })

  it('skip link is rendered in the dialog', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const dialog = screen.getByRole('dialog')
    const skipLink = dialog.querySelector('.sp2-skip-link')
    expect(skipLink).not.toBeNull()
  })

  it('skip link href points to the body section', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    const dialog = screen.getByRole('dialog')
    const skipLink = dialog.querySelector('.sp2-skip-link') as HTMLAnchorElement | null
    expect(skipLink?.getAttribute('href')).toBe('#sp2-body')
  })

  it('body section has id sp2-body for skip link target', () => {
    const store = makeStore({ phase: 'social_1' })
    act(() => {
      store.dispatch(openSocialPanel())
    })
    renderPanel(store)
    expect(document.getElementById('sp2-body')).not.toBeNull()
  })
})

// ── Subject picker ─────────────────────────────────────────────────────────

describe('SocialPanelV2 – subject picker', () => {
  let store: ReturnType<typeof makeStore>
  let humanId: string
  let lohPlayer: RootState['game']['players'][number]

  beforeEach(() => {
    // Create the store first, then derive the LOH player from the same instance
    // to avoid player-id mismatches when the roster is randomised across stores.
    store = makeStore({ phase: 'social_1' })
    const firstNonUser = store.getState().game.players.find((p) => !p.isUser)!
    // Re-create with the LOH override now that we know the correct player id.
    store = makeStore({
      phase: 'social_1',
      playerStatusOverrides: { [firstNonUser.id]: 'loh' },
    })
    humanId = store.getState().game.players.find((p) => p.isUser)!.id
    lohPlayer = store.getState().game.players.find((p) => p.id === firstNonUser.id)!
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)
  })

  it('subject picker is not rendered when no action is selected', () => {
    expect(screen.queryByLabelText('Choose subject')).toBeNull()
  })

  it('subject picker is not rendered for primary-mode actions', () => {
    const nonUserPlayer = store.getState().game.players.find((p) => !p.isUser)!
    fireEvent.click(screen.getByRole('button', { name: /Compliment/i }))
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(nonUserPlayer.name, 'i') })[0])
    expect(screen.queryByLabelText('Choose subject')).toBeNull()
  })

  it('subject picker appears when a primaryPlusSubject action is selected with a target', () => {
    // First select the LOH player, then select Pitch Target action
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    expect(screen.getByLabelText('Choose subject')).toBeDefined()
  })

  it('execute button is disabled for primaryPlusSubject action without a subject', () => {
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    const btn = screen.getByRole('button', { name: 'Execute' })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('execute button is enabled once subject is selected for primaryPlusSubject action', () => {
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    // Pick a subject chip — the chip buttons are inside the subject picker
    const subjectPicker = screen.getByLabelText('Choose subject')
    const subjectChips = subjectPicker.querySelectorAll('[aria-pressed]')
    if (subjectChips.length > 0) {
      fireEvent.click(subjectChips[0])
      const btn = screen.getByRole('button', { name: 'Execute' })
      expect((btn as HTMLButtonElement).disabled).toBe(false)
    } else {
      // If no eligible subjects (e.g. no nominees in test data), verify empty state
      expect(screen.queryByText('No eligible targets')).not.toBeNull()
    }
  })

  it('subject selection is cleared when primary target changes', () => {
    const players = store.getState().game.players.filter((p) => !p.isUser)
    if (players.length < 3) return // need at least 3 non-user players

    // Select LOH player first so pitch_target appears
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(lohPlayer.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Pitch Target/i }))
    const subjectPicker = screen.getByLabelText('Choose subject')
    const subjectChips = subjectPicker.querySelectorAll('[aria-pressed]')
    if (subjectChips.length === 0) return // no candidates, skip

    fireEvent.click(subjectChips[0])
    expect((subjectChips[0] as HTMLElement).getAttribute('aria-pressed')).toBe('true')

    // Switch primary target to another non-LOH player — action should be cleared
    // because the new target doesn't have LOH status, so pitch_target disappears.
    const altTarget = players.find((p) => p.id !== lohPlayer.id)!
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(altTarget.name, 'i') })[0])
    // After switching to a non-LOH target, pitch_target is no longer available
    // and the subject picker should no longer be rendered.
    expect(screen.queryByLabelText('Choose subject')).toBeNull()
  })

  it('counts nominated+pos players as nominee subjects for Ask to Use Safety', () => {
    const basePlayers = store.getState().game.players.filter((p) => !p.isUser)
    if (basePlayers.length < 2) return

    const posHolder = basePlayers[0]
    const nomineeWithPos = basePlayers[1]
    cleanup()
    store = makeStore({
      phase: 'pos_results',
      posWinnerId: posHolder.id,
      nomineeIds: [nomineeWithPos.id],
      playerStatusOverrides: {
        [posHolder.id]: 'pos',
        [nomineeWithPos.id]: 'nominated+pos',
      },
    })
    humanId = store.getState().game.players.find((p) => p.isUser)!.id
    store.dispatch(setEnergyBankEntry({ playerId: humanId, value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: humanId, value: 20 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(posHolder.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Ask to Use Safety/i }))

    const subjectPicker = screen.getByLabelText('Choose subject')
    expect(subjectPicker).toHaveTextContent(nomineeWithPos.name)
  })

  it('lets a nominated user ask the POS holder to use safety on them', () => {
    const basePlayers = store.getState().game.players.filter((p) => !p.isUser)
    const posHolder = basePlayers[0]
    const otherNominee = basePlayers[1]
    cleanup()
    store = makeStore({
      phase: 'pos_results',
      posWinnerId: posHolder.id,
      nomineeIds: [humanId, otherNominee.id],
      humanStatus: 'nominated',
      playerStatusOverrides: {
        [posHolder.id]: 'pos',
        [otherNominee.id]: 'nominated',
      },
    })
    const human = store.getState().game.players.find((p) => p.isUser)!
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 10 }))
    store.dispatch(setInfluenceBankEntry({ playerId: human.id, value: 20 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(posHolder.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Ask to Use Safety/i }))

    const subjectPicker = screen.getByLabelText('Choose subject')
    expect(subjectPicker).toHaveTextContent(human.name)
    expect(subjectPicker).toHaveTextContent(otherNominee.name)
    fireEvent.click(within(subjectPicker).getByRole('button', { name: human.name }))
    expect(screen.getByRole('button', { name: 'Execute' })).toBeEnabled()
  })
})

describe('LOH target question integration', () => {
  afterEach(() => cleanup())

  it('executes while the LOH controls nominations and logs a concrete answer', () => {
    const seedStore = makeStore()
    const loh = seedStore.getState().game.players.find((player) => !player.isUser)!
    const store = makeStore({
      phase: 'social_1',
      lohId: loh.id,
      playerStatusOverrides: { [loh.id]: 'loh' },
      dramaMode: true,
    })
    const human = store.getState().game.players.find((player) => player.isUser)!
    store.dispatch(setEnergyBankEntry({ playerId: human.id, value: 5 }))
    store.dispatch(openSocialPanel())
    initManeuvers(store)
    renderPanel(store)

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(loh.name, 'i') })[0])
    fireEvent.click(screen.getByRole('button', { name: /Ask LOH Target/i }))
    const execute = screen.getByRole('button', { name: 'Execute' })
    expect(execute).toBeEnabled()
    fireEvent.click(execute)

    const recentActivity = screen.getByLabelText('Recent Activity')
    expect(recentActivity).toHaveTextContent(`${loh.name}:`)
    expect(recentActivity).not.toHaveTextContent('You performed')
  })
})
