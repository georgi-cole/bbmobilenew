export type CircuitStageScores = [number, number, number]
export type RiskTier = 'safe' | 'standard' | 'risky'

export interface SignalRound {
  id: string
  cellCount: number
  columns: number
  targetCount: number
  targetOrder: number[]
  timeLimitMs: number
  maxPoints: number
}

export interface SequenceBoard {
  id: string
  target: string[]
  initial: string[]
  rows: number
  columns: number
  scrambleMoves: number
  timeLimitMs: number
  maxPoints: number
}

export interface WardenBoard {
  size: number
  start: number
  exit: number
  wardenStart: number
  walls: Set<number>
  guardSteps: number
  moveBudget: number
}

export interface PowerPuzzle {
  values: number[]
  target: number
  tolerance: number
  maxToggles: number
  timeLimitMs: number
}

export const RISK_TIER_MAX_POINTS: Record<RiskTier, number> = {
  safe: 32,
  standard: 40,
  risky: 48,
}

export const FINAL_PUSH_STAKES = [0.1, 0.25, 0.4] as const
export const EMPTY_SEQUENCE_TILE = '__empty__'
export const SEQUENCE_STAGE_TIME_MS = 300_000

export function clampCircuitScore(value: number, max = 100): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(max, Math.round(value)))
}

