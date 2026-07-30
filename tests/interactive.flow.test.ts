import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, {
  advance,
  selectNominee1,
  finalizeNominations,
  commitNominees,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
  submitHumanVote,
  submitTieBreak,
  finalizePendingEviction,
} from '../src/store/gameSlice'
import type { GameState, Player } from '../src/types'

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }))
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'nominations',
    seed: 42,
    lohId: 'p0',
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

describe('Human LOH nominations', () => {
  it('sets awaitingNominations when human is LOH at nomination_results', () => {
    const store = makeStore({ phase: 'nominations', lohId: 'p0' })
    store.dispatch(advance()) // nominations → nomination_results
    const state = store.getState().game
    expect(state.phase).toBe('nomination_results')
    expect(state.awaitingNominations).toBe(true)
    expect(state.nomineeIds).toHaveLength(0)
  })

  it('advance() is a no-op while awaitingNominations is true', () => {
    const store = makeStore({ phase: 'nomination_results', lohId: 'p0', awaitingNominations: true })
    store.dispatch(advance())
    store.dispatch(advance())
    const state = store.getState().game
    // Phase must not advance — nominations not yet made
    expect(state.phase).toBe('nomination_results')
    expect(state.awaitingNominations).toBe(true)
  })

  it('selectNominee1 is a no-op when awaitingNominations is false', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: false,
    })
    store.dispatch(selectNominee1('p1'))
    expect(store.getState().game.pendingNominee1Id).toBeNull()
  })

  it('AI LOH auto-nominates without blocking', () => {
    const store = makeStore({ phase: 'nominations', lohId: 'p1' }) // p1 is not user
    store.dispatch(advance()) // nominations → nomination_results
    const state = store.getState().game
    expect(state.phase).toBe('nomination_results')
    expect(state.awaitingNominations).toBeFalsy()
    expect(state.nomineeIds).toHaveLength(2)
  })

  it('selectNominee1 sets pendingNominee1Id', () => {
    const store = makeStore({ phase: 'nomination_results', lohId: 'p0', awaitingNominations: true })
    store.dispatch(selectNominee1('p1'))
    expect(store.getState().game.pendingNominee1Id).toBe('p1')
  })

  it('finalizeNominations sets both nominees and clears awaitingNominations', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      pendingNominee1Id: 'p1',
    })
    store.dispatch(finalizeNominations('p2'))
    const state = store.getState().game
    expect(state.awaitingNominations).toBe(false)
    expect(state.pendingNominee1Id).toBeNull()
    expect(state.nomineeIds).toContain('p1')
    expect(state.nomineeIds).toContain('p2')
    expect(state.nomineeIds).toHaveLength(2)
  })

  it('finalizeNominations rejects the same player as nominee 1', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      pendingNominee1Id: 'p1',
    })
    store.dispatch(finalizeNominations('p1')) // same as nominee 1
    expect(store.getState().game.awaitingNominations).toBe(true) // still blocking
  })
})

describe('Human POS decision', () => {
  it('sets awaitingPovDecision when human is POS holder and not nominee', () => {
    const players = makePlayers(6)
    // p0 is user+pov, p1 and p2 are nominees
    players[0].status = 'pos'
    players[1].status = 'nominated'
    players[2].status = 'nominated'
    const store = makeStore({
      phase: 'pos_ceremony',
      lohId: 'p3',
      posWinnerId: 'p0',
      nomineeIds: ['p1', 'p2'],
      players,
    })
    store.dispatch(advance()) // pos_ceremony → pos_ceremony_results
    const state = store.getState().game
    expect(state.phase).toBe('pos_ceremony_results')
    expect(state.awaitingPovDecision).toBe(true)
  })

  it('submitPovDecision(false) clears awaitingPovDecision and logs event', () => {
    const store = makeStore({
      phase: 'pos_ceremony_results',
      posWinnerId: 'p0',
      awaitingPovDecision: true,
      nomineeIds: ['p1', 'p2'],
    })
    store.dispatch(submitPovDecision(false))
    const state = store.getState().game
    expect(state.awaitingPovDecision).toBe(false)
    expect(state.awaitingPovSaveTarget).toBeFalsy()
    expect(state.tvFeed[0].text).toContain('NOT to use')
  })

  it('submitPovDecision(true) sets awaitingPovSaveTarget', () => {
    const store = makeStore({
      phase: 'pos_ceremony_results',
      posWinnerId: 'p0',
      awaitingPovDecision: true,
      nomineeIds: ['p1', 'p2'],
    })
    store.dispatch(submitPovDecision(true))
    const state = store.getState().game
    expect(state.awaitingPovDecision).toBe(false)
    expect(state.awaitingPovSaveTarget).toBe(true)
  })

  it('breaks the AI replacement flow into separate Safety Ceremony messages', () => {
    const players = makePlayers(6)
    players[1].status = 'loh'
    players[2].status = 'nominated+pos'
    players[3].status = 'nominated'

    const store = makeStore({
      phase: 'pos_ceremony',
      lohId: 'p1',
      posWinnerId: 'p2',
      nomineeIds: ['p2', 'p3'],
      players,
    })

    store.dispatch(advance()) // pos_ceremony → pos_ceremony_results

    let state = store.getState().game
    expect(state.tvFeed[0]?.text).toBe(
      'Player 2 has decided to use the Power of Safety on themself. Player 1 must now name a backup nominee.'
    )
    expect(state.aiReplacementStep).toBe(1)

    store.dispatch(advance())

    state = store.getState().game
    expect(state.tvFeed[0]?.text).toBe('Player 1 is selecting a backup nominee...')
    expect(state.aiReplacementStep).toBe(2)
  })
})

