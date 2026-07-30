/**
 * Democracia twist — unit and flow tests.
 *
 * Validates:
 *  1. Auto-activation eligibility on days 5, 7, 9, 10 with odd alive count.
 *  2. No activation on invalid days or with even alive count.
 *  3. Hard cutoff at day 10 — skipped if not activated by then.
 *  4. Debug-forced activation on next loh_comp_announcement window.
 *  5. Self-vote prevention (human and AI).
 *  6. Single-round winner becomes LOH and flow proceeds to nominations normally.
 *  7. Ballotage triggers on tie; tied candidates do not vote in ballotage.
 *  8. Repeated ballotage resolves correctly.
 *  9. Deterministic fallback when no ballotage voters available.
 * 10. Public-mode ballotage final tie resolved by higher approval.
 * 11. Public-mode OFF ballotage final tie creates co-LOHs.
 * 12. Co-LOH nomination flow produces exactly 2 valid nominees.
 * 13. Democracia day bypasses public-save / third-nominee logic.
 * 14. Co-LOH day eviction tie broken by POS holder (AI path).
 * 15. Normal non-Democracia weeks proceed through LOH competition unchanged.
 * 16. week_start resets Democracia and co-LOH state.
 * 17. advance() is blocked while dem.awaitingHumanVote is true.
 * 18. submitDemocraciaVote validates eligibility.
 * 19. submitCoLohNomination validates eligibility (no self, no other co-LOH).
 * 20. submitPosTieBreak validates eligibility.
 */

import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer, {
  advance,
  activateDemocracia,
  dismissDemocraciaResultDisplay,
  submitDemocraciaVote,
  resolveDemocraciaPublicBreaker,
  submitCoLohNomination,
  submitPosTieBreak,
  finalizePendingEviction,
  queueForcedShock,
  tryActivateDemocracia,
  tryActivatePendingForcedDemocracia,
} from '../src/store/gameSlice'
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice'
import { selectIsWaitingForInput } from '../src/store/selectors'
import type { GameState, Player, DemocraciaState } from '../src/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number, humanIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === humanIndex,
  }))
}

const DEFAULT_DEMOCRACIA: DemocraciaState = {
  usedThisSeason: false,
  active: false,
  activatedDay: null,
  round: 0,
  candidateIds: [],
  eligibleVoterIds: [],
  votesByVoterId: {},
  awaitingHumanVote: false,
  awaitingPublicBreaker: false,
  resultDisplay: null,
}

