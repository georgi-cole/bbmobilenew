import type { Reducer, UnknownAction } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import gameReducer, { getNominationTargetScore } from '../gameSlice'
import { withLohNominationPlanning } from '../lohNominationPlanning'
import type { GameState, Player } from '../../types'

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    isUser: false,
    status: 'active',
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
    ...overrides,
  } as Player
}

describe('AI LOH Ambush Safety pitch', () => {
  it('asks an eligible Safety holder to use the power without resolving the ceremony', () => {
    const initial = gameReducer(undefined, { type: 'test/init' })
    const loh = player('loh', { status: 'loh' })
    const holder = player('holder', { isUser: true, status: 'pos' })
    const target = player('target')
    const pawnA = player('pawn-a', { status: 'nominated' })
    const pawnB = player('pawn-b', { status: 'nominated' })
    const state = {
      ...initial,
      week: 4,
      phase: 'pos_comp' as const,
      lohId: loh.id,
      posWinnerId: holder.id,
      nomineeIds: [pawnA.id, pawnB.id],
      players: [loh, holder, target, pawnA, pawnB],
      lohNominationPlan: {
        week: 4,
        lohId: loh.id,
        targetId: target.id,
        backupTargetId: null,
        pawnIds: [pawnA.id, pawnB.id],
        initialNomineeIds: [pawnA.id, pawnB.id],
        strategy: 'backdoor' as const,
        status: 'initial_block_set' as const,
        selectionBasis: 'strategy' as const,
        targetScore: 80,
        backdoorChance: 0.5,
      },
    } as GameState
    const baseReducer: Reducer<GameState, UnknownAction> = (currentState, action) => {
      const resolvedState = currentState ?? state
      return action.type === 'test/finish-pos'
        ? { ...resolvedState, phase: 'pos_results' }
        : resolvedState
    }
    const reducer = withLohNominationPlanning(baseReducer, getNominationTargetScore)

    const result = reducer(state, { type: 'test/finish-pos' })

    expect(result.lohSafetyAdvice).toMatchObject({
      week: 4,
      lohId: loh.id,
      holderId: holder.id,
      advice: 'use',
      source: 'ai_ambush_pitch',
    })
    expect(result.tvFeed[0]?.text).toContain(`${loh.name} pulled ${holder.name} aside`)
    expect(result.nomineeIds).toEqual([pawnA.id, pawnB.id])
    expect(result.lohNominationPlan?.status).toBe('initial_block_set')
  })

  it('does not pitch when the Ambush target has already won Safety', () => {
    const initial = gameReducer(undefined, { type: 'test/init' })
    const loh = player('loh', { status: 'loh' })
    const target = player('target', { status: 'pos' })
    const pawnA = player('pawn-a', { status: 'nominated' })
    const pawnB = player('pawn-b', { status: 'nominated' })
    const state = {
      ...initial,
      week: 4,
      phase: 'pos_comp' as const,
      lohId: loh.id,
      posWinnerId: target.id,
      nomineeIds: [pawnA.id, pawnB.id],
      players: [loh, target, pawnA, pawnB],
      lohNominationPlan: {
        week: 4,
        lohId: loh.id,
        targetId: target.id,
        backupTargetId: null,
        pawnIds: [pawnA.id, pawnB.id],
        initialNomineeIds: [pawnA.id, pawnB.id],
        strategy: 'backdoor' as const,
        status: 'initial_block_set' as const,
        selectionBasis: 'strategy' as const,
        targetScore: 80,
        backdoorChance: 0.5,
      },
    } as GameState
    const baseReducer: Reducer<GameState, UnknownAction> = (currentState, action) => {
      const resolvedState = currentState ?? state
      return action.type === 'test/finish-pos'
        ? { ...resolvedState, phase: 'pos_results' }
        : resolvedState
    }
    const reducer = withLohNominationPlanning(baseReducer, getNominationTargetScore)

    const result = reducer(state, { type: 'test/finish-pos' })

    expect(result.lohSafetyAdvice).toBeNull()
    expect(result.tvFeed.some((event) => event.meta?.privateSafetyPitch)).toBe(false)
  })
})
