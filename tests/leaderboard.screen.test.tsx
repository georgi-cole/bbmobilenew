import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router'
import Leaderboard from '../src/screens/Leaderboard/Leaderboard'
import gameReducer from '../src/store/gameSlice'

function makeStore(overrides: Record<string, unknown> = {}) {
  const initialGameState = gameReducer(undefined, { type: '@@INIT' })
  return configureStore({
    reducer: {
      game: gameReducer,
    },
    preloadedState: {
      game: {
        ...initialGameState,
        players: [
          {
            id: 'user',
            name: 'You',
            avatar: '🧑',
            isUser: true,
            status: 'active',
            stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
          },
        ],
        week: 1,
        phase: 'week_start',
        ...overrides,
      },
    },
  })
}

function renderHallOfFame(store = makeStore()) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/leaderboard']}>
        <Routes>
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

describe('Hall of Fame screen', () => {
  it('uses the back button to return to the previous route', async () => {
    const store = makeStore()

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/game', '/leaderboard']} initialIndex={1}>
          <Routes>
            <Route path="/game" element={<div>Game route</div>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    )

    fireEvent.click(screen.getByRole('button', { name: /go back/i }))

    await waitFor(() => {
      expect(screen.getByText('Game route')).toBeInTheDocument()
    })
  })

  it('replaces scoring leaderboards with Season History and Achievements only', () => {
    renderHallOfFame()

    expect(screen.getByRole('heading', { name: /Hall of Fame/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Season History' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Achievements' })).toBeInTheDocument()
    expect(screen.queryByText('This Season')).toBeNull()
    expect(screen.queryByText('All-Time')).toBeNull()
    expect(screen.queryByText(/\d+ pts/)).toBeNull()
  })

  it('shows a compact season archive with winner, player finish, mode, and duration', () => {
    const store = makeStore({
      seasonArchives: [
        {
          seasonIndex: 4,
          seasonId: 'season-4',
          voxPopuliActivated: true,
          twinShockConsumed: true,
          playerSummaries: [
            {
              playerId: 'mimi',
              displayName: 'Mimi',
              finalPlacement: 1,
              daysAlive: 31,
            },
            {
              playerId: 'nova',
              displayName: 'Nova',
              finalPlacement: 2,
              daysAlive: 31,
            },
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 3,
              daysAlive: 29,
              timesNominated: 2,
              titlesWon: ['GHOST_MODE'],
            },
          ],
        },
      ],
    })

    renderHallOfFame(store)

    expect(screen.getByText('Season 4')).toBeInTheDocument()
    expect(screen.getByText('🏆 Mimi Tanaka')).toBeInTheDocument()
    expect(screen.getByText('You: 3rd')).toBeInTheDocument()
    expect(screen.getByText('Vox Populi · Twin Shock · 31 days')).toBeInTheDocument()
  })

  it('expands a season to show runner-up, Public Favorite, finish and season titles', () => {
    const store = makeStore({
      seasonArchives: [
        {
          seasonIndex: 7,
          seasonId: 'season-7',
          cupidArrowActivated: true,
          playerSummaries: [
            { playerId: 'nova', displayName: 'Nova', finalPlacement: 1, weeksAlive: 10 },
            { playerId: 'finn', displayName: 'Finn', finalPlacement: 2, weeksAlive: 10 },
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 4,
              weeksAlive: 8,
              wonPublicFavorite: true,
              titlesWon: ['VIBE_CURATOR'],
            },
          ],
        },
      ],
    })

    renderHallOfFame(store)
    fireEvent.click(screen.getByRole('button', { name: /Season 7/i }))

    expect(screen.getByText('Runner-up')).toBeInTheDocument()
    expect(screen.getByText('Finn')).toBeInTheDocument()
    expect(screen.getByText('Public Favorite')).toBeInTheDocument()
    expect(screen.getByText('4th')).toBeInTheDocument()
    expect(screen.getByText('VIBE CURATOR')).toBeInTheDocument()
  })

  it('renders the existing career achievement summary inside the Achievements tab', () => {
    const store = makeStore({
      seasonArchives: [
        {
          seasonIndex: 2,
          seasonId: 'season-2',
          rewardsEarned: ['egg-one'],
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 1,
              lohWins: 2,
              posWins: 1,
              timesNominated: 3,
              wonPublicFavorite: true,
              weeksAlive: 10,
            },
          ],
        },
      ],
    })

    renderHallOfFame(store)
    fireEvent.click(screen.getByRole('tab', { name: 'Achievements' }))

    expect(screen.getByText("You's trophy case")).toBeInTheDocument()
    expect(screen.getByText('Season wins')).toBeInTheDocument()
    expect(screen.getByText('Competitive / Wins')).toBeInTheDocument()
    expect(screen.getByText(/Season champ/)).toBeInTheDocument()
    expect(screen.getByText(/Public favorite/)).toBeInTheDocument()
  })
})
