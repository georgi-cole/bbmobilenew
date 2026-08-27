import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, prepareClassicFinalThreeTest } from '../gameSlice'

describe('prepareClassicFinalThreeTest', () => {
  it('keeps the human and exactly two AI finalists in a clean Classic Final Three', () => {
    const initial = createInitialGameState({ seed: 811 })
    initial.lohId = initial.players[2].id
    initial.posWinnerId = initial.players[3].id
    initial.nomineeIds = [initial.players[4].id, initial.players[5].id]
    initial.awaitingHumanVote = true
    initial.voteResults = { stale: 1 }

    const state = gameReducer(initial, prepareClassicFinalThreeTest())
    const finalists = state.players.filter((player) => player.status === 'active')
    const tribunal = state.players.filter((player) => player.status === 'jury')

    expect(state.phase).toBe('final3')
    expect(finalists).toHaveLength(3)
    expect(finalists.some((player) => player.isUser)).toBe(true)
    expect(tribunal).toHaveLength(state.players.length - 3)
    expect(state.lohId).toBeNull()
    expect(state.posWinnerId).toBeNull()
    expect(state.nomineeIds).toEqual([])
    expect(state.awaitingHumanVote).toBe(false)
    expect(state.voteResults).toBeNull()
    expect(state.tvFeed).toHaveLength(1)
    expect(state.tvFeed[0].meta?.major).toBe('final3_announcement')
  })

  it('does nothing while Vox Populi is active', () => {
    const initial = createInitialGameState({ seed: 812 })
    if (!initial.voxPopuli) throw new Error('Expected Vox Populi state')
    initial.voxPopuli.status = 'active'

    const state = gameReducer(initial, prepareClassicFinalThreeTest())

    expect(state.phase).toBe(initial.phase)
    expect(state.players.filter((player) => player.status === 'active')).toHaveLength(
      initial.players.filter((player) => player.status === 'active').length
    )
  })
})
