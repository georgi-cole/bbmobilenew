import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  applyF3MinigameWinner,
  completeFinalThreeBlockReveal,
  completeFinalThreeOpening,
  createInitialGameState,
  finalizeFinal3Decision,
  hydrateGame,
  selectF3Part1PredictedWinnerId,
} from '../gameSlice'

function createClassicFinalThreeState() {
  const state = createInitialGameState({ seed: 811 })
  const human = state.players.find((player) => player.isUser)
  if (!human) throw new Error('Expected a human player')
  const finalists = [human, ...state.players.filter((player) => !player.isUser).slice(0, 2)]
  state.players.forEach((player) => {
    player.status = finalists.includes(player) ? 'active' : 'jury'
  })
  return { state, human, finalists }
}

describe('Classic Final Three ceremony routing', () => {
  it('opens the shared ceremony after an interactive Part 3 result, regardless of who wins', () => {
    for (const winnerIndex of [0, 1]) {
      const { state, finalists } = createClassicFinalThreeState()
      state.phase = 'final3_comp3_minigame'
      state.f3Part1WinnerId = finalists[0].id
      state.f3Part2WinnerId = finalists[1].id

      const next = gameReducer(state, applyF3MinigameWinner(finalists[winnerIndex].id))

      expect(next.phase).toBe('final3_decision')
      expect(next.awaitingFinal3Plea).toBe(true)
      expect(next.awaitingFinal3Eviction).toBe(false)
      expect(next.players.filter((player) => player.status === 'evicted')).toHaveLength(0)
    }
  })

  it('opens the same ceremony after an AI-resolved Part 3', () => {
    const { state, finalists } = createClassicFinalThreeState()
    state.phase = 'final3_comp3'
    state.f3Part1WinnerId = finalists[1].id
    state.f3Part2WinnerId = finalists[2].id

    const next = gameReducer(state, advance())

    expect(next.phase).toBe('final3_decision')
    expect(next.awaitingFinal3Plea).toBe(true)
    expect(next.awaitingFinal3Eviction).toBe(false)
    expect(next.players.filter((player) => player.status === 'evicted')).toHaveLength(0)
  })
})