describe('Live vote + eviction tally', () => {
  it('human eligible voter gets awaitingHumanVote set during live_vote', () => {
    const players = makePlayers(6)
    players[1].status = 'nominated'
    players[2].status = 'nominated'
    // p0 is user, p3 is LOH, p1/p2 are nominees
    const store = makeStore({
      phase: 'social_2',
      lohId: 'p3',
      nomineeIds: ['p1', 'p2'],
      players,
    })
    store.dispatch(advance()) // social_2 → live_vote
    const state = store.getState().game
    expect(state.phase).toBe('live_vote')
    expect(state.awaitingHumanVote).toBe(true)
    // AI voters should have voted
    const aiVoterIds = ['p4', 'p5'] // p0=user, p3=LOH, p1/p2=nominees
    for (const voterId of aiVoterIds) {
      expect(state.votes?.[voterId]).toBeDefined()
    }
  })

  it('does not add a duplicate live-vote tv message when entering live_vote', () => {
    const players = makePlayers(6)
    players[1].status = 'nominated'
    players[2].status = 'nominated'
    const store = makeStore({
      phase: 'social_2',
      lohId: 'p3',
      nomineeIds: ['p1', 'p2'],
      players,
      tvFeed: [
        {
          id: 'social-2',
          text: 'Housemates make their final pitches before the live vote. 🤝',
          type: 'social',
          timestamp: Date.now(),
        },
      ],
    })

    store.dispatch(advance()) // social_2 → live_vote

    const { game } = store.getState()
    expect(game.phase).toBe('live_vote')
    expect(game.tvFeed.some((event) => event.type === 'vote')).toBe(false)
    expect(game.tvFeed[0]?.text).toBe(
      'Housemates make their final pitches before the live vote. 🤝'
    )
  })

  it('advance() is a no-op while awaitingHumanVote is true', () => {
    const store = makeStore({
      phase: 'live_vote',
      lohId: 'p3',
      nomineeIds: ['p1', 'p2'],
      awaitingHumanVote: true,
      votes: {},
    })
    store.dispatch(advance())
    store.dispatch(advance())
    const state = store.getState().game
    // Phase must not advance — human has not yet voted
    expect(state.phase).toBe('live_vote')
    expect(state.awaitingHumanVote).toBe(true)
  })

  it('submitHumanVote adds vote and clears awaitingHumanVote', () => {
    const store = makeStore({
      phase: 'live_vote',
      lohId: 'p3',
      nomineeIds: ['p1', 'p2'],
      awaitingHumanVote: true,
      votes: {},
    })
    store.dispatch(submitHumanVote('p1'))
    const state = store.getState().game
    expect(state.awaitingHumanVote).toBe(false)
    expect(state.votes?.['p0']).toBe('p1')
  })

  it('eviction_results evicts nominee with most votes', () => {
    // p1 gets 2 votes, p2 gets 1 vote — p1 is evicted
    const players = makePlayers(6)
    players[1].status = 'nominated'
    players[2].status = 'nominated'
    const store = makeStore({
      phase: 'live_vote',
      lohId: 'p3',
      nomineeIds: ['p1', 'p2'],
      votes: { p4: 'p1', p5: 'p1', p0: 'p2' },
      players,
    })
    store.dispatch(advance()) // live_vote → eviction_results; tally → pendingEviction
    const state = store.getState().game
    expect(state.phase).toBe('eviction_results')
    // Eviction is deferred — pendingEviction is set, status still nominated
    expect(state.pendingEviction?.evicteeId).toBe('p1')
    // Commit the eviction (simulating overlay onDone)
    store.dispatch(finalizePendingEviction('p1'))
    const p1 = store.getState().game.players.find((p) => p.id === 'p1')
    expect(p1?.status).toMatch(/evicted|jury/)
  })

  it('tie results in awaitingTieBreak when human is LOH', () => {
    const players = makePlayers(6)
    players[1].status = 'nominated'
    players[2].status = 'nominated'
    // p0 is user+LOH, p1/p2 are nominees, each gets 1 vote
    const store = makeStore({
      phase: 'live_vote',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      votes: { p3: 'p1', p4: 'p2' },
      players,
    })
    store.dispatch(advance()) // live_vote → eviction_results; tally finds tie
    const state = store.getState().game
    expect(state.phase).toBe('eviction_results')
    expect(state.awaitingTieBreak).toBe(true)
    expect(state.tiedNomineeIds).toContain('p1')
    expect(state.tiedNomineeIds).toContain('p2')
    // voteResults must be set so the house votes are shown BEFORE the tie-break prompt
    expect(state.voteResults).not.toBeNull()
    expect(state.voteResults?.['p1']).toBe(1)
    expect(state.voteResults?.['p2']).toBe(1)
  })

  it('submitTieBreak queues the chosen nominee before the week ends', () => {
    const players = makePlayers(6)
    players[1].status = 'nominated'
    players[2].status = 'nominated'
    const store = makeStore({
      phase: 'eviction_results',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingTieBreak: true,
      tiedNomineeIds: ['p1', 'p2'],
      players,
    })
    store.dispatch(submitTieBreak('p1'))
    const state = store.getState().game
    expect(state.awaitingTieBreak).toBe(false)
    expect(state.phase).toBe('eviction_results')
    // Eviction is deferred — pendingEviction is set
    expect(state.pendingEviction?.evicteeId).toBe('p1')
    // voteResults is cleared after tie-break (already shown before; no re-show)
    expect(state.voteResults).toBeNull()
    // Commit the eviction (simulating overlay onDone)
    store.dispatch(finalizePendingEviction('p1'))
    const p1 = store.getState().game.players.find((p) => p.id === 'p1')
    expect(p1?.status).toMatch(/evicted|jury/)
    store.dispatch(advance())
    expect(store.getState().game.phase).toBe('week_end')
  })
})