function hashStringU32(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export function buildSignalRounds(seed: number): SignalRound[] {
  const configs = [
    { cellCount: 16, columns: 4, targetCount: 6, timeLimitMs: 12_000, maxPoints: 30 },
    { cellCount: 20, columns: 5, targetCount: 8, timeLimitMs: 12_000, maxPoints: 33 },
    { cellCount: 25, columns: 5, targetCount: 10, timeLimitMs: 12_000, maxPoints: 37 },
  ]

  return configs.map((config, roundIndex) => {
    const random = seededRandom((seed ^ hashStringU32(`signal-round:${roundIndex}`)) >>> 0)
    const numbers = Array.from({ length: config.cellCount }, (_unused, index) => index + 1)
    return {
      id: `signal-${roundIndex + 1}`,
      ...config,
      targetOrder: shuffle(numbers, random).slice(0, config.targetCount),
    }
  })
}

export function buildSignalBoard(
  seed: number,
  roundIndex: number,
  step: number,
  cellCount: number
): number[] {
  const random = seededRandom(
    (seed ^ hashStringU32(`signal-board:${roundIndex}:${step}:${cellCount}`)) >>> 0
  )
  return shuffle(
    Array.from({ length: cellCount }, (_unused, index) => index + 1),
    random
  )
}

export function scoreSignalRound(
  found: number,
  targetCount: number,
  remainingMs: number,
  timeLimitMs: number,
  maxPoints: number,
  mistakes: number
): number {
  const completion = Math.max(0, Math.min(1, found / Math.max(1, targetCount)))
  const timeRatio = Math.max(0, Math.min(1, remainingMs / Math.max(1, timeLimitMs)))
  const completionWeight = found >= targetCount ? 0.78 + 0.22 * timeRatio : 0.72 + 0.08 * timeRatio
  const mistakePenalty = Math.max(0, mistakes) * Math.max(1, maxPoints * 0.045)
  return clampCircuitScore(maxPoints * completion * completionWeight - mistakePenalty, maxPoints)
}

function slidingNeighbors(blankIndex: number, rows: number, columns: number): number[] {
  const row = Math.floor(blankIndex / columns)
  const column = blankIndex % columns
  const result: number[] = []
  if (row > 0) result.push(blankIndex - columns)
  if (row < rows - 1) result.push(blankIndex + columns)
  if (column > 0) result.push(blankIndex - 1)
  if (column < columns - 1) result.push(blankIndex + 1)
  return result
}

export function slideSequenceTile(
  order: readonly string[],
  tileIndex: number,
  rows: number,
  columns: number
): string[] | null {
  const blankIndex = order.indexOf(EMPTY_SEQUENCE_TILE)
  if (blankIndex < 0 || !slidingNeighbors(blankIndex, rows, columns).includes(tileIndex)) {
    return null
  }
  const next = [...order]
  ;[next[blankIndex], next[tileIndex]] = [next[tileIndex], next[blankIndex]]
  return next
}

export function isSequenceSolved(order: readonly string[], target: readonly string[]): boolean {
  return order.length === target.length && order.every((tile, index) => tile === target[index])
}

export function buildSequenceBoards(seed: number): SequenceBoard[] {
  const configs = [
    { rows: 2, columns: 3, scrambleMoves: 8, timeLimitMs: SEQUENCE_STAGE_TIME_MS, maxPoints: 40 },
    { rows: 3, columns: 3, scrambleMoves: 22, timeLimitMs: SEQUENCE_STAGE_TIME_MS, maxPoints: 60 },
  ]

  return configs.map((config, boardIndex) => {
    const tileCount = config.rows * config.columns
    const target = [
      ...Array.from({ length: tileCount - 1 }, (_unused, index) => String(index + 1)),
      EMPTY_SEQUENCE_TILE,
    ]
    const random = seededRandom((seed ^ hashStringU32(`sliding-board:${boardIndex}`)) >>> 0)
    let initial = [...target]
    let previousBlank = -1

    for (let move = 0; move < config.scrambleMoves; move += 1) {
      const blank = initial.indexOf(EMPTY_SEQUENCE_TILE)
      let candidates = slidingNeighbors(blank, config.rows, config.columns).filter(
        (index) => index !== previousBlank
      )
      if (candidates.length === 0) candidates = slidingNeighbors(blank, config.rows, config.columns)
      const selected = candidates[Math.floor(random() * candidates.length)]
      previousBlank = blank
      const next = slideSequenceTile(initial, selected, config.rows, config.columns)
      if (next) initial = next
    }

    if (isSequenceSolved(initial, target)) {
      const blank = initial.indexOf(EMPTY_SEQUENCE_TILE)
      const fallback = slidingNeighbors(blank, config.rows, config.columns)[0]
      initial = slideSequenceTile(initial, fallback, config.rows, config.columns) ?? initial
    }

    return {
      id: `board-${boardIndex + 1}`,
      ...config,
      target,
      initial,
    }
  })
}

export function scoreSequenceBoard(
  board: SequenceBoard,
  order: readonly string[],
  moves: number,
  remainingMs: number,
  solved: boolean
): number {
  if (solved) {
    const extraMoves = Math.max(0, moves - board.scrambleMoves)
    const efficiency = Math.max(0, 1 - extraMoves / Math.max(5, board.scrambleMoves))
    const timeRatio = Math.max(0, Math.min(1, remainingMs / SEQUENCE_STAGE_TIME_MS))
    return clampCircuitScore(
      board.maxPoints * (0.82 + efficiency * 0.14 + timeRatio * 0.04),
      board.maxPoints
    )
  }

  const correctTiles = order.reduce(
    (count, tile, index) => count + (tile !== EMPTY_SEQUENCE_TILE && tile === board.target[index] ? 1 : 0),
    0
  )
  const possible = Math.max(1, board.target.length - 1)
  return clampCircuitScore(board.maxPoints * 0.35 * (correctTiles / possible), board.maxPoints)
}

export function scoreRiskAttempt(tier: RiskTier, accuracy: number): number {
  const normalizedAccuracy = Math.max(0, Math.min(1, accuracy))
  return clampCircuitScore(RISK_TIER_MAX_POINTS[tier] * normalizedAccuracy, 48)
}

export function applyFinalPush(
  bank: number,
  stakeFraction: (typeof FINAL_PUSH_STAKES)[number],
  success: boolean
): number {
  const safeBank = Math.max(0, bank)
  const stake = Math.max(1, Math.round(safeBank * stakeFraction))
  return clampCircuitScore(success ? safeBank + stake : safeBank - stake)
}

const WARDEN_CONFIG: Record<RiskTier, Omit<WardenBoard, 'walls'> & { walls: number[] }> = {
  safe: {
    size: 5,
    start: 16,
    exit: 6,
    wardenStart: 5,
    walls: [0, 3, 12, 18, 24],
    guardSteps: 2,
    moveBudget: 18,
  },
  standard: {
    size: 6,
    start: 34,
    exit: 10,
    wardenStart: 2,
    walls: [1, 4, 15, 16, 18, 21, 25, 28],
    guardSteps: 2,
    moveBudget: 26,
  },
  risky: {
    size: 8,
    start: 57,
    exit: 6,
    wardenStart: 4,
    walls: [0, 2, 7, 8, 11, 12, 16, 22, 23, 26, 27, 34, 43, 46, 50, 61],
    guardSteps: 2,
    moveBudget: 44,
  },
}

export function buildWardenBoard(tier: RiskTier): WardenBoard {
  const config = WARDEN_CONFIG[tier]
  return { ...config, walls: new Set(config.walls) }
}

export function getGridNeighbors(cell: number, size: number, walls: ReadonlySet<number>): number[] {
  const row = Math.floor(cell / size)
  const column = cell % size
  const result: number[] = []
  const candidates = [
    [row - 1, column],
    [row + 1, column],
    [row, column - 1],
    [row, column + 1],
  ]
  candidates.forEach(([nextRow, nextColumn]) => {
    if (nextRow < 0 || nextRow >= size || nextColumn < 0 || nextColumn >= size) return
    const next = nextRow * size + nextColumn
    if (!walls.has(next)) result.push(next)
  })
  return result
}

export function moveWardenOneStep(
  board: WardenBoard,
  wardenCell: number,
  playerCell: number
): number {
  if (wardenCell === playerCell) return wardenCell

  const wardenRow = Math.floor(wardenCell / board.size)
  const wardenColumn = wardenCell % board.size
  const playerRow = Math.floor(playerCell / board.size)
  const playerColumn = playerCell % board.size

  if (playerColumn !== wardenColumn) {
    const nextColumn = wardenColumn + (playerColumn > wardenColumn ? 1 : -1)
    const horizontalCell = wardenRow * board.size + nextColumn
    if (!board.walls.has(horizontalCell)) return horizontalCell
  }

  if (playerRow !== wardenRow) {
    const nextRow = wardenRow + (playerRow > wardenRow ? 1 : -1)
    const verticalCell = nextRow * board.size + wardenColumn
    if (!board.walls.has(verticalCell)) return verticalCell
  }

  return wardenCell
}

export function moveWardenTowardPlayer(
  board: WardenBoard,
  wardenCell: number,
  playerCell: number
): number {
  let nextWarden = wardenCell
  for (let step = 0; step < board.guardSteps; step += 1) {
    nextWarden = moveWardenOneStep(board, nextWarden, playerCell)
    if (nextWarden === playerCell) break
  }
  return nextWarden
}

export function isWardenBoardSolvable(tier: RiskTier): boolean {
  const board = buildWardenBoard(tier)
  type State = { player: number; warden: number; moves: number }
  const queue: State[] = [{ player: board.start, warden: board.wardenStart, moves: 0 }]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const state = queue.shift()!
    const key = `${state.player}:${state.warden}`
    if (seen.has(key)) continue
    seen.add(key)
    if (state.player === board.exit) return true
    if (state.moves >= board.moveBudget) continue

    for (const nextPlayer of getGridNeighbors(state.player, board.size, board.walls)) {
      if (nextPlayer === state.warden) continue
      const nextWarden = moveWardenTowardPlayer(board, state.warden, nextPlayer)
      if (nextWarden === nextPlayer) continue
      if (nextPlayer === board.exit) return true
      queue.push({ player: nextPlayer, warden: nextWarden, moves: state.moves + 1 })
    }
  }

  return false
}

