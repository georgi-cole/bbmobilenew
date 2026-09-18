import { describe, expect, it } from 'vitest'
import type { GameState } from '../../types'
import gameReducer, {
  advance,
  commitNominees,
  createInitialGameState,
  finalizePendingEviction,
  getNominationTargetScore,
  submitHumanVote,
  submitTieBreak,
} from '../gameSlice'
import { withLohNominationPlanning } from '../lohNominationPlanning'
import { withImmediateVoxPublicMode } from '../voxPublicModeReducer'
import { createInitialVoxPopuliState } from '../../features/twists/voxPopuli'

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

  it('enforces Classic voter eligibility: LOH and current nominees never cast eviction ballots', () => {
    for (let seed = 301; seed <= 316; seed += 1) {
      const state = createInitialGameState({ seed })
      resetToCleanClassicCycle(state)
      state.week = 4
      state.phase = 'social_2'
      state.publicModeEnabled = false
      state.pendingPublicModeEnabled = null

      const humanLoh = state.players.find((player) => player.isUser)
      if (!humanLoh) throw new Error('Expected a human player')
      state.lohId = humanLoh.id
      humanLoh.status = 'loh'

      const nominees = state.players.filter((player) => player.id !== humanLoh.id).slice(0, 2)
      if (nominees.length !== 2) throw new Error('Expected two nominees')
      state.nomineeIds = nominees.map((player) => player.id)

      // Deliberately leave one nominee's status stale/active. Vote eligibility must
      // follow the authoritative block, not presentation status.
      nominees[0].status = 'nominated'
      nominees[1].status = 'active'

      const result = criticalGameReducer(state, advance())

      expect(result.phase).toBe('live_vote')
      expect(result.awaitingHumanVote).toBe(false)

      const eligibleVoterIds = result.players
        .filter(
          (player) =>
            player.status !== 'evicted' &&
            player.status !== 'jury' &&
            player.id !== humanLoh.id &&
            !result.nomineeIds.includes(player.id)
        )
        .map((player) => player.id)
        .sort()

      expect(Object.keys(result.votes).sort()).toEqual(eligibleVoterIds)
      expect(result.votes[humanLoh.id]).toBeUndefined()
      for (const nominee of nominees) {
        expect(result.votes[nominee.id]).toBeUndefined()
      }
    }
  })

  it('rejects forged Classic human votes from an LOH or a current nominee', () => {
    const state = createInitialGameState({ seed: 333 })
    resetToCleanClassicCycle(state)
    state.week = 4
    state.phase = 'live_vote'
    state.publicModeEnabled = false

    const human = state.players.find((player) => player.isUser)
    if (!human) throw new Error('Expected a human player')
    const targets = state.players.filter((player) => !player.isUser).slice(0, 2)
    state.nomineeIds = targets.map((player) => player.id)
    targets.forEach((player) => {
      player.status = 'nominated'
    })

    // Even if a stale UI flag incorrectly asks the LOH to vote, the reducer must refuse it.
    state.lohId = human.id
    human.status = 'loh'
    state.awaitingHumanVote = true
    const lohAttempt = criticalGameReducer(state, submitHumanVote(targets[0].id))
    expect(lohAttempt.votes[human.id]).toBeUndefined()
    expect(lohAttempt.awaitingHumanVote).toBe(true)

    // Same hard guard for a player who is on the block at the moment of the vote.
    const nomineeState = {
      ...lohAttempt,
      lohId: state.players.find((player) => !player.isUser && !state.nomineeIds.includes(player.id))
        ?.id,
      players: lohAttempt.players.map((player) =>
        player.id === human.id ? { ...player, status: 'nominated' as const } : player
      ),
      nomineeIds: [human.id, targets[0].id],
      awaitingHumanVote: true,
      votes: {},
    } as GameState
    const nomineeAttempt = criticalGameReducer(
      nomineeState,
      submitHumanVote(nomineeState.nomineeIds[1])
    )
    expect(nomineeAttempt.votes[human.id]).toBeUndefined()
    expect(nomineeAttempt.awaitingHumanVote).toBe(true)
  })

  it('allows the Classic LOH to decide an eviction only as a tie-break', () => {
    const state = createInitialGameState({ seed: 350 })
    resetToCleanClassicCycle(state)
    state.week = 5
    state.phase = 'live_vote'
    state.publicModeEnabled = false

    const humanLoh = state.players.find((player) => player.isUser)
    if (!humanLoh) throw new Error('Expected a human player')
    state.lohId = humanLoh.id
    humanLoh.status = 'loh'

    const nominees = state.players.filter((player) => player.id !== humanLoh.id).slice(0, 2)
    state.nomineeIds = nominees.map((player) => player.id)
    nominees.forEach((player) => {
      player.status = 'nominated'
    })

    const voters = state.players.filter(
      (player) =>
        player.status !== 'evicted' &&
        player.status !== 'jury' &&
        player.id !== humanLoh.id &&
        !state.nomineeIds.includes(player.id)
    )
    const half = Math.floor(voters.length / 2)
    const tiedVoters = voters.slice(0, half * 2)
    tiedVoters.forEach((voter, index) => {
      state.votes[voter.id] = nominees[index % 2].id
    })

    expect(state.votes[humanLoh.id]).toBeUndefined()

    const tied = criticalGameReducer(state, advance())
    expect(tied.phase).toBe('eviction_results')
    expect(tied.awaitingTieBreak).toBe(true)
    expect(new Set(tied.tiedNomineeIds)).toEqual(new Set(state.nomineeIds))
    expect(tied.pendingEviction).toBeNull()

    const decided = criticalGameReducer(tied, submitTieBreak(nominees[0].id))
    expect(decided.awaitingTieBreak).toBe(false)
    expect(decided.pendingEviction?.evicteeId).toBe(nominees[0].id)
    expect(decided.pendingEviction?.evictionMessage).toContain('breaks the tie')
  })

  it('gives every active Vox housemate a nomination ballot, including the Final 4 auto-nominee', () => {
    const state = createInitialGameState({ seed: 401 })
    resetToCleanClassicCycle(state)
    const finalists = state.players.slice(0, 4)
    const finalistIds = new Set(finalists.map((player) => player.id))
    state.players.forEach((player) => {
      player.status = finalistIds.has(player.id) ? 'active' : 'evicted'
    })

    state.week = 8
    state.phase = 'nominations'
    state.lohId = null
    state.voxPopuli = {
      ...createInitialVoxPopuliState(state.season),
      status: 'active',
      activatedSeason: state.season,
      autoNomineeId: finalists[1].id,
    }
    state.lastHohCompFinisherId = finalists[1].id

    let result = criticalGameReducer(state, advance())
    expect(result.phase).toBe('nomination_results')
    expect(result.awaitingNominations).toBe(true)

    const activeIds = finalists.map((player) => player.id).sort()
    const aiFinalistIds = finalists.filter((player) => !player.isUser).map((player) => player.id)
    expect(Object.keys(result.voxPopuli?.nominationBallots ?? {}).sort()).toEqual(
      aiFinalistIds.sort()
    )
    expect(result.voxPopuli?.nominationBallots[finalists[1].id]).toHaveLength(1)

    const human = finalists.find((player) => player.isUser)
    if (!human) throw new Error('Expected the human in the Final 4')
    const humanChoice = finalists.find(
      (player) => player.id !== human.id && player.id !== state.lastHohCompFinisherId
    )
    if (!humanChoice) throw new Error('Expected an eligible Vox nomination target')

    result = criticalGameReducer(result, commitNominees([humanChoice.id]))

    expect(result.awaitingNominations).toBe(false)
    expect(Object.keys(result.voxPopuli?.nominationBallots ?? {}).sort()).toEqual(activeIds)
    for (const voterId of activeIds) {
      const ballot = result.voxPopuli?.nominationBallots[voterId]
      expect(ballot).toHaveLength(1)
      expect(ballot?.[0]).not.toBe(voterId)
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
