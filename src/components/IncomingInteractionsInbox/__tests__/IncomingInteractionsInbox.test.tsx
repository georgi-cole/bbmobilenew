import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { setPhase } from '../../../store/gameSlice'
import settingsReducer, { setGameUX } from '../../../store/settingsSlice'
import socialReducer, {
  openIncomingInbox,
  pushIncomingInteraction,
  updateRelationship,
  updateSocialMemory,
} from '../../../social/socialSlice'
import IncomingInteractionsInbox from '../IncomingInteractionsInbox'
import { socialMiddleware } from '../../../social/socialMiddleware'
import { hasAllianceBetween } from '../../../social/socialAlliance'

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
  })
}

function makeStoreWithSocialMiddleware() {
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  })
}

function renderInbox(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <IncomingInteractionsInbox />
    </Provider>
  )
}

function getNonUserPlayer(store: ReturnType<typeof makeStore>) {
  const player = store.getState().game.players.find((candidate) => !candidate.isUser)
  if (!player) throw new Error('Expected a non-user player for test setup.')
  return player
}

describe('IncomingInteractionsInbox', () => {
  it('creates a store with a non-user player', () => {
    const store = makeStore()
    expect(getNonUserPlayer(store).isUser).not.toBe(true)
  })

  it('sorts decisions, conversations, updates and weekly history while reading visible items', async () => {
    const store = makeStore()
    store.dispatch(openIncomingInbox())
    const otherId = getNonUserPlayer(store).id
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-low-later',
        fromId: otherId,
        type: 'compliment',
        text: 'Low later.',
        createdAt: 120,
        createdWeek: 1,
        expiresAtWeek: 2,
        read: false,
        requiresResponse: false,
        resolved: false,
      })
    )
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-medium-soon',
        fromId: otherId,
        type: 'gossip',
        text: 'Medium soon.',
        createdAt: 140,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: false,
        resolved: false,
      })
    )
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-high-later',
        fromId: otherId,
        type: 'deal_offer',
        text: 'High later.',
        createdAt: 160,
        createdWeek: 1,
        expiresAtWeek: 2,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-high-soon',
        fromId: otherId,
        type: 'nomination_plea',
        text: 'High soon.',
        createdAt: 180,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-readonly',
        fromId: otherId,
        type: 'compliment',
        text: 'House update.',
        payload: { responsePolicy: 'readOnly' },
        createdAt: 185,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: false,
        resolved: false,
      })
    )
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-resolved',
        fromId: otherId,
        type: 'compliment',
        text: 'Resolved note.',
        createdAt: 190,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: true,
        requiresResponse: true,
        resolved: true,
        resolvedAt: 190,
        resolvedWeek: 1,
        resolvedWith: 'positive',
      })
    )

    renderInbox(store)

    expect(screen.getByText('2 decisions • 2 urgent • 2 conversations')).toBeInTheDocument()

    const needsSection = screen.getByLabelText('Needs Decision')
    const needsItems = within(needsSection).getAllByRole('listitem')
    expect(needsItems).toHaveLength(2)
    expect(needsItems[0].textContent).toContain('High soon.')
    expect(needsItems[1].textContent).toContain('High later.')
    expect(within(needsSection).getByText('Urgent this week')).toBeInTheDocument()

    const conversationsSection = screen.getByLabelText('Conversations')
    const conversationItems = within(conversationsSection).getAllByRole('listitem')
    expect(conversationItems).toHaveLength(2)
    expect(conversationItems[0].textContent).toContain('Medium soon.')
    expect(conversationItems[1].textContent).toContain('Low later.')
    expect(
      within(conversationsSection).getByText('Optional · closes this week')
    ).toBeInTheDocument()

    const updatesSection = screen.getByLabelText('House Updates')
    expect(within(updatesSection).getAllByRole('listitem')).toHaveLength(1)
    expect(within(updatesSection).queryByRole('button')).not.toBeInTheDocument()

    const resolvedSection = screen.getByLabelText('Resolved This Week')
    const resolvedItems = within(resolvedSection).getAllByRole('listitem')
    expect(resolvedItems).toHaveLength(1)
    expect(resolvedItems[0].textContent).toContain('Resolved note.')
    expect(resolvedItems[0].className).toContain('inbox-item--resolved')

    await waitFor(() => {
      const state = store.getState().social.incomingInteractions
      expect(state.every((entry) => entry.read)).toBe(true)
    })
  })

  it('responds to an interaction from the inbox', () => {
    const store = makeStore()
    store.dispatch(openIncomingInbox())
    const otherPlayer = getNonUserPlayer(store)
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-3',
        fromId: otherPlayer.id,
        type: 'warning',
        text: 'Careful this week.',
        createdAt: 300,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )

    renderInbox(store)
    fireEvent.click(document.querySelector('[data-response-type="positive"]')!)

    const entry = store
      .getState()
      .social.incomingInteractions.find((interaction) => interaction.id === 'interaction-3')
    expect(entry?.resolved).toBe(true)
    expect(entry?.resolvedWith).toBe('positive')
    expect(store.getState().game.tvFeed[0]?.text).toMatch(/encouraged/i)
  })

  it('forms a reciprocal alliance once without premium currency in Normal Mode', () => {
    const store = makeStoreWithSocialMiddleware()
    store.dispatch(openIncomingInbox())
    const humanId = store.getState().game.players.find((player) => player.isUser)!.id
    const otherPlayer = getNonUserPlayer(store)
    store.dispatch(
      pushIncomingInteraction({
        id: 'alliance-proposal',
        fromId: otherPlayer.id,
        type: 'alliance_proposal',
        text: 'Want to lock this in?',
        createdAt: 320,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )

    renderInbox(store)
    fireEvent.click(document.querySelector('[data-response-type="accept"]')!)

    const socialState = store.getState().social
    expect(socialState.relationships[otherPlayer.id]?.[humanId]?.tags).toContain('alliance')
    expect(socialState.relationships[humanId]?.[otherPlayer.id]?.tags).toContain('alliance')
    expect(hasAllianceBetween(socialState.relationships, humanId, otherPlayer.id)).toBe(true)
    expect(socialState.energyBank[humanId]).toBe(2)
    expect(socialState.energyBank[otherPlayer.id]).toBe(2)
    expect(socialState.influenceBank[humanId] ?? 0).toBe(0)
    expect(socialState.influenceBank[otherPlayer.id] ?? 0).toBe(0)
  })

  it('renders contextual responses, tone labels, and visible choice consequences', () => {
    const store = makeStore()
    store.dispatch(setGameUX({ dramaMode: true }))
    store.dispatch(openIncomingInbox())
    const otherId = getNonUserPlayer(store).id
    store.dispatch(
      updateRelationship({
        source: otherId,
        target: 'user',
        delta: -60,
      })
    )
    store.dispatch(
      updateSocialMemory({
        actorId: otherId,
        targetId: 'user',
        deltas: { resentment: 8 },
      })
    )
    store.dispatch(
      pushIncomingInteraction({
        id: 'interaction-tone',
        fromId: otherId,
        type: 'snide_remark',
        text: 'Tone check.',
        createdAt: 420,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )

    renderInbox(store)

    expect(document.querySelector('[data-response-type="negative"]')).toBeInTheDocument()
    expect(screen.getByText(/Bitter/)).toBeInTheDocument()
    expect(screen.getByText(/Sets a clear boundary and damages trust/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Context' })).not.toBeInTheDocument()
    expect(screen.queryByText('Why now')).not.toBeInTheDocument()
    expect(screen.queryByText('What it means')).not.toBeInTheDocument()
  })

  it('closes and logs the reason when the phase changes to eviction results', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = makeStore()
    store.dispatch(openIncomingInbox())

    renderInbox(store)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => {
      store.dispatch(setPhase('eviction_results'))
    })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.getState().social.incomingInboxOpen).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Incoming social module did not open: Social modules are blocked during the eviction_results phase.'
      ),
      expect.objectContaining({ phase: 'eviction_results' })
    )

    warnSpy.mockRestore()
  })
})