describe('Final Three durable controller', () => {
  it('routes Play after the Classic opening through the internal setup phase to Part 1', () => {
    const { state, finalists } = createClassicFinalThreeState()
    state.phase = 'final3'

    let next = gameReducer(state, completeFinalThreeOpening())
    next = gameReducer(next, advance())
    expect(next.phase).toBe('final3_comp1')

    next = gameReducer(next, advance())
    expect(next.phase).toBe('final3_comp1_minigame')
    expect(next.minigameContext?.phaseKey).toBe('final3_comp1')
    expect(next.minigameContext?.participants).toEqual(finalists.map((player) => player.id))
  })

  it('sends the Part 1 result to the Part 2 live-event broadcast', () => {
    const { state, finalists } = createClassicFinalThreeState()
    state.phase = 'final3_comp1_minigame'
    state.minigameContext = {
      phaseKey: 'final3_comp1',
      participants: finalists.map((player) => player.id),
      seed: 91,
    }

    const next = gameReducer(state, applyF3MinigameWinner(finalists[0].id))
    const result = next.tvFeed[0]

    expect(result?.meta).toMatchObject({
      major: 'final3_part1_result',
      phase: 'final3_comp2',
      broadcastLevel: 'critical',
      forceOnTv: true,
    })
  })

  it('sends the Part 2 qualifier to the Part 3 live-event broadcast', () => {
    const { state, finalists } = createClassicFinalThreeState()
    state.phase = 'final3_comp2_minigame'
    state.f3Part1WinnerId = finalists[0].id
    state.minigameContext = {
      phaseKey: 'final3_comp2',
      participants: finalists.slice(1).map((player) => player.id),
      seed: 92,
    }

    const next = gameReducer(state, applyF3MinigameWinner(finalists[1].id))
    const result = next.tvFeed[0]

    expect(result?.meta).toMatchObject({
      major: 'final3_part2_result',
      phase: 'final3_comp3',
      broadcastLevel: 'critical',
      forceOnTv: true,
    })
  })

  it('persists every result and the completed Classic decision', () => {
    const { state, finalists } = createClassicFinalThreeState()
    state.phase = 'final3'

    const introAcknowledged = gameReducer(state, completeFinalThreeOpening())
    expect(introAcknowledged.finalThree?.openingSeen).toBe(true)

    let next = gameReducer(state, advance())
    expect(next.finalThree).toMatchObject({
      mode: 'classic',
      stage: 'part1',
      openingSeen: false,
      blockRevealSeen: false,
      participantIds: finalists.map((player) => player.id),
    })

    next = gameReducer(
      {
        ...next,
        phase: 'final3_comp1_minigame',
        minigameContext: {
          phaseKey: 'final3_comp1',
          participants: finalists.map((p) => p.id),
          seed: 41,
        },
      },
      applyF3MinigameWinner(finalists[0].id)
    )
    expect(next.finalThree?.part1).toEqual({
      participantIds: finalists.map((player) => player.id),
      winnerId: finalists[0].id,
      seed: 41,
    })
    expect(next.finalThree?.stage).toBe('part2')

    next = gameReducer(
      {
        ...next,
        phase: 'final3_comp2_minigame',
        minigameContext: {
          phaseKey: 'final3_comp2',
          participants: finalists.slice(1).map((p) => p.id),
          seed: 42,
        },
      },
      applyF3MinigameWinner(finalists[1].id)
    )
    expect(next.finalThree?.part2?.winnerId).toBe(finalists[1].id)
    expect(next.nomineeIds).toEqual([finalists[2].id])
    expect(next.finalThree?.blockRevealSeen).toBe(false)

    next = gameReducer(next, completeFinalThreeBlockReveal())
    expect(next.finalThree?.blockRevealSeen).toBe(true)

    next = gameReducer(
      {
        ...next,
        phase: 'final3_comp3_minigame',
        minigameContext: {
          phaseKey: 'final3_comp3',
          participants: finalists.slice(0, 2).map((p) => p.id),
          seed: 43,
        },
      },
      applyF3MinigameWinner(finalists[0].id)
    )
    expect(next.finalThree).toMatchObject({
      stage: 'ceremony',
      finalPowerHolderId: finalists[0].id,
      nomineeIds: finalists.slice(1).map((player) => player.id),
      part3: { winnerId: finalists[0].id, seed: 43 },
    })

    next = gameReducer(
      next,
      finalizeFinal3Decision({ hohWinnerId: finalists[0].id, evicteeId: finalists[1].id })
    )
    expect(next.finalThree).toMatchObject({ stage: 'complete', evicteeId: finalists[1].id })
  })

  it('starts Vox Populi with its own durable final-three route', () => {
    const { state, finalists } = createClassicFinalThreeState()
    state.phase = 'final3'
    const voxPopuli = state.voxPopuli
    if (!voxPopuli) throw new Error('Expected Vox Populi state')
    state.voxPopuli = { ...voxPopuli, status: 'active' }

    const next = gameReducer(state, advance())

    expect(next.finalThree).toMatchObject({
      mode: 'vox_populi',
      stage: 'part1',
      participantIds: finalists.map((player) => player.id),
    })
    expect(next.phase).toBe('final3_comp1_minigame')
  })

  it('predicts the same deterministic Part 1 winner a Tribunal spectator will see', () => {
    const { state, human } = createClassicFinalThreeState()
    const finalists = state.players.filter((player) => !player.isUser).slice(0, 3)
    state.players.forEach((player) => {
      player.status = finalists.includes(player) ? 'active' : 'jury'
    })
    human.status = 'jury'
    state.phase = 'final3'

    const opened = gameReducer(state, advance())
    const expected = gameReducer(opened, advance()).finalThree?.part1?.winnerId
    const predicted = selectF3Part1PredictedWinnerId({ game: state } as Parameters<
      typeof selectF3Part1PredictedWinnerId
    >[0])

    expect(predicted).toBe(expected)
  })

  it('does not put the Part 2 loser on the block in Vox Populi', () => {
    const { state, finalists } = createClassicFinalThreeState()
    const voxPopuli = state.voxPopuli
    if (!voxPopuli) throw new Error('Expected Vox Populi state')
    state.voxPopuli = { ...voxPopuli, status: 'active' }
    state.phase = 'final3_comp2_minigame'
    state.f3Part1WinnerId = finalists[0].id
    state.minigameContext = {
      phaseKey: 'final3_comp2',
      participants: finalists.slice(1).map((player) => player.id),
      seed: 91,
    }

    const next = gameReducer(state, applyF3MinigameWinner(finalists[1].id))

    expect(next.nomineeIds).toEqual([])
    expect(next.players.find((player) => player.id === finalists[2].id)?.status).toBe('active')
    expect(next.finalThree?.blockRevealSeen).toBe(true)
  })

  it('migrates a legacy save at the Part 3 resume point', () => {
    const { state, finalists } = createClassicFinalThreeState()
    state.phase = 'final3_comp3'
    state.f3Part1WinnerId = finalists[0].id
    state.f3Part2WinnerId = finalists[1].id
    delete state.finalThree

    const next = gameReducer(createInitialGameState({ seed: 12 }), hydrateGame(state))

    expect(next.finalThree).toMatchObject({
      mode: 'classic',
      stage: 'part3',
      part1: { winnerId: finalists[0].id, seed: null },
      part2: { winnerId: finalists[1].id, seed: null },
    })
  })
})
