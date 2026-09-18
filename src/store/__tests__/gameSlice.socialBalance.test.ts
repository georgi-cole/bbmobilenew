import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  chooseAiEvictionVote,
  createInitialGameState,
  getNominationTargetScore,
  getSafetyRelationshipScore,
} from '../gameSlice'

describe('early Reality Mode player balance', () => {
  it('does not make a socially neutral human the automatic early eviction', () => {
    const state = createInitialGameState()
    const human = state.players.find((player) => player.isUser)!
    const aiNominee = state.players.find((player) => !player.isUser)!
    const voter = state.players.find((player) => !player.isUser && player.id !== aiNominee.id)!
    state.week = 2
    state.nomineeIds = [human.id, aiNominee.id]
    human.status = 'nominated'
    aiNominee.status = 'nominated'
    state.strategicRelationships = {
      [voter.id]: {
        [human.id]: { affinity: 0, tags: [] },
        [aiNominee.id]: { affinity: 0, tags: [] },
      },
    }

    expect(chooseAiEvictionVote(state, voter.id, [human.id, aiNominee.id], 42)).toBe(aiNominee.id)
  })

  it('still allows genuine hostility to override the early-game grace', () => {
    const state = createInitialGameState()
    const human = state.players.find((player) => player.isUser)!
    const aiNominee = state.players.find((player) => !player.isUser)!
    const voter = state.players.find((player) => !player.isUser && player.id !== aiNominee.id)!
    state.week = 2
    state.nomineeIds = [human.id, aiNominee.id]
    human.status = 'nominated'
    aiNominee.status = 'nominated'
    state.strategicRelationships = {
      [voter.id]: {
        [human.id]: { affinity: -20, tags: ['target'] },
        [aiNominee.id]: { affinity: 15, tags: [] },
      },
    }

    expect(chooseAiEvictionVote(state, voter.id, [human.id, aiNominee.id], 42)).toBe(human.id)
  })

  it('scores a neutral human exactly like an equivalent AI nomination target on Days 1-3', () => {
    const state = createInitialGameState()
    const human = state.players.find((player) => player.isUser)!
    const loh = state.players.find((player) => !player.isUser)!
    const ai = state.players.find((player) => !player.isUser && player.id !== loh.id)!

    human.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
    ai.stats = { lohWins: 0, posWins: 0, timesNominated: 0 }
    human.competitionProfile = undefined
    ai.competitionProfile = undefined
    state.strategicRelationships = {
      [loh.id]: {
        [human.id]: { affinity: 0, tags: [] },
        [ai.id]: { affinity: 0, tags: [] },
      },
    }

    for (const week of [1, 2, 3]) {
      state.week = week
      expect(getNominationTargetScore(state, loh.id, human)).toBe(
        getNominationTargetScore(state, loh.id, ai)
      )
    }
  })

  it('treats prior nomination as a moderate revenge motive that alliances can override', () => {
    const state = createInitialGameState()
    const newLoh = state.players.find((player) => player.isUser)!
    const priorLoh = state.players.find((player) => !player.isUser)!
    state.week = 2

    const neutralScore = getNominationTargetScore(state, newLoh.id, priorLoh)
    state.lastWeekNominationRecord = {
      week: 1,
      lohId: priorLoh.id,
      nomineeIds: [newLoh.id],
    }
    const revengeScore = getNominationTargetScore(state, newLoh.id, priorLoh)
    expect(revengeScore - neutralScore).toBe(32)

    state.strategicRelationships = {
      [newLoh.id]: {
        [priorLoh.id]: { affinity: 0, tags: ['alliance'] },
      },
    }
    expect(getNominationTargetScore(state, newLoh.id, priorLoh)).toBeLessThan(neutralScore)
  })

  it('does not turn chronic competition weakness into a Safety-save reward', () => {
    const state = createInitialGameState()
    const holder = state.players.find((player) => !player.isUser)!
    const human = state.players.find((player) => player.isUser)!
    const neutral = state.players.find((player) => !player.isUser && player.id !== holder.id)!

    state.strategicRelationships = {
      [holder.id]: {
        [human.id]: { affinity: 0, tags: [] },
        [neutral.id]: { affinity: 0, tags: [] },
      },
    }
    state.competitionSeasonStateByPlayerId = {
      ...(state.competitionSeasonStateByPlayerId ?? {}),
      [human.id]: {
        form: -2,
        confidence: -1,
        fatigue: 2,
        observedStrength: 14,
        recentBottomStreak: 4,
        sandbagSuspicion: 17,
        performanceSamples: 4,
        peakRelativePerformance: 50,
      },
      [neutral.id]: {
        form: 0,
        confidence: 0,
        fatigue: 0,
        observedStrength: 50,
        recentBottomStreak: 0,
        sandbagSuspicion: 0,
        performanceSamples: 2,
        peakRelativePerformance: 50,
      },
    }

    expect(getSafetyRelationshipScore(state, holder.id, human)).toBeLessThan(
      getSafetyRelationshipScore(state, holder.id, neutral)
    )
  })

  it('archives the original nomination ceremony at the next week start', () => {
    const state = createInitialGameState()
    const loh = state.players.find((player) => !player.isUser)!
    const nominee = state.players.find((player) => player.id !== loh.id)!
    state.phase = 'week_end'
    state.lohId = loh.id
    state.currentWeekNominationRecord = {
      week: 1,
      lohId: loh.id,
      nomineeIds: [nominee.id],
    }

    const next = gameReducer(state, advance())

    expect(next.lastWeekNominationRecord).toEqual({
      week: 1,
      lohId: loh.id,
      nomineeIds: [nominee.id],
    })
    expect(next.currentWeekNominationRecord).toBeNull()
  })
})
