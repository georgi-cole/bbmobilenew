import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import gameReducer, {
  activateCupidArrowNow,
  forceNominees,
} from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import RequiredConfessionalDecision from '../RequiredConfessionalDecision'
import { getRequiredConfessionalPresentation } from '../requiredConfessionalPresentation'

describe('RequiredConfessionalDecision during Cupid', () => {
  it('renders two combined pair ballots instead of four individual nominees', () => {
    const store = configureStore({
      reducer: {
        game: gameReducer,
        settings: settingsReducer,
      },
    })

    store.dispatch(activateCupidArrowNow())
    const pairs = store.getState().game.cupidArrow!.pairs.slice(0, 2)
    store.dispatch(forceNominees(pairs.map((pair) => pair.memberIds[0])))

    const game = store.getState().game
    const decision = {
      type: 'eviction_vote' as const,
      week: game.week,
      phase: 'live_vote' as const,
    }

    render(
      <Provider store={store}>
        <RequiredConfessionalDecision
          decision={decision}
          presentation={getRequiredConfessionalPresentation(decision, game)}
          onDecisionCommitted={vi.fn()}
        />
      </Provider>
    )

    const pairChoices = screen.getAllByRole('button', { name: /Pair \d+/i })
    expect(pairChoices).toHaveLength(2)
    for (const pair of pairs) {
      const names = pair.memberIds.map(
        (id) => game.players.find((player) => player.id === id)!.name
      )
      expect(screen.getByRole('button', { name: new RegExp(names.join('.*')) })).toBeInTheDocument()
    }
  })
})
