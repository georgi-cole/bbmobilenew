import type { CircuitStageScores } from './finalThreeCircuitLogic'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
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

function centeredHumanNoise(random: () => number): number {
  // Three samples create a bell-ish distribution without allowing every AI run
  // to live at an extreme. The output is approximately -1..1 and clusters near 0.
  return ((random() + random() + random()) / 3 - 0.5) * 2
}

export function normalizeCircuitAiAbility(rawScore: number): number {
  if (!Number.isFinite(rawScore)) return 0.5

  // Minigame Lab passes generic 0-100 scores. Real challenge simulation can pass
  // the Circuit's native 150-285 range. In both cases this value is treated as
  // an ability signal, not as a final score that must be preserved exactly.
  if (rawScore <= 100) return clamp(rawScore / 100, 0, 1)
  return clamp((rawScore - 150) / 135, 0, 1)
}

function stageScore(
  meanLow: number,
  meanHigh: number,
  spread: number,
  floor: number,
  ceiling: number,
  ability: number,
  random: () => number
): number {
  const mean = meanLow + (meanHigh - meanLow) * ability
  let score = mean + centeredHumanNoise(random) * spread

  // Even strong humans occasionally make a material mistake. This prevents the
  // AI from feeling like a deterministic calculator while still rewarding skill.
  const errorChance = 0.2 - ability * 0.12
  if (random() < errorChance) {
    score -= 7 + random() * (10 + (1 - ability) * 7)
  }

  return Math.round(clamp(score, floor, ceiling))
}

/**
 * Produces human-like Final Three Circuit stage scores.
 *
 * The old implementation split one precomputed total across all three stages,
 * which made AI players look unnaturally consistent and often near-perfect.
 * Here the upstream score only sets an ability band; each discipline gets its
 * own realistic range plus deterministic human variance and occasional errors.
 */
export function simulateAiCircuitScores(
  rawAbilityScore: number,
  seed: number,
  playerId: string
): CircuitStageScores {
  const ability = normalizeCircuitAiAbility(rawAbilityScore)
  const random = seededRandom((seed ^ hashStringU32(`circuit-human-ai:${playerId}`)) >>> 0)

  const signal = stageScore(52, 86, 10, 28, 95, ability, random)
  const sequence = stageScore(43, 84, 14, 20, 96, ability, random)
  const risk = stageScore(39, 79, 13, 18, 94, ability, random)

  return [signal, sequence, risk]
}
