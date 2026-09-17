import {
  buildWardenBoard,
  getGridNeighbors,
  resolveWardenTurn,
  type RiskTier,
  type WardenBoard,
} from './finalThreeCircuitLogic'

type Transform = 'identity' | 'flipX' | 'flipY' | 'flipXY'

interface WardenLayoutConfig {
  size: number
  start: number
  exit: number
  wardenStart: number
  walls: number[]
  guardSteps: number
  moveBudget: number
}

export interface WardenDifficultyProfile {
  solutionMoves: number
  unguardedMoves: number
  forcedDetourMoves: number
  retreatMoves: number
  guardStallTurns: number
}

/**
 * Original prison layouts built around the same strategic idea as the strongest
 * chase puzzles: the shortest-looking route is unsafe, so the player has to
 * bait the horizontal-first guard into walls, double back, then break for EXIT.
 *
 * We intentionally do not rotate/transpose these maps. Horizontal-first pursuit
 * is not rotationally symmetric, and those transforms used to turn some boards
 * into almost straight-line escapes.
 */
const CURATED_LAYOUTS: Record<RiskTier, WardenLayoutConfig[]> = {
  safe: [
    {
      size: 5,
      start: 7,
      exit: 21,
      wardenStart: 10,
      walls: [2, 3, 6, 11, 19, 20, 22],
      guardSteps: 2,
      moveBudget: 18,
    },
    {
      size: 5,
      start: 0,
      exit: 21,
      wardenStart: 23,
      walls: [6, 7, 9, 14, 15, 17, 18],
      guardSteps: 2,
      moveBudget: 18,
    },
    {
      size: 5,
      start: 7,
      exit: 20,
      wardenStart: 15,
      walls: [0, 5, 9, 10, 13, 22, 23],
      guardSteps: 2,
      moveBudget: 18,
    },
  ],
  standard: [
    {
      size: 6,
      start: 34,
      exit: 8,
      wardenStart: 1,
      walls: [2, 3, 4, 5, 13, 14, 18, 19, 21, 28, 30],
      guardSteps: 2,
      moveBudget: 28,
    },
    {
      size: 6,
      start: 35,
      exit: 2,
      wardenStart: 7,
      walls: [8, 9, 11, 13, 14, 15, 17, 20, 21, 25, 28],
      guardSteps: 2,
      moveBudget: 28,
    },
    {
      size: 6,
      start: 22,
      exit: 8,
      wardenStart: 6,
      walls: [1, 3, 5, 14, 15, 16, 18, 21, 26, 29, 30],
      guardSteps: 2,
      moveBudget: 28,
    },
  ],
  risky: [
    {
      size: 8,
      start: 40,
      exit: 31,
      wardenStart: 14,
      walls: [3, 4, 5, 7, 9, 13, 17, 18, 23, 26, 27, 28, 37, 39, 44, 47, 48, 49, 53, 59],
      guardSteps: 2,
      moveBudget: 46,
    },
    {
      size: 8,
      start: 14,
      exit: 49,
      wardenStart: 1,
      walls: [6, 7, 12, 17, 19, 25, 29, 30, 33, 39, 41, 42, 46, 47, 50, 51, 52, 56, 57, 59],
      guardSteps: 2,
      moveBudget: 46,
    },
    {
      size: 8,
      start: 24,
      exit: 59,
      wardenStart: 48,
      walls: [1, 2, 7, 9, 14, 15, 17, 28, 29, 33, 35, 37, 38, 41, 42, 45, 51, 53, 55, 61],
      guardSteps: 2,
      moveBudget: 46,
    },
  ],
}

const TRANSFORMS: Transform[] = ['identity', 'flipX', 'flipY', 'flipXY']

const DIFFICULTY_REQUIREMENTS: Record<
  RiskTier,
  Pick<
    WardenDifficultyProfile,
    'solutionMoves' | 'forcedDetourMoves' | 'retreatMoves' | 'guardStallTurns'
  >
> = {
  safe: {
    solutionMoves: 10,
    forcedDetourMoves: 5,
    retreatMoves: 3,
    guardStallTurns: 5,
  },
  standard: {
    solutionMoves: 16,
    forcedDetourMoves: 8,
    retreatMoves: 5,
    guardStallTurns: 9,
  },
  risky: {
    solutionMoves: 28,
    forcedDetourMoves: 14,
    retreatMoves: 9,
    guardStallTurns: 16,
  },
}

const variationCache = new Map<RiskTier, WardenBoard[]>()

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function makeBoard(config: WardenLayoutConfig): WardenBoard {
  return {
    ...config,
    walls: new Set(config.walls),
  }
}

function transformCell(cell: number, size: number, transform: Transform): number {
  const row = Math.floor(cell / size)
  const column = cell % size
  let nextRow = row
  let nextColumn = column

  if (transform === 'flipX' || transform === 'flipXY') {
    nextColumn = size - 1 - nextColumn
  }
  if (transform === 'flipY' || transform === 'flipXY') {
    nextRow = size - 1 - nextRow
  }

  return nextRow * size + nextColumn
}

function transformBoard(base: WardenBoard, transform: Transform): WardenBoard {
  if (transform === 'identity') return base
  return {
    ...base,
    start: transformCell(base.start, base.size, transform),
    exit: transformCell(base.exit, base.size, transform),
    wardenStart: transformCell(base.wardenStart, base.size, transform),
    walls: new Set([...base.walls].map((cell) => transformCell(cell, base.size, transform))),
  }
}

function manhattan(cell: number, target: number, size: number): number {
  const [row, column] = [Math.floor(cell / size), cell % size]
  const [targetRow, targetColumn] = [Math.floor(target / size), target % size]
  return Math.abs(row - targetRow) + Math.abs(column - targetColumn)
}

