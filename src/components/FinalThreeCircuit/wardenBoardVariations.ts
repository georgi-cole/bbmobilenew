import { buildWardenBoard, type RiskTier, type WardenBoard } from './finalThreeCircuitLogic'

export const WARDEN_VARIATION_COUNT = 4

type Transform = 'identity' | 'flipX' | 'flipY' | 'flipXY'

const TRANSFORMS: Transform[] = ['identity', 'flipX', 'flipY', 'flipXY']

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
  const nextRow = transform === 'flipY' || transform === 'flipXY' ? size - 1 - row : row
  const nextColumn = transform === 'flipX' || transform === 'flipXY' ? size - 1 - column : column
  return nextRow * size + nextColumn
}

export function getWardenVariationIndex(seed: number, tier: RiskTier): number {
  return (seed ^ hash(`warden-layout:${tier}`)) >>> 0 % WARDEN_VARIATION_COUNT
}

export function buildVariedWardenBoard(tier: RiskTier, seed: number): WardenBoard {
  const base = buildWardenBoard(tier)
  const transform = TRANSFORMS[getWardenVariationIndex(seed, tier)]
  if (transform === 'identity') return base

  return {
    ...base,
    start: transformCell(base.start, base.size, transform),
    exit: transformCell(base.exit, base.size, transform),
    wardenStart: transformCell(base.wardenStart, base.size, transform),
    walls: new Set([...base.walls].map((cell) => transformCell(cell, base.size, transform))),
  }
}
