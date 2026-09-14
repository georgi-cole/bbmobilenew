import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, prepareLohBackdoorTest } from '../gameSlice'

describe('prepareLohBackdoorTest', () => {
  it('seeds a clean, deterministic pre-ceremony Ambush scenario', () => {
    const initial = createInitialGameState({ seed: 1490 })
    const state = gameReducer(initial, prepareLohBackdoorTest())
    const human = state.players.find((player) => player.isUser)
    const plan = state.lohNominationPlan

    expect(state.phase).toBe('pos_ceremony')
    expect(state.publicModeEnabled).toBe(false)
    expect(state.lohId).toBeTruthy()
    expect(state.posWinnerId).toBe(human?.id)
    expect(state.nomineeIds).toHaveLength(2)
    expect(plan?.strategy).toBe('backdoor')
    expect(plan?.status).toBe('planned')
    expect(plan?.targetId).toBeTruthy()
    expect(plan?.initialNomineeIds).toEqual(state.nomineeIds)
    expect(state.nomineeIds).not.toContain(plan?.targetId)
    expect(state.specialVeto?.activeType).toBeNull()
    expect(state.replacementNeeded).toBe(false)
    expect(state.povSavedId).toBeNull()
  })

  it('does not alter a cast that cannot support the scenario', () => {
    const initial = createInitialGameState({ seed: 1491 })
    initial.players = initial.players.filter((player) => player.isUser)

    const state = gameReducer(initial, prepareLohBackdoorTest())

    expect(state.phase).toBe(initial.phase)
    expect(state.lohNominationPlan).toBe(initial.lohNominationPlan)
  })
})