describe('commitNominees (single-action nomination)', () => {
  it('sets both nominees and clears awaitingNominations', () => {
    const store = makeStore({ phase: 'nomination_results', lohId: 'p0', awaitingNominations: true })
    store.dispatch(commitNominees(['p1', 'p2']))
    const state = store.getState().game
    expect(state.awaitingNominations).toBe(false)
    expect(state.pendingNominee1Id).toBeNull()
    expect(state.nomineeIds).toContain('p1')
    expect(state.nomineeIds).toContain('p2')
    expect(state.nomineeIds).toHaveLength(2)
  })

  it('marks nominated players with status "nominated"', () => {
    const store = makeStore({ phase: 'nomination_results', lohId: 'p0', awaitingNominations: true })
    store.dispatch(commitNominees(['p1', 'p2']))
    const { players } = store.getState().game
    expect(players.find((p) => p.id === 'p1')?.status).toBe('nominated')
    expect(players.find((p) => p.id === 'p2')?.status).toBe('nominated')
  })

  it('is a no-op when awaitingNominations is false', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: false,
    })
    store.dispatch(commitNominees(['p1', 'p2']))
    expect(store.getState().game.nomineeIds).toHaveLength(0)
  })

  it('rejects duplicate ids (same player twice)', () => {
    const store = makeStore({ phase: 'nomination_results', lohId: 'p0', awaitingNominations: true })
    store.dispatch(commitNominees(['p1', 'p1']))
    expect(store.getState().game.awaitingNominations).toBe(true) // still blocking
    expect(store.getState().game.nomineeIds).toHaveLength(0)
  })

  it('rejects a payload with wrong number of ids', () => {
    const store = makeStore({ phase: 'nomination_results', lohId: 'p0', awaitingNominations: true })
    store.dispatch(commitNominees(['p1'])) // only 1 id, needs 2
    expect(store.getState().game.awaitingNominations).toBe(true)
    expect(store.getState().game.nomineeIds).toHaveLength(0)
  })

  it('rejects the LOH as a nominee', () => {
    const store = makeStore({ phase: 'nomination_results', lohId: 'p0', awaitingNominations: true })
    store.dispatch(commitNominees(['p0', 'p1'])) // p0 is LOH
    expect(store.getState().game.awaitingNominations).toBe(true)
    expect(store.getState().game.nomineeIds).toHaveLength(0)
  })

  it('is a no-op when phase is not nomination_results', () => {
    const store = makeStore({ phase: 'nominations', lohId: 'p0', awaitingNominations: true })
    store.dispatch(commitNominees(['p1', 'p2']))
    expect(store.getState().game.nomineeIds).toHaveLength(0)
  })
})

