import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DebugPanel from '../DebugPanel'
import gameReducer from '../../../store/gameSlice'
import socialReducer from '../../../social/socialSlice'

vi.mock('../FinaleControls.debug', () => ({
  default: () => null,
}))

vi.mock('../MinigameDebugControls', () => ({
  default: () => null,
}))

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
    },
  })
}

describe('DebugPanel forced shock controls', () => {
  it('includes Back 2 the Game in the force shock dropdown and queues it', async () => {
    const user = userEvent.setup()
    const store = makeStore()

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game?debug=1']}>
          <DebugPanel />
        </MemoryRouter>
      </Provider>,
    )

    const forceShockSelect = screen.getByRole('combobox', { name: 'Force Shock' })

    expect(screen.getByRole('option', { name: 'Back 2 the Game' })).toBeDefined()

    await user.selectOptions(forceShockSelect, 'battleBack')
    await user.click(screen.getByRole('button', { name: 'Queue' }))

    expect(store.getState().game.pendingForcedShock?.type).toBe('battleBack')
  })
})
