/**
 * TV log (tvFeed) behaviour tests.
 *
 * Validates that:
 *  1. Every log message has a non-empty, unique id.
 *  2. Messages are prepended (newest first) to the tvFeed array.
 *  3. The feed is capped at 50 entries.
 *  4. The `addTvEvent` action also produces unique IDs.
 *  5. Rapid successive events (same-millisecond) get distinct IDs.
 *  6. Replacement-nominee events have unique IDs and do not overwrite previous entries.
 */

import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, {
  advance,
  addTvEvent,
  setPhase,
  setReplacementNominee,
  submitPovSaveTarget,
  aiReplacementRendered,
} from '../src/store/gameSlice'
import type { GameState, Player } from '../src/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }))
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'week_start',
    seed: 42,
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    posWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  }
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: { ...base, ...overrides } },
  })
}

// ── ID uniqueness ─────────────────────────────────────────────────────────────

describe('tvFeed — event ID uniqueness', () => {
  it('each pushEvent call produces a unique ID', () => {
    const store = makeStore({ phase: 'week_start' })

    // Advance through several phases to trigger multiple pushEvent calls.
    store.dispatch(advance()) // week_start → loh_comp_announcement
    store.dispatch(advance()) // loh_comp_announcement → loh_comp
    store.dispatch(advance()) // loh_comp → loh_results (pushes LOH event)
    store.dispatch(advance()) // loh_results → social_1

    const feed = store.getState().game.tvFeed
    const ids = feed.map((e) => e.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)
  })

  it('does not repeat an exact broadcast line if a phase is resumed', () => {
    const store = makeStore({
      phase: 'loh_results',
      week: 2,
      lohId: 'p1',
      players: makePlayers(6).map((player) =>
        player.id === 'p1' ? { ...player, status: 'loh' as const } : player
      ),
    })

    store.dispatch(advance())
    store.dispatch(setPhase('loh_results'))
    store.dispatch(advance())

    expect(
      store
        .getState()
        .game.tvFeed.filter(
          (event) =>
            event.text === 'Housemates congratulate Player 1. Alliances are already forming… 💬'
        )
    ).toHaveLength(1)
  })

  it('adds exactly one fresh day-start line after day end', () => {
    const store = makeStore({ phase: 'week_end', week: 1, tvFeed: [] })

    store.dispatch(advance())

    const dayStarts = store
      .getState()
      .game.tvFeed.filter((event) => event.meta?.key === 'day_start')

    expect(dayStarts).toHaveLength(1)
    expect(dayStarts[0]).toMatchObject({
      text: 'Day 2 has begun. Get ready.',
      meta: { phase: 'week_start', week: 2 },
    })
  })

  it('addTvEvent produces unique IDs for rapid-fire dispatches', () => {
    const store = makeStore()

    for (let i = 0; i < 10; i++) {
      store.dispatch(addTvEvent({ text: `Event ${i}`, type: 'game' }))
    }

    const feed = store.getState().game.tvFeed
    const ids = feed.map((e) => e.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)
  })

  it('simultaneous pushEvent calls (same phase/week) have distinct IDs', () => {
    // Force a scenario with multiple events in the same phase/week by
    // dispatching an action that triggers multiple internal pushEvent calls.
    const players: Player[] = [
      { id: 'p0', name: 'LOH', avatar: '👑', status: 'loh', isUser: false },
      { id: 'p1', name: 'Nom1', avatar: '🧑', status: 'nominated' },
      { id: 'p2', name: 'Nom2', avatar: '🧑', status: 'nominated' },
    ]
    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      posWinnerId: 'p1', // nominee wins POS → auto-saves → replacement needed
      players,
    })

    store.dispatch(advance()) // triggers multiple pushEvent calls in pos_ceremony_results

    const feed = store.getState().game.tvFeed
    const ids = feed.map((e) => e.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)
  })
})

// ── Ordering (newest first) ────────────────────────────────────────────────────

describe('tvFeed — newest-first ordering', () => {
  it('most recent event is at index 0', () => {
    const store = makeStore({ phase: 'week_start', tvFeed: [] })

    store.dispatch(addTvEvent({ text: 'First event', type: 'game' }))
    store.dispatch(addTvEvent({ text: 'Second event', type: 'game' }))
    store.dispatch(addTvEvent({ text: 'Third event', type: 'game' }))

    const feed = store.getState().game.tvFeed
    expect(feed[0].text).toBe('Third event')
    expect(feed[1].text).toBe('Second event')
    expect(feed[2].text).toBe('First event')
  })

  it('timestamps are non-decreasing in reverse order (latest first)', () => {
    const store = makeStore({ phase: 'week_start', tvFeed: [] })

    for (let i = 0; i < 5; i++) {
      store.dispatch(addTvEvent({ text: `Event ${i}`, type: 'game' }))
    }

    const feed = store.getState().game.tvFeed
    for (let i = 1; i < feed.length; i++) {
      // Newer entries (lower index) should have timestamp >= older entries
      expect(feed[i - 1].timestamp).toBeGreaterThanOrEqual(feed[i].timestamp)
    }
  })
})

