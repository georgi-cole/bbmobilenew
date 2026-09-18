import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  createInitialGameState,
  registerBatteryLowVoteEffects,
  submitHumanVote,
} from '../../../src/store/gameSlice'
import { canCastClassicEvictionVote } from '../../../src/store/criticalGameRules'

function makeClassicVoteState() {
  const state = createInitialGameState({ seed: 8412 })
  state.mode = 'classic'
  state.phase = 'social_2'
  state.doubleEviction = { usedCount: 0, weekActive: false, pendingSecondEviction: null }
  if (state.voxPopuli) state.voxPopuli.status = 'inactive'
  if (state.cupidArrow) state.cupidArrow.status = 'inactive'

  const human = state.players.find((player) => player.isUser)!
  const others = state.players.filter((player) => player.id !== human.id)
  const loh = others[0]!
  const nominees = others.slice(1, 3)

  state.lohId = loh.id
  state.nomineeIds = nominees.map((player) => player.id)
  state.awaitingHumanVote = false
  state.votes = {}

  return { state, human, loh, nominees }
}

function enterLiveVote(state: ReturnType<typeof createInitialGameState>) {
  return gameReducer(state, advance())
}

describe('Battery Low vote effects', () => {
  it('Power Cell duplicates the next eligible human ballot to the same nominee', () => {
    const { state, human, nominees } = makeClassicVoteState()
    let next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'doubleVote' }))

    expect(next.batteryLowVoteEffects?.[human.id]).toEqual({
      type: 'doubleVote',
      cyclesRemaining: 2,
    })

    next = enterLiveVote(next)
    expect(next.awaitingHumanVote).toBe(true)

    next = gameReducer(next, submitHumanVote(nominees[0]!.id))

    expect(next.votes?.[human.id]).toBe(nominees[0]!.id)
    expect(next.votes?.[`${human.id}__dv2`]).toBe(nominees[0]!.id)
    expect(next.batteryLowVoteEffects?.[human.id]).toBeUndefined()
    expect(next.awaitingHumanVote).toBe(false)
  })

  it('Blackout Cell skips the next ballot the holder could otherwise cast', () => {
    const { state, human } = makeClassicVoteState()
    let next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'skipVote' }))

    expect(canCastClassicEvictionVote(next, human.id)).toBe(true)

    next = enterLiveVote(next)

    expect(next.awaitingHumanVote).toBe(false)
    expect(next.votes?.[human.id]).toBeUndefined()
    expect(next.batteryLowVoteEffects?.[human.id]).toBeUndefined()
  })

  it('does not burn Power Cell when the holder is LOH, then uses it on the next eligible vote', () => {
    const { state, human, loh, nominees } = makeClassicVoteState()
    state.lohId = human.id

    let next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'doubleVote' }))
    next = enterLiveVote(next)

    expect(next.awaitingHumanVote).toBe(false)
    expect(next.batteryLowVoteEffects?.[human.id]).toEqual({
      type: 'doubleVote',
      cyclesRemaining: 1,
    })

    next = {
      ...next,
      phase: 'social_2',
      lohId: loh.id,
      nomineeIds: nominees.map((player) => player.id),
      awaitingHumanVote: false,
      votes: {},
    }

    next = enterLiveVote(next)
    expect(next.awaitingHumanVote).toBe(true)

    next = gameReducer(next, submitHumanVote(nominees[0]!.id))
    expect(next.votes?.[`${human.id}__dv2`]).toBe(nominees[0]!.id)
    expect(next.batteryLowVoteEffects?.[human.id]).toBeUndefined()
  })

  it('expires an unused effect after two ordinary eviction cycles', () => {
    const { state, human } = makeClassicVoteState()
    state.lohId = human.id

    let next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'doubleVote' }))
    next = enterLiveVote(next)
    expect(next.batteryLowVoteEffects?.[human.id]?.cyclesRemaining).toBe(1)

    next = {
      ...next,
      phase: 'social_2',
      awaitingHumanVote: false,
      votes: {},
    }
    next = enterLiveVote(next)

    expect(next.batteryLowVoteEffects?.[human.id]).toBeUndefined()
  })

  it('does not register vote-changing cells in incompatible formats', () => {
    const { state, human } = makeClassicVoteState()
    if (!state.voxPopuli) throw new Error('Expected Vox Populi state')
    state.voxPopuli.status = 'active'

    const next = gameReducer(state, registerBatteryLowVoteEffects({ [human.id]: 'doubleVote' }))

    expect(next.batteryLowVoteEffects).toEqual({})
  })
})
