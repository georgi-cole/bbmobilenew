import { describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import gameReducer, {
  advance,
  createInitialGameState,
  finalizePendingEviction,
  getNominationTargetScore,
} from '../gameSlice'
import { withLohNominationPlanning } from '../lohNominationPlanning'
import { withImmediateVoxPublicMode } from '../voxPublicModeReducer'

const criticalGameReducer = withImmediateVoxPublicMode(
  withLohNominationPlanning(gameReducer, getNominationTargetScore)
)

function sorted(ids: readonly string[]): string[] {
  return [...ids].sort()
}

function nominatedStatusIds(state: GameState): string[] {
  return state.players
    .filter((player) => player.status.split('+').includes('nominated'))
    .map((player) => player.id)
    .sort()
}

function resetToCleanClassicCycle(state: GameState): void {
  state.players.forEach((player) => {
    if (player.status !== 'evicted' && player.status !== 'jury') player.status = 'active'
  })
  state.nomineeIds = []
  state.currentWeekNominationRecord = null
  state.lohNominationPlan = null
  state.lohSocialPlan = null
  state.nominationContext = null
  state.awaitingNominations = false
  state.pendingNominee1Id = null
  state.awaitingPublicSave = false
  state.publicSavedNomineeId = null
  state.posWinnerId = null
  state.povSavedId = null
  state.povProtectedIds = []
  state.replacementNomineeIds = []
  state.awaitingPovDecision = false
  state.awaitingPovSaveTarget = false
  state.awaitingHumanVote = false
  state.awaitingTieBreak = false
  state.tiedNomineeIds = null
  state.pendingEviction = null
  state.voteResults = null
  state.votes = {}
  state.coLohIds = null
  state.awaitingCoLohNomination = false
  state.coLohNomineeByCoLohId = null
  state.coLohReplacementOwnerId = null
  state.awaitingPosTieBreak = false
  state.twistActive = false
  state.twistActivatedThisWeek = false
  state.dayStartShock = null
  state.depressionShock = null
  if (state.doubleEviction) {
    state.doubleEviction.weekActive = false
    state.doubleEviction.pendingSecondEviction = null
  }
}

function makeAiNominationState(seed: number, publicModeEnabled: boolean): GameState {
  const state = createInitialGameState({ seed })
  resetToCleanClassicCycle(state)
  state.week = 3
  state.phase = 'nominations'
  state.publicModeEnabled = publicModeEnabled
  state.pendingPublicModeEnabled = null

  const loh = state.players.find((player) => !player.isUser)
  if (!loh) throw new Error('Expected at least one AI player')
  state.lohId = loh.id
  loh.status = 'loh'

  if (publicModeEnabled) {
    const lastPlace = state.players.find(
      (player) => player.id !== loh.id && player.status !== 'evicted' && player.status !== 'jury'
    )
    if (!lastPlace) throw new Error('Expected an eligible last-place player')
    state.lastHohCompFinisherId = lastPlace.id
    state.lastHohCompFinisherType = 'scored'
  } else {
    state.lastHohCompFinisherId = null
    state.lastHohCompFinisherType = null
  }

  return state
}

function assertNominationContract(state: GameState): void {
  const authoritativeIds = sorted(state.nomineeIds)
  expect(authoritativeIds.length).toBeGreaterThanOrEqual(2)
  expect(new Set(authoritativeIds).size).toBe(authoritativeIds.length)

  // The roster status model must describe exactly the same block.
  expect(nominatedStatusIds(state)).toEqual(authoritativeIds)

  // The persisted weekly record must describe exactly the same block.
  expect(sorted(state.currentWeekNominationRecord?.nomineeIds ?? [])).toEqual(authoritativeIds)

  // The TV announcement must name every authoritative nominee.
  const nominationEvent = state.tvFeed.find((event) =>
    /have been nominated for elimination/i.test(event.text)
  )
  expect(nominationEvent).toBeDefined()
  for (const nomineeId of authoritativeIds) {
    const nominee = state.players.find((player) => player.id === nomineeId)
    expect(nominee).toBeDefined()
    expect(nominationEvent?.text).toContain(nominee!.name)
  }
}

describe('critical nomination and eviction engine integrity', () => {
  it('keeps Classic AI nominations atomic across many seeds when Public Mode is off', () => {
    for (let seed = 1; seed <= 32; seed += 1) {
      const initial = makeAiNominationState(seed, false)

      // Production creates the strategic LOH plan before the nomination result.
      const planned = criticalGameReducer(initial, { type: 'integrity/establish-plan' })
      expect(planned.lohNominationPlan).not.toBeNull()

      const result = criticalGameReducer(planned, advance())

      expect(result.phase).toBe('nomination_results')
      assertNominationContract(result)
      expect(result.lohNominationPlan?.status).toBe('initial_block_set')
      expect(sorted(result.lohNominationPlan?.initialNomineeIds ?? [])).toEqual(
        sorted(result.nomineeIds)
      )
    }
  })

  it('keeps Public Mode nominations internally consistent without consuming the Classic plan', () => {
    for (let seed = 101; seed <= 116; seed += 1) {
      const initial = makeAiNominationState(seed, true)
      const automaticNomineeId = initial.lastHohCompFinisherId
      const planned = criticalGameReducer(initial, { type: 'integrity/prepare-public-mode' })

      expect(planned.lohNominationPlan).toBeNull()

      const result = criticalGameReducer(planned, advance())

      expect(result.phase).toBe('nomination_results')
      assertNominationContract(result)
      expect(result.nomineeIds).toHaveLength(3)
      expect(result.nomineeIds).toContain(automaticNomineeId)
      expect(result.nominationContext?.autoNomineeId).toBe(automaticNomineeId)
    }
  })

  it('never resolves a standard eviction outside the current nomination block', () => {
    for (let seed = 201; seed <= 216; seed += 1) {
      const state = createInitialGameState({ seed })
      resetToCleanClassicCycle(state)
      state.week = 5
      state.phase = 'live_vote'
      state.publicModeEnabled = false
      state.pendingPublicModeEnabled = null

      const activePlayers = state.players.filter(
        (player) => player.status !== 'evicted' && player.status !== 'jury'
      )
      const loh = activePlayers.find((player) => !player.isUser)
      if (!loh) throw new Error('Expected an AI LOH')
      state.lohId = loh.id
      loh.status = 'loh'

      const nominees = activePlayers.filter((player) => player.id !== loh.id).slice(0, 2)
      if (nominees.length !== 2) throw new Error('Expected two nominees')
      nominees.forEach((nominee) => {
        nominee.status = 'nominated'
      })
      state.nomineeIds = nominees.map((nominee) => nominee.id)

      const voters = activePlayers.filter(
        (player) => player.id !== loh.id && !state.nomineeIds.includes(player.id)
      )
      const expectedEvicteeId = nominees[seed % 2].id
      const otherNomineeId = nominees.find((nominee) => nominee.id !== expectedEvicteeId)!.id
      voters.forEach((voter, index) => {
        state.votes[voter.id] = index === voters.length - 1 ? otherNomineeId : expectedEvicteeId
      })

      const resolved = criticalGameReducer(state, advance())

      expect(resolved.phase).toBe('eviction_results')
      expect(resolved.pendingEviction?.evicteeId).toBe(expectedEvicteeId)
      expect(state.nomineeIds).toContain(resolved.pendingEviction!.evicteeId)
      expect(resolved.pendingExitContext?.nomineeIds).toEqual(state.nomineeIds)
      expect(resolved.voteResults?.[expectedEvicteeId]).toBeGreaterThan(
        resolved.voteResults?.[otherNomineeId] ?? -1
      )

      const finalized = criticalGameReducer(
        resolved,
        finalizePendingEviction(resolved.pendingEviction!.evicteeId)
      )
      const evictee = finalized.players.find((player) => player.id === expectedEvicteeId)
      const survivor = finalized.players.find((player) => player.id === otherNomineeId)

      expect(['evicted', 'jury']).toContain(evictee?.status)
      expect(['evicted', 'jury']).not.toContain(survivor?.status)
      expect(finalized.pendingEviction).toBeNull()
      expect(finalized.nomineeIds).toEqual([])
    }
  })
})
