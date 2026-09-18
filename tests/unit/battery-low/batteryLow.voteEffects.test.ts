import { describe, expect, it } from 'vitest'
import gameReducer, {
  createInitialGameState,
  registerBatteryLowVoteEffects,
  submitHumanVote,
} from '../../../src/store/gameSlice'
import { canCastClassicEvictionVote } from '../../../src/store/criticalGameRules'

function makeClassicVoteState() {
  const state = createInitialGameState({ seed: 8412 })
  state.mode = 'classic'
  state.phase = 'live_vote'
  state.doubleEviction = { usedCount: 0, weekActive: false, pendingSecondEviction: null }
  if (state.voxPopuli) state.voxPopuli.status = 'inactive'
  if (state.cupidArrow) state.cupidArrow.status = 'inactive'

  const human = state.players.find((player) => player.isUser)!
  const others = state.players.filter((player) => player.id !== human.id)
  const loh = others[0]!
  const nominees = others.slice(1, 3)

  state.lohId = loh.id
  state.nomineeIds = nominees.map((player) => player.id)
  state.awaitingHumanVote = true
  state.votes = {}

  return { state, human, nominees }
}

describe('Battery Low vote effects', () => {
  it('Power Cell duplicates the normal human ballot to the same nominee', () => {
    const { state, human, nominees } = makeClassicVoteState()
    let next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'doubleVote' }))

    next = gameReducer(next, submitHumanVote(nominees[0]!.id))

    expect(next.votes?.[human.id]).toBe(nominees[0]!.id)
    expect(next.votes?.[`${human.id}__dv2`]).toBe(nominees[0]!.id)
    expect(next.awaitingHumanVote).toBe(false)
  })

  it('Blackout Cell makes its holder ineligible for the ordinary house ballot', () => {
    const { state, human } = makeClassicVoteState()
    const next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'skipVote' }))

    expect(canCastClassicEvictionVote(next, human.id)).toBe(false)
  })

  it('does not register vote-changing cells in incompatible formats', () => {
    const { state, human } = makeClassicVoteState()
    if (!state.voxPopuli) throw new Error('Expected Vox Populi state')
    state.voxPopuli.status = 'active'

    const next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'doubleVote' }))

    expect(next.batteryLowVoteEffects).toEqual({})
  })
})