function shortestUnguardedPath(board: WardenBoard): number | null {
  const queue: Array<{ cell: number; moves: number }> = [{ cell: board.start, moves: 0 }]
  const seen = new Set<number>([board.start])

  while (queue.length > 0) {
    const state = queue.shift()!
    if (state.cell === board.exit) return state.moves
    for (const next of getGridNeighbors(state.cell, board.size, board.walls)) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push({ cell: next, moves: state.moves + 1 })
    }
  }

  return null
}

export function getWardenDifficultyProfile(board: WardenBoard): WardenDifficultyProfile | null {
  type State = {
    player: number
    warden: number
    moves: number
    retreatMoves: number
    guardStallTurns: number
  }

  const unguardedMoves = shortestUnguardedPath(board)
  if (unguardedMoves == null) return null

  const queue: State[] = [
    {
      player: board.start,
      warden: board.wardenStart,
      moves: 0,
      retreatMoves: 0,
      guardStallTurns: 0,
    },
  ]
  const seen = new Set<string>([`${board.start}:${board.wardenStart}`])

  while (queue.length > 0) {
    const state = queue.shift()!
    if (state.moves >= board.moveBudget) continue

    for (const nextPlayer of getGridNeighbors(state.player, board.size, board.walls)) {
      if (nextPlayer === state.warden) continue
      const nextMoves = state.moves + 1
      const retreat =
        manhattan(nextPlayer, board.exit, board.size) >
        manhattan(state.player, board.exit, board.size)

      if (nextPlayer === board.exit) {
        return {
          solutionMoves: nextMoves,
          unguardedMoves,
          forcedDetourMoves: nextMoves - unguardedMoves,
          retreatMoves: state.retreatMoves + (retreat ? 1 : 0),
          guardStallTurns: state.guardStallTurns,
        }
      }

      const turn = resolveWardenTurn(board, state.warden, nextPlayer)
      if (turn.caught) continue

      const key = `${nextPlayer}:${turn.nextWarden}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({
        player: nextPlayer,
        warden: turn.nextWarden,
        moves: nextMoves,
        retreatMoves: state.retreatMoves + (retreat ? 1 : 0),
        guardStallTurns: state.guardStallTurns + (turn.nextWarden === state.warden ? 1 : 0),
      })
    }
  }

  return null
}

export function isWardenBoardStateSolvable(board: WardenBoard): boolean {
  return getWardenDifficultyProfile(board) != null
}

export function getWardenHintMove(
  board: WardenBoard,
  playerCell: number,
  wardenCell: number,
  movesUsed = 0
): number | null {
  if (playerCell === board.exit || movesUsed >= board.moveBudget) return null

  type HintState = { player: number; warden: number; moves: number; firstMove: number | null }
  const queue: HintState[] = [
    { player: playerCell, warden: wardenCell, moves: movesUsed, firstMove: null },
  ]
  const seen = new Set<string>([`${playerCell}:${wardenCell}`])

  while (queue.length > 0) {
    const state = queue.shift()!
    if (state.moves >= board.moveBudget) continue

    for (const nextPlayer of getGridNeighbors(state.player, board.size, board.walls)) {
      if (nextPlayer === state.warden) continue
      const nextMoves = state.moves + 1
      const firstMove = state.firstMove ?? nextPlayer
      if (nextPlayer === board.exit) return firstMove

      const turn = resolveWardenTurn(board, state.warden, nextPlayer)
      if (turn.caught || nextMoves >= board.moveBudget) continue

      const key = `${nextPlayer}:${turn.nextWarden}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({ player: nextPlayer, warden: turn.nextWarden, moves: nextMoves, firstMove })
    }
  }

  return null
}

export function meetsWardenTierDifficulty(board: WardenBoard, tier: RiskTier): boolean {
  const profile = getWardenDifficultyProfile(board)
  if (!profile) return false
  const required = DIFFICULTY_REQUIREMENTS[tier]
  return (
    profile.solutionMoves >= required.solutionMoves &&
    profile.solutionMoves <= board.moveBudget &&
    profile.forcedDetourMoves >= required.forcedDetourMoves &&
    profile.retreatMoves >= required.retreatMoves &&
    profile.guardStallTurns >= required.guardStallTurns
  )
}

export function getSolvableWardenVariations(tier: RiskTier): WardenBoard[] {
  const cached = variationCache.get(tier)
  if (cached) return cached

  const unique = new Map<string, WardenBoard>()

  CURATED_LAYOUTS[tier].forEach((config) => {
    const base = makeBoard(config)
    TRANSFORMS.forEach((transform) => {
      const board = transformBoard(base, transform)
      if (!meetsWardenTierDifficulty(board, tier)) return
      const signature = `${board.start}|${board.exit}|${board.wardenStart}|${[...board.walls]
        .sort((a, b) => a - b)
        .join(',')}`
      unique.set(signature, board)
    })
  })

  const variations = [...unique.values()]
  variationCache.set(tier, variations)
  return variations
}

export function getWardenVariationIndex(seed: number, tier: RiskTier): number {
  const count = Math.max(1, getSolvableWardenVariations(tier).length)
  return ((seed ^ hash(`warden-layout:${tier}:v4`)) >>> 0) % count
}

export function buildVariedWardenBoard(tier: RiskTier, seed: number): WardenBoard {
  const variations = getSolvableWardenVariations(tier)
  if (variations.length === 0) return buildWardenBoard(tier)
  return variations[getWardenVariationIndex(seed, tier)]
}
