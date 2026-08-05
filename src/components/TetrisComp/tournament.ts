export type TetrisRoundKind = 'qualifier' | 'semifinal' | 'final'

export interface TetrisRoundPlan {
  roundNumber: number
  totalRounds: number
  durationMs: number
  kind: TetrisRoundKind
  label: string
  subtitle: string
  survivorCount: number
  speedMultiplier: number
  tensionLevel: 1 | 2 | 3 | 4
  useHouseguestCells: boolean
}

export interface TetrisRoundPerformance {
  playerId: string
  score: number
  lines: number
  pieces: number
  maxStackHeight: number
  previousScore: number
  tieBreaker: number
}

export interface TetrisRoundSplit {
  standings: TetrisRoundPerformance[]
  survivorIds: string[]
  eliminatedWorstFirst: string[]
}

const MIN_PLAYERS = 3

function createPlan(
  definitions: Array<Omit<TetrisRoundPlan, 'roundNumber' | 'totalRounds'>>
): TetrisRoundPlan[] {
  const totalRounds = definitions.length
  return definitions.map((definition, index) => ({
    ...definition,
    roundNumber: index + 1,
    totalRounds,
  }))
}

export function buildTetrisTournamentPlan(playerCount: number): TetrisRoundPlan[] {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS) {
    throw new Error(`Fit Me In requires at least ${MIN_PLAYERS} players`)
  }

  if (playerCount === 3) {
    return createPlan([
      {
        durationMs: 90_000,
        kind: 'semifinal',
        label: 'Semifinal',
        subtitle: 'Top 2 advance',
        survivorCount: 2,
        speedMultiplier: 0.74,
        tensionLevel: 3,
        useHouseguestCells: false,
      },
      {
        durationMs: 90_000,
        kind: 'final',
        label: 'Houseguest Mosaic Final',
        subtitle: 'Highest score wins',
        survivorCount: 1,
        speedMultiplier: 0.6,
        tensionLevel: 4,
        useHouseguestCells: true,
      },
    ])
  }

  if (playerCount === 4) {
    return createPlan([
      {
        durationMs: 60_000,
        kind: 'qualifier',
        label: 'Opening Heat',
        subtitle: 'Last place is eliminated',
        survivorCount: 3,
        speedMultiplier: 0.94,
        tensionLevel: 1,
        useHouseguestCells: false,
      },
      {
        durationMs: 60_000,
        kind: 'semifinal',
        label: 'Semifinal',
        subtitle: 'Top 2 advance',
        survivorCount: 2,
        speedMultiplier: 0.74,
        tensionLevel: 3,
        useHouseguestCells: false,
      },
      {
        durationMs: 60_000,
        kind: 'final',
        label: 'Houseguest Mosaic Final',
        subtitle: 'Highest score wins',
        survivorCount: 1,
        speedMultiplier: 0.6,
        tensionLevel: 4,
        useHouseguestCells: true,
      },
    ])
  }

  return createPlan([
    {
      durationMs: 60_000,
      kind: 'qualifier',
      label: 'Opening Heat',
      subtitle: 'Last place is eliminated',
      survivorCount: playerCount - 1,
      speedMultiplier: 1,
      tensionLevel: 1,
      useHouseguestCells: false,
    },
    {
      durationMs: 60_000,
      kind: 'qualifier',
      label: 'Pressure Round',
      subtitle: 'Last place is eliminated',
      survivorCount: playerCount - 2,
      speedMultiplier: 0.86,
      tensionLevel: 2,
      useHouseguestCells: false,
    },
    {
      durationMs: 60_000,
      kind: 'semifinal',
      label: 'Semifinal',
      subtitle: 'Top 2 advance',
      survivorCount: 2,
      speedMultiplier: 0.72,
      tensionLevel: 3,
      useHouseguestCells: false,
    },
    {
      durationMs: 60_000,
      kind: 'final',
      label: 'Houseguest Mosaic Final',
      subtitle: 'Highest score wins',
      survivorCount: 1,
      speedMultiplier: 0.58,
      tensionLevel: 4,
      useHouseguestCells: true,
    },
  ])
}

export function rankTetrisRound(
  performances: readonly TetrisRoundPerformance[]
): TetrisRoundPerformance[] {
  return [...performances].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    if (a.lines !== b.lines) return b.lines - a.lines
    if (a.pieces !== b.pieces) return b.pieces - a.pieces
    if (a.maxStackHeight !== b.maxStackHeight) return a.maxStackHeight - b.maxStackHeight
    if (a.previousScore !== b.previousScore) return b.previousScore - a.previousScore
    if (a.tieBreaker !== b.tieBreaker) return b.tieBreaker - a.tieBreaker
    return a.playerId.localeCompare(b.playerId)
  })
}

export function splitTetrisRound(
  performances: readonly TetrisRoundPerformance[],
  survivorCount: number
): TetrisRoundSplit {
  const standings = rankTetrisRound(performances)
  const safeSurvivorCount = Math.max(1, Math.min(survivorCount, standings.length))
  const survivorIds = standings.slice(0, safeSurvivorCount).map((entry) => entry.playerId)
  const eliminatedWorstFirst = standings
    .slice(safeSurvivorCount)
    .map((entry) => entry.playerId)
    .reverse()

  return { standings, survivorIds, eliminatedWorstFirst }
}

export function buildTetrisOutcomeScores(
  finalRankingBestFirst: readonly string[],
  latestRoundScores: Readonly<Record<string, number>>
): Record<string, number> {
  const totalPlayers = finalRankingBestFirst.length
  const scores: Record<string, number> = {}

  finalRankingBestFirst.forEach((playerId, index) => {
    const placementWeight = (totalPlayers - index) * 1_000_000
    const visibleScore = Math.max(0, Math.round(latestRoundScores[playerId] ?? 0))
    scores[playerId] = placementWeight + visibleScore
  })

  return scores
}
