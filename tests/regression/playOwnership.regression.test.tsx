import { act, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FloatingActionBar from '../../src/components/FloatingActionBar/FloatingActionBar'
import VoxAudiencePulseReveal from '../../src/components/VoxAudiencePulseReveal/VoxAudiencePulseReveal'
import gameReducer from '../../src/store/gameSlice'
import socialReducer from '../../src/social/socialSlice'
import profilesReducer from '../../src/store/profilesSlice'
import challengeReducer from '../../src/store/challengeSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import { createInitialVoxPopuliState } from '../../src/features/twists/voxPopuli'
import type { GameState } from '../../src/types'

function makeStore(gameOverrides: Partial<GameState> = {}) {
  const reducers = {
    game: gameReducer,
    social: socialReducer,
    profiles: profilesReducer,
    challenge: challengeReducer,
    publicOpinion: publicOpinionReducer,
  }
  const base = configureStore({ reducer: reducers })
  const initial = base.getState()

  return configureStore({
    reducer: reducers,
    preloadedState: {
      ...initial,
      game: { ...initial.game, ...gameOverrides },
    },
  })
}

function renderFab(store: ReturnType<typeof makeStore>) {
  render(
    <MemoryRouter initialEntries={['/game']}>
      <Provider store={store}>
        <FloatingActionBar />
      </Provider>
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('single-owner Play regressions', () => {
  it('does not generic-advance when Vox audience resolution owns the Play press', () => {
    const initial = makeStore().getState().game
    const store = makeStore({
      phase: 'week_end',
      week: 4,
      voxPopuli: {
        ...createInitialVoxPopuliState(initial.season),
        status: 'active',
        awaitingPublicVote: true,
      },
    })
    let playEvents = 0
    const listener = () => {
      playEvents += 1
    }
    window.addEventListener('ui:playPressed', listener)
    renderFab(store)

    act(() => screen.getByRole('button', { name: 'Advance to next phase' }).click())

    expect(playEvents).toBe(1)
    expect(store.getState().game.week).toBe(4)
    expect(store.getState().game.phase).toBe('week_end')
    window.removeEventListener('ui:playPressed', listener)
  })

  it('does not generic-advance while the Battle Back announcement sequence owns Play', () => {
    const initial = makeStore().getState().game
    const store = makeStore({
      phase: 'week_end',
      week: 5,
      battleBack: {
        ...(initial.battleBack ?? {}),
        active: true,
        competitionActive: false,
      } as GameState['battleBack'],
    })
    let playEvents = 0
    const listener = () => {
      playEvents += 1
    }
    window.addEventListener('ui:playPressed', listener)
    renderFab(store)

    act(() => screen.getByRole('button', { name: 'Advance to next phase' }).click())

    expect(playEvents).toBe(1)
    expect(store.getState().game.week).toBe(5)
    expect(store.getState().game.phase).toBe('week_end')
    window.removeEventListener('ui:playPressed', listener)
  })

  it('marks the Vox temporary reveal Play press as consumed', () => {
    const store = makeStore()
    const players = store.getState().game.players.slice(0, 2)
    const onComplete = vi.fn()
    render(
      <VoxAudiencePulseReveal
        players={players}
        percentages={{ [players[0]!.id]: 55, [players[1]!.id]: 45 }}
        durationMs={20_000}
        onComplete={onComplete}
      />
    )

    const event = new CustomEvent('ui:playPressed', { cancelable: true })
    const notCancelled = window.dispatchEvent(event)

    expect(notCancelled).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('play')
  })
})
