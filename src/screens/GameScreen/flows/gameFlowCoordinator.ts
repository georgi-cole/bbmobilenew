import { shouldShowGameControlDock } from '../gameScreenUiGuards'

export type GameFlowKey =
  | 'eviction'
  | 'endgame'
  | 'twist'
  | 'competition'
  | 'safety'
  | 'loh'
  | 'presentation'

export interface GameFlowSignals {
  awaitingDecision?: readonly boolean[]
  blocksControls?: readonly boolean[]
}

interface CoordinateGameFlowsOptions {
  hasStartedGame: boolean
  allowControlsWhenInactive?: boolean
  flows: Record<GameFlowKey, GameFlowSignals>
}

const PRESENTATION_PRIORITY: readonly GameFlowKey[] = [
  'eviction',
  'endgame',
  'twist',
  'competition',
  'safety',
  'loh',
  'presentation',
]

function any(signals: readonly boolean[] | undefined): boolean {
  return signals?.some(Boolean) ?? false
}

/**
 * Produces one stable presentation decision from the six gameplay controllers.
 * It does not mutate game state; it only prevents GameScreen from maintaining
 * parallel blocker lists that can silently drift apart.
 */
export function coordinateGameFlows({
  hasStartedGame,
  allowControlsWhenInactive = false,
  flows,
}: CoordinateGameFlowsOptions) {
  const awaitingFlows = PRESENTATION_PRIORITY.filter((flow) => any(flows[flow].awaitingDecision))
  const blockingFlows = PRESENTATION_PRIORITY.filter(
    (flow) => any(flows[flow].awaitingDecision) || any(flows[flow].blocksControls)
  )
  const blockers = PRESENTATION_PRIORITY.map(
    (flow) => any(flows[flow].awaitingDecision) || any(flows[flow].blocksControls)
  )

  return {
    activeFlow: blockingFlows[0] ?? null,
    awaitingHumanDecision: awaitingFlows.length > 0,
    showGameControlDock: shouldShowGameControlDock(
      hasStartedGame,
      blockers,
      allowControlsWhenInactive
    ),
    blockingFlows,
  }
}
