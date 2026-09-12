import React from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent } from '../src/store/gameSlice'
import FauxTvProgrammingController from '../src/broadcasting/FauxTvProgrammingController'
import { getBroadcastEditorialMetadata } from '../src/broadcasting/broadcastEditorialPolicy'
import { RESUME_RECAP_MIN_ABSENCE_MS } from '../src/broadcasting/programmingDesk'

function makeStore(overrides: Record<string, unknown> = {}) {
  const base = gameReducer(undefined, { type: '@@INIT' })
  const leo = base.players[0]
  const players = base.players.map((player) =>
    player.id === leo.id
      ? {
          ...player,
          status: 'loh' as const,
          stats: { lohWins: 2, posWins: 0, timesNominated: 0 },
        }
      : player
  )
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: {
      game: {
        ...base,
        phase: 'loh_results' as const,
        week: 4,
        players,
        lohId: leo.id,
        tvFeed: [],
        broadcastQueue: [],
        lastPlayedAt: Date.now(),
        ...overrides,
      },
    },
  })
}

describe('Faux TV optional programming scheduling', () => {
  it('emits By the Numbers as ambient content without entering or displacing the official queue', async () => {
    const store = makeStore()
    const { phase, week } = store.getState().game

    store.dispatch(
      addTvEvent({
        text: 'Critical official announcement',
        type: 'twist',
        source: 'system',
        channels: ['tv', 'mainLog'],
        meta: {
          phase,
          week,
          forceOnTv: true,
          broadcastManaged: true,
          broadcastPriority: 'critical',
          broadcastLevel: 'critical',
          major: 'custom_critical',
        },
      })
    )
    const official = store
      .getState()
      .game.tvFeed.find((event) => event.text === 'Critical official announcement')
    expect(official).toBeTruthy()

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(
        store
          .getState()
          .game.tvFeed.some(
            (event) => getBroadcastEditorialMetadata(event)?.category === 'by_the_numbers'
          )
      ).toBe(true)
    })

    const state = store.getState().game
    const statistic = state.tvFeed.find(
      (event) => getBroadcastEditorialMetadata(event)?.category === 'by_the_numbers'
    )
    expect(statistic).toBeTruthy()
    expect(getBroadcastEditorialMetadata(statistic!)?.presentationMode).toBe('ambient')
    expect(statistic?.meta?.forceOnTv).not.toBe(true)
    expect(state.broadcastQueue).toContain(official!.id)
    expect(state.broadcastQueue).not.toContain(statistic!.id)
  })

  it('uses a meaningful resume recap as the single strong optional story instead of piling on a statistic', async () => {
    const oldTimestamp = Date.now() - RESUME_RECAP_MIN_ABSENCE_MS - 60_000
    const store = makeStore({ lastPlayedAt: oldTimestamp })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(
        store
          .getState()
          .game.tvFeed.some(
            (event) => getBroadcastEditorialMetadata(event)?.category === 'programming_resume_recap'
          )
      ).toBe(true)
    })

    const state = store.getState().game
    const optional = state.tvFeed.filter((event) => {
      const category = getBroadcastEditorialMetadata(event)?.category
      return category === 'programming_resume_recap' || category === 'by_the_numbers'
    })
    expect(optional).toHaveLength(1)
    expect(getBroadcastEditorialMetadata(optional[0])?.category).toBe('programming_resume_recap')
    expect(optional[0].meta?.forceOnTv).not.toBe(true)
    expect(state.broadcastQueue).not.toContain(optional[0].id)
  })
})