const POWER_CONFIG: Record<RiskTier, Omit<PowerPuzzle, 'values'>> = {
  safe: { target: 71, tolerance: 4, maxToggles: 3, timeLimitMs: 18_000 },
  standard: { target: 70, tolerance: 2, maxToggles: 3, timeLimitMs: 15_000 },
  risky: { target: 73, tolerance: 0, maxToggles: 3, timeLimitMs: 12_000 },
}

const POWER_VALUES: Record<RiskTier, number[]> = {
  safe: [8, 12, 17, 23, 29],
  standard: [7, 11, 18, 24, 31, 36],
  risky: [6, 13, 17, 22, 29, 34, 41],
}

export function buildPowerPuzzle(seed: number, tier: RiskTier): PowerPuzzle {
  const random = seededRandom((seed ^ hashStringU32(`power-balance:${tier}`)) >>> 0)
  return {
    ...POWER_CONFIG[tier],
    values: shuffle(POWER_VALUES[tier], random),
  }
}

export function isPowerPuzzleSolved(sum: number, puzzle: PowerPuzzle): boolean {
  return Math.abs(sum - puzzle.target) <= puzzle.tolerance
}

export function splitAiCircuitScore(total: number, seed: number, playerId: string): CircuitStageScores {
  const clampedTotal = Math.max(0, Math.min(300, Math.round(total)))
  const random = seededRandom((seed ^ hashStringU32(`circuit-ai:${playerId}`)) >>> 0)
  const firstWeight = 0.29 + random() * 0.08
  const secondWeight = 0.29 + random() * 0.08
  const weights = [firstWeight, secondWeight, Math.max(0.2, 1 - firstWeight - secondWeight)]
  const weightSum = weights.reduce((sum, value) => sum + value, 0)
  const scores = weights.map((weight) => Math.round((clampedTotal * weight) / weightSum))

  for (let index = 0; index < scores.length; index += 1) {
    scores[index] = Math.max(0, Math.min(100, scores[index]))
  }
  let delta = clampedTotal - scores.reduce((sum, value) => sum + value, 0)
  let cursor = 0
  while (delta !== 0 && cursor < 1000) {
    const index = cursor % scores.length
    if (delta > 0 && scores[index] < 100) {
      scores[index] += 1
      delta -= 1
    } else if (delta < 0 && scores[index] > 0) {
      scores[index] -= 1
      delta += 1
    }
    cursor += 1
  }

  return scores as CircuitStageScores
}

export function rankCircuitResults(
  participantIds: readonly string[],
  totals: Record<string, number>,
  stages: Record<string, CircuitStageScores>,
  seed: number
): string[] {
  const tieSeed = (playerId: string) => hashStringU32(`${seed}:circuit-rank:${playerId}`)
  return [...participantIds].sort((left, right) => {
    const totalDelta = (totals[right] ?? 0) - (totals[left] ?? 0)
    if (totalDelta !== 0) return totalDelta
    const rightStages = stages[right] ?? [0, 0, 0]
    const leftStages = stages[left] ?? [0, 0, 0]
    const riskDelta = rightStages[2] - leftStages[2]
    if (riskDelta !== 0) return riskDelta
    const sequenceDelta = rightStages[1] - leftStages[1]
    if (sequenceDelta !== 0) return sequenceDelta
    return tieSeed(left) - tieSeed(right)
  })
}