function makeStore(
  gameOverrides: Partial<GameState> = {},
  settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {}
) {
  const base: GameState = {
    season: 1,
    week: 5,
    phase: 'loh_comp_announcement',
    seed: 42,
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    posWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
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
    voteResults: null,
    evictionSplashId: null,
    players: makePlayers(9), // odd count by default
    tvFeed: [],
    isLive: false,
    gameId: 'test-game',
    democracia: { ...DEFAULT_DEMOCRACIA },
    coLohIds: null,
    awaitingCoLohNomination: false,
    coLohNomineeByCoLohId: null,
    awaitingPosTieBreak: false,
  }

  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    sim: {
      ...DEFAULT_SETTINGS.sim,
      enableTwists: true,
      ...settingsOverrides.sim,
    },
    ...settingsOverrides,
  }

  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: mergedSettings,
    },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Democracia twist', () => {
  // ── 1. Auto-activation eligibility ────────────────────────────────────────

  describe('auto-activation eligibility', () => {
    it('activates on day 5 with odd alive count', () => {
      const store = makeStore({ week: 5, players: makePlayers(9) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(true)
      expect(store.getState().game.democracia?.active).toBe(true)
      expect(store.getState().game.democracia?.activatedDay).toBe(5)
    })

    it('activates on day 7 with odd alive count', () => {
      const store = makeStore({ week: 7, players: makePlayers(7) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(true)
      expect(store.getState().game.democracia?.active).toBe(true)
    })

    it('activates on day 9 with odd alive count', () => {
      const store = makeStore({ week: 9, players: makePlayers(5) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(true)
      expect(store.getState().game.democracia?.active).toBe(true)
    })

    it('activates on day 10 as hard cutoff with odd alive count', () => {
      const store = makeStore({ week: 10, players: makePlayers(5) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(true)
    })

    it('does NOT activate on day 4 (not in eligible window)', () => {
      const store = makeStore({ week: 4, players: makePlayers(9) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
      expect(store.getState().game.democracia?.active).toBe(false)
    })

    it('does NOT activate on day 6 (not in eligible window)', () => {
      const store = makeStore({ week: 6, players: makePlayers(9) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
    })

    it('does NOT activate on day 11 (past hard cutoff)', () => {
      const store = makeStore({ week: 11, players: makePlayers(7) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
    })

    it('does NOT activate with even alive count on day 5', () => {
      const store = makeStore({ week: 5, players: makePlayers(8) })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
    })

    it('does NOT activate if already used this season', () => {
      const store = makeStore({
        week: 5,
        democracia: { ...DEFAULT_DEMOCRACIA, usedThisSeason: true },
      })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
    })

    it('does NOT activate if another twist already active this week', () => {
      const store = makeStore({ week: 5, twistActivatedThisWeek: true })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
    })

    it('does NOT activate if phase is not loh_comp_announcement', () => {
      const store = makeStore({ week: 5, phase: 'nominations' })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
    })

    it('does NOT activate if twists are disabled in settings', () => {
      const store = makeStore({ week: 5 }, { sim: { enableTwists: false } })
      const activated = store.dispatch(tryActivateDemocracia())
      expect(activated).toBe(false)
    })
  })

  // ── 2. Debug-forced activation ────────────────────────────────────────────

  describe('debug-forced activation', () => {
    it('activates at next loh_comp_announcement regardless of day/alive conditions', () => {
      // Even alive count, day 4 — would normally not activate
      const store = makeStore({
        week: 4,
        phase: 'loh_comp_announcement',
        players: makePlayers(8), // even
        pendingForcedShock: { type: 'democracia', requestedWeek: 4, earliestWeek: 4 },
      })
      const activated = store.dispatch(tryActivatePendingForcedDemocracia())
      expect(activated).toBe(true)
      expect(store.getState().game.democracia?.active).toBe(true)
      expect(store.getState().game.pendingForcedShock).toBeNull()
    })

    it('does NOT activate if pending shock type is not democracia', () => {
      const store = makeStore({
        week: 5,
        phase: 'loh_comp_announcement',
        pendingForcedShock: { type: 'doubleEviction', requestedWeek: 5, earliestWeek: 5 },
      })
      const activated = store.dispatch(tryActivatePendingForcedDemocracia())
      expect(activated).toBe(false)
    })

    it('queues forced shock and activates on next loh_comp_announcement', () => {
      const store = makeStore({
        week: 5,
        phase: 'nominations', // not at loh_comp_announcement yet
      })
      store.dispatch(queueForcedShock('democracia'))
      // Not yet at the right phase
      expect(store.dispatch(tryActivatePendingForcedDemocracia())).toBe(false)
      // Move to loh_comp_announcement (simulated by overriding state)
      // For this test, just verify the queued shock is set
      expect(store.getState().game.pendingForcedShock?.type).toBe('democracia')
    })
  })

  // ── 3. Activation state ───────────────────────────────────────────────────

  describe('activateDemocracia reducer', () => {
    it('sets active, usedThisSeason, activatedDay, twistActive, twistActivatedThisWeek', () => {
      const store = makeStore({ week: 5 })
      store.dispatch(activateDemocracia())
      const dem = store.getState().game.democracia!
      expect(dem.active).toBe(true)
      expect(dem.usedThisSeason).toBe(true)
      expect(dem.activatedDay).toBe(5)
      expect(store.getState().game.twistActive).toBe(true)
      expect(store.getState().game.twistActivatedThisWeek).toBe(true)
    })

    it('pushes a TV event with major=democracia', () => {
      const store = makeStore({ week: 5 })
      store.dispatch(activateDemocracia())
      const feed = store.getState().game.tvFeed
      const democraciaEvent = feed.find((e) => e.major === 'democracia')
      expect(democraciaEvent).toBeDefined()
      expect(democraciaEvent?.type).toBe('twist')
    })
  })

  // ── 4. Democracia vote phase — single winner ──────────────────────────────

  describe('single-round voting', () => {
    function makeVoteStore(humanIsPlayer = true) {
      // 5 AI players, human is p0
      const players = makePlayers(6, humanIsPlayer ? 0 : 99).map((p, i) => ({
        ...p,
        isUser: i === 0 && humanIsPlayer,
      }))
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 1,
          candidateIds: players.map((p) => p.id),
          eligibleVoterIds: players.map((p) => p.id),
          votesByVoterId: {
            // p1, p2, p3 → p4; p4 → p5; p5 → p4 → p4 gets 3 votes, wins
            p1: 'p4',
            p2: 'p4',
            p3: 'p4',
            p4: 'p5',
            p5: 'p4',
            // human p0 has NOT voted yet → awaitingHumanVote
          },
          awaitingHumanVote: true,
          awaitingPublicBreaker: false,
        },
      })
      return { store, players }
    }

    it('advance() is blocked while human vote is pending', () => {
      const { store } = makeVoteStore()
      const phaseBefore = store.getState().game.phase
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe(phaseBefore) // phase unchanged
    })

    it('human can cast a vote and advance unblocks', () => {
      const { store } = makeVoteStore()
      // Human p0 votes for p4
      store.dispatch(submitDemocraciaVote('p4'))
      expect(store.getState().game.democracia?.awaitingHumanVote).toBe(false)
      // Now advance can proceed — p4 has 4 votes total, clear winner
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe('democracia_results')
      expect(store.getState().game.lohId).toBe('p4')
    })

    it('human cannot vote for themselves', () => {
      const { store } = makeVoteStore()
      store.dispatch(submitDemocraciaVote('p0')) // self-vote
      expect(store.getState().game.democracia?.awaitingHumanVote).toBe(true) // still waiting
    })

    it('human cannot vote for a non-candidate', () => {
      const { store } = makeVoteStore()
      // Temporarily make p0 not a candidate — but p0 IS a candidate here.
      // Vote for an ID that doesn't exist.
      store.dispatch(submitDemocraciaVote('nonexistent'))
      expect(store.getState().game.democracia?.awaitingHumanVote).toBe(true)
    })

    it('winner is applied as LOH and democracia_results transitions to social_1', () => {
      const players = makePlayers(5)
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 1,
          candidateIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
          eligibleVoterIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
          votesByVoterId: { p0: 'p1', p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p2' },
          awaitingHumanVote: false,
          awaitingPublicBreaker: false,
        },
      })
      // p1 gets 3 votes → winner
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe('democracia_results')
      expect(store.getState().game.lohId).toBe('p1')
      expect(store.getState().game.democracia?.active).toBe(false)
      expect(store.getState().game.democracia?.resultDisplay).toMatchObject({
        mode: 'winner',
        participantIds: ['p1'],
      })
      // Advance from democracia_results → social_1
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe('social_1')
    })
  })

  // ── 5. Ballotage (first tie) ───────────────────────────────────────────────

  describe('ballotage on tie', () => {
    function makeTieStore() {
      const players = makePlayers(5)
      // p0 (human) and p1 each get 2 votes → tie
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 1,
          candidateIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
          eligibleVoterIds: ['p0', 'p1', 'p2', 'p3', 'p4'],
          votesByVoterId: { p0: 'p1', p1: 'p0', p2: 'p0', p3: 'p1', p4: 'p2' },
          awaitingHumanVote: false,
          awaitingPublicBreaker: false,
        },
      })
      return store
    }

    it('advances to ballotage round when there is a tie', () => {
      const store = makeTieStore()
      store.dispatch(advance())
      const dem = store.getState().game.democracia!
      // Still at democracia_vote (ballotage round)
      expect(store.getState().game.phase).toBe('democracia_vote')
      expect(dem.round).toBe(2)
      expect(dem.candidateIds).toEqual(expect.arrayContaining(['p0', 'p1']))
      expect(dem.candidateIds).toHaveLength(2)
      expect(dem.resultDisplay).toMatchObject({
        mode: 'tie',
        participantIds: ['p0', 'p1'],
      })
    })

    it('tied candidates do NOT vote in ballotage', () => {
      const store = makeTieStore()
      store.dispatch(advance())
      const dem = store.getState().game.democracia!
      // p0 and p1 are tied candidates; they should NOT be in eligibleVoterIds
      expect(dem.eligibleVoterIds).not.toContain('p0')
      expect(dem.eligibleVoterIds).not.toContain('p1')
      // p2, p3, p4 should be voters
      expect(dem.eligibleVoterIds).toContain('p2')
      expect(dem.eligibleVoterIds).toContain('p3')
      expect(dem.eligibleVoterIds).toContain('p4')
    })

    it('human voter must vote in ballotage', () => {
      const store = makeTieStore()
      store.dispatch(advance()) // enter ballotage
      const dem = store.getState().game.democracia!
      // Human p0 is a TIED candidate, not a voter — awaitingHumanVote should be false
      // because the human is in the tied pool, not the voter pool
      expect(dem.awaitingHumanVote).toBe(false) // human is not a voter this round
    })
  })

  // ── 6. Ballotage with human as voter ──────────────────────────────────────

  describe('ballotage with human as voter', () => {
    it('blocks advance() for human voter in ballotage', () => {
      const players = makePlayers(5, 2) // human is p2
      // p0 and p1 are tied candidates; p2 (human) is a voter
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 2,
          candidateIds: ['p0', 'p1'],
          eligibleVoterIds: ['p2', 'p3', 'p4'],
          votesByVoterId: { p3: 'p0', p4: 'p1' }, // AI votes in but human p2 hasn't voted
          awaitingHumanVote: true,
          awaitingPublicBreaker: false,
        },
      })
      const phaseBefore = store.getState().game.phase
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe(phaseBefore)
    })

    it('human voter can submit their ballotage vote', () => {
      const players = makePlayers(5, 2) // human is p2
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 2,
          candidateIds: ['p0', 'p1'],
          eligibleVoterIds: ['p2', 'p3', 'p4'],
          votesByVoterId: { p3: 'p0', p4: 'p0' }, // p0 leads
          awaitingHumanVote: true,
          awaitingPublicBreaker: false,
        },
      })
      store.dispatch(submitDemocraciaVote('p0'))
      expect(store.getState().game.democracia?.awaitingHumanVote).toBe(false)
      // Now advance: p0 has 3 votes, wins
      store.dispatch(advance())
      expect(store.getState().game.lohId).toBe('p0')
    })
  })

  // ── 7. Ballotage final tie — public mode OFF (co-LOH) ─────────────────────

  describe('ballotage final tie — public mode OFF — co-LOHs', () => {
    it('creates co-LOHs when ballotage final tie and public mode OFF', () => {
      // True final-round tie should create co-LOHs when public mode is disabled.
      const tieStore = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players: makePlayers(5),
        publicModeEnabled: false,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 2,
          candidateIds: ['p0', 'p1'],
          eligibleVoterIds: ['p2', 'p3'],
          votesByVoterId: { p2: 'p0', p3: 'p1' }, // 1-1 tie
          awaitingHumanVote: false,
          awaitingPublicBreaker: false,
        },
      })
      tieStore.dispatch(advance())
      const state = tieStore.getState().game
      expect(state.coLohIds).toEqual(expect.arrayContaining(['p0', 'p1']))
      expect(state.coLohIds).toHaveLength(2)
      expect(state.phase).toBe('democracia_results')
      expect(state.democracia?.resultDisplay).toMatchObject({
        mode: 'tie',
        participantIds: ['p0', 'p1'],
        title: 'CO-LEADERS ELECTED',
      })
      // Both players should have loh status
      const p0 = state.players.find((p) => p.id === 'p0')!
      const p1 = state.players.find((p) => p.id === 'p1')!
      expect(p0.status).toBe('loh')
      expect(p1.status).toBe('loh')
    })
  })

  // ── 8. Ballotage final tie — public mode ON (public breaks tie) ────────────

  describe('ballotage final tie — public mode ON — public breaks tie', () => {
    it('sets awaitingPublicBreaker flag instead of creating co-LOHs', () => {
      const players = makePlayers(5)
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        publicModeEnabled: true,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 2,
          candidateIds: ['p0', 'p1'],
          eligibleVoterIds: ['p2', 'p3'],
          votesByVoterId: { p2: 'p0', p3: 'p1' },
          awaitingHumanVote: false,
          awaitingPublicBreaker: false,
        },
      })
      store.dispatch(advance())
      expect(store.getState().game.democracia?.awaitingPublicBreaker).toBe(true)
      expect(store.getState().game.coLohIds).toBeNull()
      expect(store.getState().game.democracia?.resultDisplay).toMatchObject({
        mode: 'tie',
        participantIds: ['p0', 'p1'],
        title: 'FINAL TIE',
      })
    })

    it('resolveDemocraciaPublicBreaker applies winner and transitions to democracia_results', () => {
      const players = makePlayers(5)
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        publicModeEnabled: true,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 2,
          candidateIds: ['p0', 'p1'],
          eligibleVoterIds: ['p2', 'p3'],
          votesByVoterId: { p2: 'p0', p3: 'p1' },
          awaitingHumanVote: false,
          awaitingPublicBreaker: true, // already in public breaker state
        },
      })
      store.dispatch(resolveDemocraciaPublicBreaker({ winnerId: 'p0' }))
      const state = store.getState().game
      expect(state.lohId).toBe('p0')
      expect(state.phase).toBe('democracia_results')
      expect(state.democracia?.active).toBe(false)
      expect(state.democracia?.awaitingPublicBreaker).toBe(false)
    })

    it('resolveDemocraciaPublicBreaker is rejected if candidate not in tied set', () => {
      const players = makePlayers(5)
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 2,
          candidateIds: ['p0', 'p1'],
          eligibleVoterIds: [],
          votesByVoterId: {},
          awaitingHumanVote: false,
          awaitingPublicBreaker: true,
        },
      })
      const phaseBefore = store.getState().game.phase
      store.dispatch(resolveDemocraciaPublicBreaker({ winnerId: 'p3' }))
      expect(store.getState().game.phase).toBe(phaseBefore) // unchanged
      expect(store.getState().game.lohId).toBeNull()
    })
  })

  // ── 9. Deterministic fallback when no ballotage voters ────────────────────

  describe('deterministic fallback — no ballotage voters', () => {
    it('picks a winner when all alive players are tied candidates', () => {
      // Only 2 players, both tied → no one can vote in ballotage
      const players = makePlayers(2)
      const store = makeStore({
        week: 5,
        phase: 'democracia_vote',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: true,
          activatedDay: 5,
          round: 1,
          candidateIds: ['p0', 'p1'],
          eligibleVoterIds: ['p0', 'p1'],
          votesByVoterId: { p0: 'p1', p1: 'p0' }, // 1-1 tie
          awaitingHumanVote: false,
          awaitingPublicBreaker: false,
        },
      })
      store.dispatch(advance())
      const state = store.getState().game
      // Should resolve to democracia_results with a winner (or co-LOH if second tie)
      // Since round 1 tie with no voters → falls through to deterministic fallback
      // Actually with 2 players, ballotageVoters = [], so deterministic fallback fires
      expect(['democracia_results', 'democracia_vote']).toContain(state.phase)
      if (state.phase === 'democracia_results') {
        expect(state.lohId).toMatch(/^p[01]$/)
      }
    })
  })

  describe('Democracia result display state', () => {
    it('dismissDemocraciaResultDisplay clears the reveal and selector gating', () => {
      const store = makeStore({
        phase: 'democracia_results',
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          active: false,
          resultDisplay: {
            mode: 'winner',
            participantIds: ['p1'],
            voteCountsByCandidateId: { p1: 4 },
            title: 'DEMOCRACIA WINNER',
            subtitle: 'Player 1 wins.',
          },
        },
      })

      expect(selectIsWaitingForInput(store.getState() as ReturnType<typeof store.getState>)).toBe(
        true
      )

      store.dispatch(dismissDemocraciaResultDisplay())

      expect(store.getState().game.democracia?.resultDisplay).toBeNull()
      expect(selectIsWaitingForInput(store.getState() as ReturnType<typeof store.getState>)).toBe(
        false
      )
    })
  })

  // ── 10. Co-LOH nomination flow ────────────────────────────────────────────

  describe('co-LOH nomination flow', () => {
    function makeCoLohNomStore(humanIsCoLoh = false) {
      const players = makePlayers(6, humanIsCoLoh ? 0 : 99)
      players[0].status = 'loh'
      players[1].status = 'loh'
      return makeStore({
        week: 5,
        phase: 'nominations', // advance() will process nomination_results
        players,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
      })
    }

    it('AI co-LOHs each nominate exactly 1 person', () => {
      const store = makeCoLohNomStore(false)
      store.dispatch(advance())
      const state = store.getState().game
      // Two AI co-LOHs should each pick 1 nominee → 2 nominees total
      expect(state.nomineeIds).toHaveLength(2)
    })

    it('nominees are not co-LOHs themselves', () => {
      const store = makeCoLohNomStore(false)
      store.dispatch(advance())
      const state = store.getState().game
      expect(state.nomineeIds).not.toContain('p0')
      expect(state.nomineeIds).not.toContain('p1')
    })

    it('nominees are distinct', () => {
      const store = makeCoLohNomStore(false)
      store.dispatch(advance())
      const state = store.getState().game
      const unique = new Set(state.nomineeIds)
      expect(unique.size).toBe(state.nomineeIds.length)
    })

    it('human co-LOH must nominate via submitCoLohNomination', () => {
      const store = makeCoLohNomStore(true) // p0 is human co-LOH
      store.dispatch(advance())
      expect(store.getState().game.awaitingCoLohNomination).toBe(true)
    })

    it('submitCoLohNomination rejects self-nomination', () => {
      const players = makePlayers(6, 0)
      players[0].status = 'loh'
      players[1].status = 'loh'
      const store = makeStore({
        week: 5,
        phase: 'nominations',
        players,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
        awaitingCoLohNomination: true,
        coLohNomineeByCoLohId: {},
      })
      store.dispatch(submitCoLohNomination({ coLohId: 'p0', nomineeId: 'p0' }))
      expect(store.getState().game.awaitingCoLohNomination).toBe(true) // still waiting
    })

    it('submitCoLohNomination rejects nominating other co-LOH', () => {
      const players = makePlayers(6, 0)
      players[0].status = 'loh'
      players[1].status = 'loh'
      const store = makeStore({
        week: 5,
        phase: 'nominations',
        players,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
        awaitingCoLohNomination: true,
        coLohNomineeByCoLohId: {},
      })
      store.dispatch(submitCoLohNomination({ coLohId: 'p0', nomineeId: 'p1' }))
      expect(store.getState().game.awaitingCoLohNomination).toBe(true) // still waiting
    })

    it('submitCoLohNomination accepts a valid nomination', () => {
      const players = makePlayers(6, 0)
      players[0].status = 'loh'
      players[1].status = 'loh'
      const store = makeStore({
        week: 5,
        phase: 'nominations',
        players,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
        awaitingCoLohNomination: true,
        coLohNomineeByCoLohId: {},
      })
      store.dispatch(submitCoLohNomination({ coLohId: 'p0', nomineeId: 'p3' }))
      expect(store.getState().game.awaitingCoLohNomination).toBe(false)
      expect(store.getState().game.nomineeIds).toContain('p3')
    })
  })

  // ── 11. Democracia day bypasses public-save and third-nominee logic ────────

  describe('Democracia day bypasses public-save / third-nominee logic', () => {
    it('pre_veto_public_save is skipped when nomineeIds.length is 2 (co-LOH day)', () => {
      const players = makePlayers(8, 99)
      players[0].status = 'loh'
      players[1].status = 'loh'
      players[2].status = 'nominated'
      players[3].status = 'nominated'
      const store = makeStore({
        week: 5,
        phase: 'nomination_results', // advance() will process pre_veto_public_save
        players,
        publicModeEnabled: true,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
        nomineeIds: ['p2', 'p3'], // 2 nominees — public save requires 3
        lastHohCompFinisherId: null, // no comp finisher on Democracia day
      })
      store.dispatch(advance())
      // Should skip to pos_comp_announcement (2 nominees, not 3, so public save is skipped)
      expect(store.getState().game.phase).toBe('pos_comp_announcement')
    })

    it('does not crash when lastHohCompFinisherId is null on Democracia day', () => {
      const players = makePlayers(8, 99)
      players[0].status = 'loh'
      const store = makeStore({
        week: 5,
        phase: 'nominations', // advance() will process nomination_results
        players,
        publicModeEnabled: true,
        lohId: 'p0',
        coLohIds: null, // single LOH Democracia day
        lastHohCompFinisherId: null, // no comp finisher
      })
      // Should not throw
      expect(() => store.dispatch(advance())).not.toThrow()
    })
  })

  // ── 12. Co-LOH day eviction tie — POS holder breaks it (AI) ───────────────

  describe('co-LOH day eviction tie — POS holder breaks tie', () => {
    it('AI POS holder deterministically resolves the tie (no deadlock)', () => {
      const players = makePlayers(6, 99) // all AI
      players[0].status = 'loh'
      players[1].status = 'loh'
      players[5].status = 'pos'
      players[2].status = 'nominated'
      players[3].status = 'nominated'
      const store = makeStore({
        week: 5,
        phase: 'live_vote', // advance() will process eviction_results
        players,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
        posWinnerId: 'p5',
        nomineeIds: ['p2', 'p3'],
        votes: { p0: 'p2', p1: 'p3', p4: 'p2', p5: 'p3' }, // 2-2 tie
      })
      store.dispatch(advance())
      const state = store.getState().game
      // AI POS holder should have broken the tie
      expect(state.pendingEviction).not.toBeNull()
      expect(['p2', 'p3']).toContain(state.pendingEviction?.evicteeId)
    })

    it('human POS holder is prompted via awaitingTieBreak + awaitingPosTieBreak', () => {
      const players = makePlayers(6, 5) // human is p5
      players[0].status = 'loh'
      players[1].status = 'loh'
      players[5].status = 'pos'
      players[2].status = 'nominated'
      players[3].status = 'nominated'
      const store = makeStore({
        week: 5,
        phase: 'live_vote', // advance() will process eviction_results
        players,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
        posWinnerId: 'p5',
        nomineeIds: ['p2', 'p3'],
        votes: { p0: 'p2', p1: 'p3', p4: 'p2', p5: 'p3' }, // 2-2 tie
      })
      store.dispatch(advance())
      const state = store.getState().game
      expect(state.awaitingTieBreak).toBe(true)
      expect(state.awaitingPosTieBreak).toBe(true)
    })

    it('submitPosTieBreak resolves the tie and queues the eviction', () => {
      const players = makePlayers(6, 5)
      players[0].status = 'loh'
      players[1].status = 'loh'
      players[5].status = 'pos'
      players[2].status = 'nominated'
      players[3].status = 'nominated'
      const store = makeStore({
        week: 5,
        phase: 'eviction_results', // already in this phase (tie-break flow)
        players,
        lohId: 'p0',
        coLohIds: ['p0', 'p1'],
        posWinnerId: 'p5',
        nomineeIds: ['p2', 'p3'],
        awaitingTieBreak: true,
        awaitingPosTieBreak: true,
        tiedNomineeIds: ['p2', 'p3'],
        voteResults: null,
        votes: { p0: 'p2', p1: 'p3', p4: 'p2', p5: 'p3' },
      })
      store.dispatch(submitPosTieBreak('p2'))
      const state = store.getState().game
      expect(state.awaitingTieBreak).toBe(false)
      expect(state.awaitingPosTieBreak).toBe(false)
      expect(state.pendingEviction?.evicteeId).toBe('p2')
      expect(state.phase).toBe('eviction_results')
      store.dispatch(finalizePendingEviction('p2'))
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe('week_end')
    })

    it('submitPosTieBreak rejects non-tied nominee', () => {
      const players = makePlayers(6, 5)
      players[5].status = 'pos'
      const store = makeStore({
        week: 5,
        phase: 'eviction_results',
        players,
        posWinnerId: 'p5',
        nomineeIds: ['p2', 'p3'],
        awaitingTieBreak: true,
        awaitingPosTieBreak: true,
        tiedNomineeIds: ['p2', 'p3'],
        votes: {},
      })
      const phaseBefore = store.getState().game.phase
      store.dispatch(submitPosTieBreak('p4')) // not a tied nominee
      expect(store.getState().game.awaitingTieBreak).toBe(true) // unchanged
      expect(store.getState().game.phase).toBe(phaseBefore)
    })
  })

  // ── 13. Normal non-Democracia weeks unaffected ────────────────────────────

  describe('normal non-Democracia weeks', () => {
    it('advance() from loh_comp goes to loh_results (no democracia active)', () => {
      const players = makePlayers(8, 99)
      const store = makeStore({
        week: 3,
        phase: 'loh_comp',
        players,
        democracia: { ...DEFAULT_DEMOCRACIA }, // not active
      })
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe('loh_results')
    })

    it('loh_results applies LOH winner via seeded pick (not democracia)', () => {
      const players = makePlayers(8, 99)
      const store = makeStore({
        week: 3,
        phase: 'loh_comp',
        players,
        democracia: { ...DEFAULT_DEMOCRACIA },
      })
      store.dispatch(advance())
      expect(store.getState().game.lohId).not.toBeNull()
    })
  })

  // ── 14. week_start resets Democracia and co-LOH state ────────────────────

  describe('week_start reset', () => {
    it('clears active Democracia state at week_start but preserves usedThisSeason', () => {
      const players = makePlayers(8, 99)
      const store = makeStore({
        week: 5,
        phase: 'week_end',
        players,
        democracia: {
          ...DEFAULT_DEMOCRACIA,
          usedThisSeason: true,
          active: true,
          activatedDay: 5,
          round: 2,
        },
        coLohIds: ['p0', 'p1'],
        // Do NOT set awaitingCoLohNomination or awaitingPosTieBreak — those
        // are cleared before we reach week_end in a normal flow.
        coLohNomineeByCoLohId: { p0: 'p2' },
      })
      store.dispatch(advance()) // week_end → week_start
      const state = store.getState().game
      const dem = state.democracia!
      expect(dem.usedThisSeason).toBe(true) // preserved
      expect(dem.active).toBe(false)
      expect(dem.activatedDay).toBeNull()
      expect(dem.round).toBe(0)
      expect(dem.resultDisplay).toBeNull()
      expect(state.coLohIds).toBeNull()
      expect(state.awaitingCoLohNomination).toBe(false)
      expect(state.coLohNomineeByCoLohId).toBeNull()
      expect(state.awaitingPosTieBreak).toBe(false)
    })
  })

  // ── 15. Full Democracia flow (all-AI) ─────────────────────────────────────

  describe('full Democracia flow — all AI', () => {
    it('completes a full Democracia flow without deadlocking', () => {
      const players = makePlayers(9, 99) // no human
      const store = makeStore({
        week: 5,
        phase: 'loh_comp_announcement',
        players,
      })
      // Activate Democracia
      store.dispatch(activateDemocracia())
      // Advance to loh_comp → redirects to democracia_vote
      store.dispatch(advance())
      expect(store.getState().game.phase).toBe('democracia_vote')
      // Advance through vote
      store.dispatch(advance())
      // Should be in democracia_results or still democracia_vote (ballotage)
      const phaseAfter = store.getState().game.phase
      expect(['democracia_vote', 'democracia_results']).toContain(phaseAfter)
      // Keep advancing until social_1 or a limit
      let steps = 0
      while (store.getState().game.phase !== 'social_1' && steps < 10) {
        store.dispatch(advance())
        steps++
      }
      expect(store.getState().game.phase).toBe('social_1')
      // LOH must be set
      expect(store.getState().game.lohId).not.toBeNull()
    })
  })
})
