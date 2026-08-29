import { configureStore } from '@reduxjs/toolkit'
import { render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'
import gameReducer from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer, {
  openIncomingInbox,
  pushIncomingInteraction,
} from '../../../social/socialSlice'
import IncomingInteractionsInbox from '../IncomingInteractionsInbox'

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      settings: settingsReducer,
    },
  })
}

describe('IncomingInteractionsInbox encoding and icons', () => {
  it('renders stable SVG icons and no mojibake text', () => {
    const store = makeStore()
    const existingHousemate = store.getState().game.players.find((player) => !player.isUser)

    if (!existingHousemate) {
      throw new Error('Expected a non-user player for test setup.')
    }

    store.dispatch(openIncomingInbox())
    store.dispatch(
      pushIncomingInteraction({
        id: 'missing-player-deal',
        fromId: 'missing-player',
        type: 'deal_offer',
        text: 'A deal is waiting for your answer.',
        createdAt: 200,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: false,
        requiresResponse: true,
        resolved: false,
      })
    )
    store.dispatch(
      pushIncomingInteraction({
        id: 'resolved-custom-label',
        fromId: existingHousemate.id,
        type: 'compliment',
        text: 'That landed well.',
        createdAt: 100,
        createdWeek: 1,
        expiresAtWeek: 1,
        read: true,
        requiresResponse: true,
        resolved: true,
        resolvedAt: 100,
        resolvedWeek: 1,
        resolvedLabel: 'Accepted',
      })
    )

    const { container } = render(
      <Provider store={store}>
        <IncomingInteractionsInbox />
      </Provider>
    )

    expect(screen.getByText('Incoming Interactions')).toBeInTheDocument()
    expect(screen.getByTestId('incoming-icon-inbox')).toBeInTheDocument()
    expect(screen.getByTestId('incoming-icon-deal_offer')).toBeInTheDocument()
    expect(screen.getByTestId('incoming-icon-person')).toBeInTheDocument()
    expect(screen.getByText('Resolved · Accepted')).toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: 'Close inbox' })
    expect(within(closeButton).getByText('↩')).toBeInTheDocument()

    expect(container.textContent).not.toMatch(/ðŸ|âœ|âš|ï¸|�/u)
  })
})
