import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  chooseAiEvictionVote,
  createInitialGameState,
  getNominationTargetScore,
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