// ── Feed cap ──────────────────────────────────────────────────────────────────

describe('tvFeed — 1,000-entry cap', () => {
  it('never exceeds 1,000 entries', () => {
    const store = makeStore({ phase: 'week_start', tvFeed: [] })

    for (let i = 0; i < 1_010; i++) {
      store.dispatch(addTvEvent({ text: `Event ${i}`, type: 'game' }))
    }

    expect(store.getState().game.tvFeed).toHaveLength(1_000)
  })

  it('oldest entries are dropped when cap is reached', () => {
    const store = makeStore({ phase: 'week_start', tvFeed: [] })

    for (let i = 0; i < 1_005; i++) {
      store.dispatch(addTvEvent({ text: `Event ${i}`, type: 'game' }))
    }

    const feed = store.getState().game.tvFeed
    // The 1,005 events added means events 0-4 were dropped; most recent is "Event 1004".
    expect(feed[0].text).toBe('Event 1004')
    // Should not contain the earliest events
    expect(feed.some((e) => e.text === 'Event 0')).toBe(false)
  })
})

// ── Replacement nominee log ───────────────────────────────────────────────────

describe('replacement nominee — log entry uniqueness', () => {
  it('replacement nominee event has a unique ID distinct from previous events', () => {
    // Set up a state where AI LOH triggers a replacement after POS save.
    // The pos_ceremony_results logic runs when advancing FROM pos_ceremony.
    // POS winner is 'nom1' (a nominee) → auto-saves themselves → AI LOH picks replacement.
    const players: Player[] = [
      { id: 'loh', name: 'Big LOH', avatar: '👑', status: 'loh', isUser: false },
      { id: 'pos', name: 'POS Holder', avatar: '🎭', status: 'pos' },
      { id: 'nom1', name: 'Nominee 1', avatar: '🧑', status: 'nominated+pos' },
      { id: 'nom2', name: 'Nominee 2', avatar: '🧑', status: 'nominated' },
      { id: 'other', name: 'Other', avatar: '🧑', status: 'active' },
    ]

    const store = makeStore({
      // Start at pos_ceremony so advance() transitions to pos_ceremony_results
      phase: 'pos_ceremony',
      lohId: 'loh',
      nomineeIds: ['nom1', 'nom2'],
      posWinnerId: 'nom1', // nominated+pov → auto-saves
      players,
      tvFeed: [],
    })

    store.dispatch(advance()) // pos_ceremony → pos_ceremony_results (pushes "used veto", sets aiReplacementStep=1, aiReplacementWaiting=true)
    store.dispatch(advance()) // aiReplacementStep=1 → pushes "LOH must name replacement", sets step=2
    store.dispatch(aiReplacementRendered()) // UI acknowledges step-1 message; clears aiReplacementWaiting
    store.dispatch(advance()) // aiReplacementStep=2 → AI picks replacement, pushes replacement event

    const feed = store.getState().game.tvFeed
    const ids = feed.map((e) => e.id)
    const uniqueIds = new Set(ids)

    // All IDs must be unique
    expect(uniqueIds.size).toBe(ids.length)

    // There should be a replacement event
    const replacementEvent = feed.find((e) => e.text.includes('backup nominee'))
    expect(replacementEvent).toBeDefined()
    expect(replacementEvent?.id).toBeTruthy()
  })

  it('human LOH replacement nominee event has unique ID', () => {
    const players: Player[] = [
      { id: 'loh', name: 'Human LOH', avatar: '👑', status: 'loh', isUser: true },
      { id: 'pos', name: 'POS Holder', avatar: '🎭', status: 'pos' },
      { id: 'nom1', name: 'Nominee 1', avatar: '🧑', status: 'nominated' },
      { id: 'nom2', name: 'Nominee 2', avatar: '🧑', status: 'nominated' },
      { id: 'other', name: 'Other', avatar: '🧑', status: 'active' },
    ]

    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'loh',
      nomineeIds: ['nom1', 'nom2'],
      posWinnerId: 'pos', // non-nominee POS holder → human LOH decides
      awaitingPovSaveTarget: true,
      players,
      tvFeed: [],
    })

    // Human POS holder saves nom1
    store.dispatch(submitPovSaveTarget('nom1'))
    // Human LOH names replacement
    store.dispatch(setReplacementNominee('other'))

    const feed = store.getState().game.tvFeed
    const ids = feed.map((e) => e.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)

    const replacementEvent = feed.find((e) => e.text.includes('backup nominee'))
    expect(replacementEvent).toBeDefined()
  })
})
