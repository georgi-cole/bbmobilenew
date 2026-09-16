import {
  buildWardenBoard,
  getGridNeighbors,
  resolveWardenTurn,
  type RiskTier,
  type WardenBoard,
} from './finalThreeCircuitLogic'

type Transform =
  | 'identity'
  | 'flipX'
  | 'flipY'
  | 'flipXY'
  | 'rotate90'
  | 'rotate270'
  | 'transpose'
  | 'antiTranspose'

const TRANSFORMS: Transform[] = [
  'identity',
  'flipX',
  'flipY',
  'flipXY',
  'rotate90',
  'rotate270',
  'transpose',
  'antiTranspose',
]

const variationCache = new Map<RiskTier, WardenBoard[]>()

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

function transformCell(cell: number, size: number, transform: Transform): number {
  const row = Math.floor(cell / size)
  const column = cell % size
  let nextRow = row
  let nextColumn = column

  switch (transform) {
    case 'flipX':
      nextColumn = size - 1 - column
      break
    case 'flipY':
      nextRow = size - 1 - row
      break
    case 'flipXY':
      nextRow = size - 1 - row
      nextColumn = size - 1 - column
      break
    case 'rotate90':
      nextRow = column
      nextColumn = size - 1 - row
      break
    case 'rotate270':
      nextRow = size - 1 - column
      nextColumn = row
      break
    case 'transpose':
      nextRow = column
      nextColumn = row
      break
    case 'antiTranspose':
      nextRow = size - 1 - column
      nextColumn = size - 1 - row
      break
    case 'identity':
    default:
      break
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

export function isWardenBoardStateSolvable(board: WardenBoard): boolean {
  type State = { player: number; warden: number; moves: number }
  const queue: State[] = [{ player: board.start, warden: board.wardenStart, moves: 0 }]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const state = queue.shift()!
    const key = `${state.player}:${state.warden}:${state.moves}`
    if (seen.has(key)) continue
    seen.add(key)

    if (state.player === board.exit) return true
    if (state.moves >= board.moveBudget) continue

    for (const nextPlayer of getGridNeighbors(state.player, board.size, board.walls)) {
      if (nextPlayer === state.warden) continue
      const turn = resolveWardenTurn(board, state.warden, nextPlayer)
      if (turn.escaped) return true
      if (turn.caught) continue
      queue.push({ player: nextPlayer, warden: turn.nextWarden, moves: state.moves + 1 })
    }
  }

  return false
}

export function getSolvableWardenVariations(tier: RiskTier): WardenBoard[] {
  const cached = variationCache.get(tier)
  if (cached) return cached

  const base = buildWardenBoard(tier)
  const unique = new Map<string, WardenBoard>()

  TRANSFORMS.forEach((transform) => {
    const board = transformBoard(base, transform)
    if (!isWardenBoardStateSolvable(board)) return
    const signature = `${board.start}|${board.exit}|${board.wardenStart}|${[...board.walls].sort((a, b) => a - b).join(',')}`
    unique.set(signature, board)
  })

  const variations = [...unique.values()]
  variationCache.set(tier, variations)
  return variations
}

export function getWardenVariationIndex(seed: number, tier: RiskTier): number {
  const count = Math.max(1, getSolvableWardenVariations(tier).length)
  return ((seed ^ hash(`warden-layout:${tier}:v3`)) >>> 0) % count
}

export function buildVariedWardenBoard(tier: RiskTier, seed: number): WardenBoard {
  const variations = getSolvableWardenVariations(tier)
  if (variations.length === 0) return buildWardenBoard(tier)
  return variations[getWardenVariationIndex(seed, tier)]
}
