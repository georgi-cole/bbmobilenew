export type CircuitStageScores = [number, number, number]
export type RiskTier = 'safe' | 'standard' | 'risky'

export interface SequenceBoard {
  id: string
  target: string[]
  initial: string[]
  maxPoints: number
  optimalSwaps: number
}

export const RISK_TIER_MAX_POINTS: Record<RiskTier, number> = {
  safe: 16,
  standard: 22,
  risky: 28,
}

export const FINAL_PUSH_STAKES = [0.1, 0.25, 0.4] as const

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

export function scorePrecisionAttempt(
  markerPosition: number,
  targetCenter: number,
  targetHalfWidth: number
): number {
  const distance = Math.abs(markerPosition - targetCenter)
  const normalized = distance / Math.max(0.01, targetHalfWidth)
  if (normalized <= 0.12) return 20
  if (normalized <= 1) return clampCircuitScore(20 - normalized * 6, 20)
  if (normalized <= 2.5) return clampCircuitScore(14 - (normalized - 1) * 9, 20)
  return 0
}

export function minimumSwapCount(current: readonly string[], target: readonly string[]): number {
  if (current.length !== target.length) return Number.POSITIVE_INFINITY
  const targetIndex = new Map(target.map((token, index) => [token, index]))
  if (targetIndex.size !== target.length || current.some((token) => !targetIndex.has(token))) {
    return Number.POSITIVE_INFINITY
  }

  const permutation = current.map((token) => targetIndex.get(token)!)
  const visited = new Array(permutation.length).fill(false)
  let cycles = 0

  for (let start = 0; start < permutation.length; start += 1) {
    if (visited[start]) continue
    cycles += 1
    let cursor = start
    while (!visited[cursor]) {
      visited[cursor] = true
      cursor = permutation[cursor]
    }
  }

  return permutation.length - cycles
}

export function scoreSequenceBoard(
  moves: number,
  optimalSwaps: number,
  maxPoints: number
): number {
  if (!Number.isFinite(optimalSwaps) || optimalSwaps < 0) return 0
  const extraMoves = Math.max(0, moves - optimalSwaps)
  const penalty = extraMoves * Math.max(3, Math.round(maxPoints * 0.14))
  const floor = Math.round(maxPoints * 0.35)
  return Math.max(floor, maxPoints - penalty)
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

export function buildSequenceBoards(seed: number): SequenceBoard[] {
  const tokenSets = [
    ['▲', '●', '◆', '■', '★', '✦'],
    ['1', '2', '3', '4', '5', '6', '7'],
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  ]
  const maxPoints = [30, 33, 37]

  return tokenSets.map((tokens, boardIndex) => {
    const random = seededRandom((seed ^ hashStringU32(`circuit-sequence:${boardIndex}`)) >>> 0)
    const target = boardIndex === 0 ? [...tokens] : shuffle(tokens, random)
    let initial = shuffle(target, random)
    let optimalSwaps = minimumSwapCount(initial, target)

    // Avoid accidental one-move boards. The circuit should become meaningfully harder.
    const required = boardIndex + 2
    let guard = 0
    while (optimalSwaps < required && guard < 12) {
      initial = shuffle(target, random)
      optimalSwaps = minimumSwapCount(initial, target)
      guard += 1
    }

    if (optimalSwaps < required) {
      initial = [...target.slice(required), ...target.slice(0, required)]
      optimalSwaps = minimumSwapCount(initial, target)
    }

    return {
      id: `board-${boardIndex + 1}`,
      target,
      initial,
      maxPoints: maxPoints[boardIndex],
      optimalSwaps,
    }
  })
}

export function scoreRiskAttempt(tier: RiskTier, accuracy: number): number {
  const normalizedAccuracy = Math.max(0, Math.min(1, accuracy))
  return clampCircuitScore(RISK_TIER_MAX_POINTS[tier] * normalizedAccuracy, 28)
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

export function splitAiCircuitScore(total: number, seed: number, playerId: string): CircuitStageScores {
  const clampedTotal = Math.max(0, Math.min(300, Math.round(total)))
  const random = seededRandom((seed ^ hashStringU32(`circuit-ai:${playerId}`)) >>> 0)
  const firstWeight = 0.29 + random() * 0.08
  const secondWeight = 0.29 + random() * 0.08
  const weights = [firstWeight, secondWeight, Math.max(0.2, 1 - firstWeight - secondWeight)]
  const weightSum = weights.reduce((sum, value) => sum + value, 0)
  const scores = weights.map((weight) => Math.round((clampedTotal * weight) / weightSum))

  const rebalance = () => {
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
  }

  rebalance()
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