describe('Replacement nominee — saved player exclusion', () => {
  function makeReplacementStore() {
    // p0 is user (LOH + POS holder), p1 and p2 are nominated
    const players = makePlayers(6)
    players[0].status = 'loh+pos'
    players[1].status = 'nominated'
    players[2].status = 'nominated'
    return makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p0',
      posWinnerId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingPovSaveTarget: true,
      players,
    })
  }

  it('submitPovSaveTarget sets povSavedId to the saved player', () => {
    const store = makeReplacementStore()
    store.dispatch(submitPovSaveTarget('p1'))
    const state = store.getState().game
    expect(state.povSavedId).toBe('p1')
    expect(state.replacementNeeded).toBe(true)
    expect(state.nomineeIds).not.toContain('p1')
  })

  it('setReplacementNominee rejects the saved player (povSavedId)', () => {
    const store = makeReplacementStore()
    store.dispatch(submitPovSaveTarget('p1')) // p1 is saved
    // Attempt to pick p1 (the saved player) as replacement — should be rejected
    store.dispatch(setReplacementNominee('p1'))
    const state = store.getState().game
    expect(state.replacementNeeded).toBe(true) // still waiting — was rejected
    expect(state.nomineeIds).not.toContain('p1')
  })

  it('setReplacementNominee accepts an eligible player and clears povSavedId', () => {
    const store = makeReplacementStore()
    store.dispatch(submitPovSaveTarget('p1')) // p1 is saved
    // Pick p3 as replacement — eligible (not LOH, not POS, not saved, not already nominated)
    store.dispatch(setReplacementNominee('p3'))
    const state = store.getState().game
    expect(state.replacementNeeded).toBeFalsy()
    expect(state.nomineeIds).toContain('p3')
    expect(state.povSavedId).toBeNull()
  })
})

describe('AI LOH POS replacement flow', () => {
  function makeAiHohReplacementStore() {
    // p0 is user, p1 is AI LOH + POS holder, p2 and p3 are initially nominated
    const players = makePlayers(6)
    players[1].status = 'loh+pos'
    players[2].status = 'nominated'
    players[3].status = 'nominated'
    return makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p1',
      posWinnerId: 'p1',
      nomineeIds: ['p2', 'p3'],
      awaitingPovSaveTarget: true,
      players,
    })
  }

  it('AI replacement never re-nominates the saved player', () => {
    const store = makeAiHohReplacementStore()
    // AI LOH (p1) holds POS; saving p2 triggers automatic AI replacement selection
    store.dispatch(submitPovSaveTarget('p2'))
    const state = store.getState().game
    // The saved player must not appear among the final nominees
    expect(state.nomineeIds).not.toContain('p2')
    // We should still have two nominees after AI picks a replacement
    expect(state.nomineeIds).toHaveLength(2)
    // povSavedId remains set after AI picks replacement so the UI can
    // detect "veto was used" and show the replacement animation.
    // It is cleared at week_start.
    expect(state.povSavedId).toBe('p2')
  })

  it('AI replacement does not include p2 even after removal from nomineeIds', () => {
    const store = makeAiHohReplacementStore()
    store.dispatch(submitPovSaveTarget('p2'))
    const state = store.getState().game
    // p2 was saved and must remain out of the nominee list
    expect(state.nomineeIds).not.toContain('p2')
    // p3 remains on the block (was the other original nominee)
    expect(state.nomineeIds).toContain('p3')
  })
})
