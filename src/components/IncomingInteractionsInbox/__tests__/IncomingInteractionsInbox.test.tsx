import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import gameReducer, { setPhase } from '../../../store/gameSlice'
import settingsReducer, { setGameUX } from '../../../store/settingsSlice'
import socialReducer, {
  openIncomingInbox,
  pushIncomingInteraction,
  updateRelationship,
  updateSocialMemory,
} from '../../../social/socialSlice'
import { socialMiddleware } from '../../../social/socialMiddleware'
import { hasAllianceBetween } from '../../../social/socialAlliance'
import IncomingInteractionsInbox from '../IncomingInteractionsInbox'

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
  it('uses compact Needs Response, Updates and collapsed History sections', async () => {
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

    expect(screen.getByText('2 to answer · 3 updates')).toBeInTheDocument()

    const needsSection = screen.getByLabelText('Needs Response')
    const needsItems = within(needsSection).getAllByRole('listitem')
    expect(needsItems).toHaveLength(2)
    expect(needsItems[0].textContent).toContain('High soon.')
    expect(needsItems[1].textContent).toContain('High later.')
    expect(within(needsSection).getAllByText('Answer this week')).toHaveLength(1)

    const updatesSection = screen.getByLabelText('Updates')
    const updateItems = within(updatesSection).getAllByRole('listitem')
    expect(updateItems).toHaveLength(3)
    expect(updateItems[0].textContent).toContain('Medium soon.')
    expect(updateItems[1].textContent).toContain('Low later.')
    expect(updateItems[2].textContent).toContain('House update.')

    const readOnlyItem = screen.getByText('House update.').closest('[role="listitem"]')
    expect(readOnlyItem).not.toBeNull()
    expect(within(readOnlyItem as HTMLElement).queryByRole('button')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('History · 1'))
    expect(screen.getByText('Resolved note.')).toBeInTheDocument()

    await waitFor(() => {
      expect(store.getState().social.incomingInteractions.every((entry) => entry.read)).toBe(true)
    })
  })

  it('responds without parroting the selected button as a second explanation', () => {
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
    expect(entry?.outcomeText).toMatch(/unconfirmed/i)
    expect(entry?.outcomeText).not.toMatch(/your choice/i)
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

  it('keeps contextual choices compact with no permanent descriptions beneath them', () => {
    const store = makeStore()
    store.dispatch(setGameUX({ dramaMode: true, dramaModeAdminOverride: true }))
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
        requiresResponse: false,
        resolved: false,
      })
    )

    renderInbox(store)

    expect(document.querySelectorAll('.inbox-action')).toHaveLength(4)
    expect(document.querySelector('.inbox-action small')).toBeNull()
    expect(screen.queryByText(/Sets a clear boundary and damages trust/i)).not.toBeInTheDocument()
  })

  it('stays available during eviction results so reactions are not stranded', () => {
    const store = makeStore()
    store.dispatch(openIncomingInbox())

    renderInbox(store)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => {
      store.dispatch(setPhase('eviction_results'))
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(store.getState().social.incomingInboxOpen).toBe(true)
  })
})
