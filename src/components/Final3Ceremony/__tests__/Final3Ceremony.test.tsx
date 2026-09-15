import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Final3Ceremony from '../Final3Ceremony'
import gameReducer, { createInitialGameState } from '../../../store/gameSlice'

function renderPleaCeremony(onPlayAvailabilityChange = vi.fn()) {
  const initial = createInitialGameState({ seed: 111 })
  const loh = initial.players.find((player) => player.isUser)
  const nominees = initial.players.filter((player) => !player.isUser).slice(0, 2)
  if (!loh || nominees.length !== 2)
    throw new Error('Expected a Final Power holder and two nominees')

  const players = initial.players.map((player) => {
    if (player.id === loh.id) return { ...player, status: 'active' as const }
    if (player.id === nominees[0].id) {
      return {
        ...player,
        status: 'active' as const,
        stats: {
          ...player.stats,
          lohWins: 2,
          posWins: player.stats?.posWins ?? 0,
          timesNominated: player.stats?.timesNominated ?? 0,
        },
      }
    }
    if (player.id === nominees[1].id) return { ...player, status: 'active' as const }
    return { ...player, status: 'jury' as const }
  })
  const game = {
    ...initial,
    phase: 'final3_decision' as const,
    lohId: loh.id,
    nomineeIds: nominees.map((player) => player.id),
    awaitingFinal3Plea: true,
    awaitingFinal3Eviction: false,
    players,
    finalThree: {
      mode: 'classic' as const,
      stage: 'ceremony' as const,
      openingSeen: true,
      blockRevealSeen: true,
      spectatorFinalPowerRevealSeen: true,
      participantIds: [loh.id, ...nominees.map((player) => player.id)],
      part1: null,
      part2: null,
      part3: null,
      finalPowerHolderId: loh.id,
      nomineeIds: nominees.map((player) => player.id),
      evicteeId: null,
    },
  }
  const store = configureStore({ reducer: { game: gameReducer }, preloadedState: { game } })

  render(
    <Provider store={store}>
      <Final3Ceremony onPlayAvailabilityChange={onPlayAvailabilityChange} />
    </Provider>
  )
  return { loh, nominees, onPlayAvailabilityChange }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Final3Ceremony plea dialogue', () => {
  it('always gives the holder and both nominees a dialogue with Final 4-style chat controls', () => {
    vi.useFakeTimers()
    const onPlayAvailabilityChange = vi.fn()
    const { loh, nominees } = renderPleaCeremony(onPlayAvailabilityChange)

    expect(screen.getByRole('dialog', { name: 'The Finale plea chat' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Skip to end' })).toBeDefined()
    expect(onPlayAvailabilityChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByText(/Press Play/)).toBeNull()

    act(() => window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true })))
    expect(screen.getByRole('dialog', { name: 'The Finale plea chat' })).toBeDefined()

    act(() => vi.advanceTimersByTime(12_000))

    const conversation = screen.getByRole('log').textContent ?? ''
    expect(conversation).toContain(loh.name)
    expect(conversation).toContain(nominees[0].name)
    expect(conversation).toContain(nominees[1].name)
    expect(conversation).toContain('competition wins')
    expect(screen.getByRole('button', { name: 'Continue →' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Continue →' }))
    act(() => vi.advanceTimersByTime(400))
    expect(screen.queryByRole('dialog', { name: 'The Finale plea chat' })).toBeNull()
  })
})
