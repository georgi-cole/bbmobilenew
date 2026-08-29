import { describe, expect, it } from 'vitest'
import { coordinateGameFlows, type GameFlowKey, type GameFlowSignals } from './gameFlowCoordinator'

const EMPTY_FLOWS: Record<GameFlowKey, GameFlowSignals> = {
  eviction: {},
  endgame: {},
  twist: {},
  competition: {},
  safety: {},
  loh: {},
  presentation: {},
}

function withFlows(overrides: Partial<Record<GameFlowKey, GameFlowSignals>>) {
  return {
    ...EMPTY_FLOWS,
    ...overrides,
  }
}

describe('coordinateGameFlows', () => {
  it('keeps the dock available when no gameplay flow owns the screen', () => {
    expect(
      coordinateGameFlows({
        hasStartedGame: true,
        flows: withFlows({}),
      })
    ).toEqual({
      activeFlow: null,
      awaitingHumanDecision: false,
      showGameControlDock: true,
      blockingFlows: [],
    })
  })

  it('uses the declared priority when several flows block at once', () => {
    const result = coordinateGameFlows({
      hasStartedGame: true,
      flows: withFlows({
        loh: { awaitingDecision: [true] },
        twist: { blocksControls: [true] },
        eviction: { awaitingDecision: [true] },
      }),
    })

    expect(result.activeFlow).toBe('eviction')
    expect(result.blockingFlows).toEqual(['eviction', 'twist', 'loh'])
    expect(result.awaitingHumanDecision).toBe(true)
    expect(result.showGameControlDock).toBe(true)
  })

  it('distinguishes a presentation blocker from a pending human decision', () => {
    const result = coordinateGameFlows({
      hasStartedGame: true,
      flows: withFlows({
        presentation: { blocksControls: [true] },
      }),
    })

    expect(result.activeFlow).toBe('presentation')
    expect(result.awaitingHumanDecision).toBe(false)
    expect(result.showGameControlDock).toBe(true)
  })

  it('can allow inactive-mode controls when the caller explicitly permits them', () => {
    const result = coordinateGameFlows({
      hasStartedGame: false,
      allowControlsWhenInactive: true,
      flows: withFlows({}),
    })

    expect(result.showGameControlDock).toBe(true)
  })
})
