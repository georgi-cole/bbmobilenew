import React from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import gameReducer, {
  addTvEvent,
  advance,
  createInitialGameState,
} from '../src/store/gameSlice'
import FauxTvProgrammingController from '../src/broadcasting/FauxTvProgrammingController'
import { getBroadcastEditorialMetadata } from '../src/broadcasting/broadcastEditorialPolicy'
import {
  BIG_EYE_PROGRAMMING_CATEGORY,
  RESUME_RECAP_MIN_ABSENCE_MS,
} from '../src/broadcasting/programmingDesk'
import type { TvEvent } from '../src/types'

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

function makeAIAutoStore() {
  const game = createInitialGameState()
  game.players = game.players.map((player) => ({ ...player, isUser: false }))
  game.lastPlayedAt = Date.now()
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game },
  })
}

function optionalStory(category: string, storyKey: string, week = 4): TvEvent {
  return {
    id: `existing:${storyKey}`,
    text: 'Existing editorial story',
    type: 'game',
    timestamp: Date.now() - 1_000,
    channels: ['tv', 'mainLog'],
    source: 'system',
    meta: {
      phase: 'week_start',
      week,
      editorial: {
        importance: 'optional',
        presentationMode: 'ambient',
        category,
        sensitivity: 'public',
        storyKey,
        cooldownKey: storyKey,
      },
    },
  }
}

function isStrongProgrammingStory(event: TvEvent): boolean {
  const category = getBroadcastEditorialMetadata(event)?.category
  return (
    category === 'by_the_numbers' ||
    category === BIG_EYE_PROGRAMMING_CATEGORY ||
    category === 'programming_resume_recap'
  )
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

  it('keeps Day 1 clean even when a first-day dual-power fact would otherwise qualify', async () => {
    const store = makeStore({ week: 1 })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      expect(
        store.getState().game.tvFeed.filter((event) => getBroadcastEditorialMetadata(event))
      ).toHaveLength(0)
    })
  })

  it('fills a quiet Day 2+ only at week_end with one ambient daily ledger', async () => {
    const store = makeStore({
      phase: 'week_end' as const,
      lohId: null,
      week: 4,
    })

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
            (event) => getBroadcastEditorialMetadata(event)?.storyKey === 'stats:daily:4'
          )
      ).toBe(true)
    })

    const optional = store
      .getState()
      .game.tvFeed.filter((event) => getBroadcastEditorialMetadata(event)?.importance === 'optional')
    expect(optional).toHaveLength(1)
    expect(getBroadcastEditorialMetadata(optional[0])?.presentationMode).toBe('ambient')
  })

  it('does not pile a routine daily ledger onto a day that already has Big Eye programming', async () => {
    const callback = optionalStory(
      BIG_EYE_PROGRAMMING_CATEGORY,
      'programming:callback:previous-shock',
      4
    )
    const store = makeStore({
      phase: 'week_end' as const,
      lohId: null,
      week: 4,
      tvFeed: [callback],
    })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      const strong = store.getState().game.tvFeed.filter(isStrongProgrammingStory)
      expect(strong).toHaveLength(1)
    })
  })

  it('lets a genuine milestone become the second ambient beat after a callback', async () => {
    const callback = optionalStory(
      BIG_EYE_PROGRAMMING_CATEGORY,
      'programming:callback:previous-shock',
      4
    )
    const store = makeStore({ tvFeed: [callback] })

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    await waitFor(() => {
      const strong = store.getState().game.tvFeed.filter(isStrongProgrammingStory)
      expect(strong).toHaveLength(2)
    })

    const lohId = store.getState().game.lohId
    const milestone = store
      .getState()
      .game.tvFeed.find(
        (event) => getBroadcastEditorialMetadata(event)?.storyKey === `stats:loh:${lohId}:2`
      )
    expect(milestone).toBeTruthy()
    expect(getBroadcastEditorialMetadata(milestone!)?.presentationMode).toBe('ambient')
  })

  it('uses a meaningful resume recap first and caps the resulting programming day at two ambient beats', async () => {
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

    await waitFor(() => {
      const optional = store.getState().game.tvFeed.filter((event) => {
        const category = getBroadcastEditorialMetadata(event)?.category
        return category === 'programming_resume_recap' || category === 'by_the_numbers'
      })
      expect(optional.length).toBeGreaterThanOrEqual(1)
      expect(optional.length).toBeLessThanOrEqual(2)
    })

    const state = store.getState().game
    const optional = state.tvFeed.filter((event) => {
      const category = getBroadcastEditorialMetadata(event)?.category
      return category === 'programming_resume_recap' || category === 'by_the_numbers'
    })
    expect(
      optional.some(
        (event) => getBroadcastEditorialMetadata(event)?.category === 'programming_resume_recap'
      )
    ).toBe(true)
    expect(
      optional.every(
        (event) => getBroadcastEditorialMetadata(event)?.presentationMode === 'ambient'
      )
    ).toBe(true)
    expect(optional.every((event) => event.meta?.forceOnTv !== true)).toBe(true)
    expect(optional.every((event) => !state.broadcastQueue.includes(event.id))).toBe(true)
  })

  it('keeps a normal simulated AI season at one or two programming beats per completed Day 2+', async () => {
    const store = makeAIAutoStore()
    const completedDays = new Set<number>()

    render(
      <Provider store={store}>
        <FauxTvProgrammingController />
      </Provider>
    )

    for (let step = 0; step < 250; step += 1) {
      await act(async () => {
        store.dispatch(advance())
        await Promise.resolve()
      })

      const game = store.getState().game
      if (game.phase === 'week_end') completedDays.add(game.week)
    }

    const game = store.getState().game
    const programming = game.tvFeed.filter(isStrongProgrammingStory)
    const resumeRecaps = programming.filter(
      (event) => getBroadcastEditorialMetadata(event)?.category === 'programming_resume_recap'
    )
    expect(resumeRecaps).toHaveLength(0)

    const byDay = new Map<number, TvEvent[]>()
    for (const event of programming) {
      const day = event.meta?.week
      if (typeof day !== 'number') continue
      byDay.set(day, [...(byDay.get(day) ?? []), event])
    }

    for (const [day, stories] of byDay) {
      if (day === 1) expect(stories).toHaveLength(0)
      else expect(stories.length).toBeLessThanOrEqual(2)
    }

    const calibratedDays = [...completedDays].filter((day) => day >= 2)
    expect(calibratedDays.length).toBeGreaterThan(0)
    for (const day of calibratedDays) {
      const stories = byDay.get(day) ?? []
      expect(stories.length).toBeGreaterThanOrEqual(1)
      expect(stories.length).toBeLessThanOrEqual(2)
      expect(
        stories.every(
          (event) => getBroadcastEditorialMetadata(event)?.presentationMode === 'ambient'
        )
      ).toBe(true)
    }
  })
})
