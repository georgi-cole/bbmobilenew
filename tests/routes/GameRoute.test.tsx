import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import GameRoute from '../../src/routes/GameRoute'

vi.mock('../../src/screens/GameScreen/GameScreen', () => ({
  default: () => <div data-testid="game-screen">Game screen</div>,
}))

type RouteState = {
  game: {
    mode: 'classic'
    status: 'active' | 'idle'
    seasonFinale: { phase: string } | null
  }
  finale: {
    isActive: boolean
  }
}

function renderGameRoute(state: RouteState) {
  const store = configureStore({ reducer: () => state })

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/game']}>
        <Routes>
          <Route path="/" element={<div data-testid="home-screen">Home screen</div>} />
          <Route path="/game" element={<GameRoute />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

const inactiveState: RouteState = {
  game: {
    mode: 'classic',
    status: 'idle',
    seasonFinale: null,
  },
  finale: {
    isActive: false,
  },
}

describe('GameRoute finale reachability', () => {
  it('redirects an inactive ordinary season to Home', async () => {
    renderGameRoute(inactiveState)

    expect(await screen.findByTestId('home-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('game-screen')).not.toBeInTheDocument()
  })

  it('keeps Tribunal voting reachable after regular gameplay closes', () => {
    renderGameRoute({
      ...inactiveState,
      finale: { isActive: true },
    })

    expect(screen.getByTestId('game-screen')).toBeInTheDocument()
  })

  it('keeps the public-favorite finale flow reachable after the Tribunal closes', () => {
    renderGameRoute({
      ...inactiveState,
      game: {
        ...inactiveState.game,
        seasonFinale: { phase: 'publicFavoriteFlow' },
      },
    })

    expect(screen.getByTestId('game-screen')).toBeInTheDocument()
  })

  it('redirects after the finale is fully complete', async () => {
    renderGameRoute({
      ...inactiveState,
      finale: { isActive: true },
      game: {
        ...inactiveState.game,
        seasonFinale: { phase: 'seasonComplete' },
      },
    })

    expect(await screen.findByTestId('home-screen')).toBeInTheDocument()
  })
})
