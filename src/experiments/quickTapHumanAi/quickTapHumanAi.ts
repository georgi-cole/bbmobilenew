import {
  selectBoosterPrompts,
  simulateQuickTapAiScore,
  type BoosterType,
} from '../../ai/competition/quickTapSimulation'
import { mulberry32 } from '../../store/rng'

export type QuickTapExperimentDifficulty = 'friendly' | 'balanced' | 'competitive'

/** Clean real-phone run used as the strong-human physical calibration anchor. */
export const QUICK_TAP_PHONE_BASELINE = {
  elapsedSeconds: 33.01,
  rawTaps: 248,
  sustainedTapsPerSecond: 7.51,
  peakOneSecondTaps: 13,
  medianInterTapMs: 99,
  fastestInterTapMs: 47,
  maxConcurrentPointers: 2,
} as const

export interface QuickTapHumanAiConfig {
  id: string
  name: string
  baseTapsPerSecond: number
  fatigue: number
  burstiness: number
  boosterRisk: number
  reactionMinMs: number
  reactionMaxMs: number
}

export interface QuickTapAiAction {
  atMs: number
  type: 'tap' | 'booster'
  boosterType?: BoosterType
  scoreAfter: number
}

export interface QuickTapBoosterDecision {
  type: BoosterType
  scheduledAtMs: number
  taken: boolean
  reactionMs: number | null
  beneficial: boolean
}

export interface QuickTapHumanAiResult {
  id: string
  name: string
  effectiveScore: number
  rawTaps: number
  averageTapsPerSecond: number
  openingReactionMs: number
  elapsedMs: number
  bandTargetScore: number
  scoreGap: number
  targetReached: boolean
  boosters: QuickTapBoosterDecision[]
  actions: QuickTapAiAction[]
}

export const QUICK_TAP_EXPERIMENT_FIELD: readonly QuickTapHumanAiConfig[] = [
  {
    id: 'sprinter',
    name: 'Nova — fast starter',
    baseTapsPerSecond: 7.56,
    fatigue: 0.28,
    burstiness: 0.3,
    boosterRisk: 0.66,
    reactionMinMs: 180,
    reactionMaxMs: 340,
  },
  {
    id: 'steady',
    name: 'Milo — steady rhythm',
    baseTapsPerSecond: 6.93,
    fatigue: 0.08,
    burstiness: 0.12,
    boosterRisk: 0.56,
    reactionMinMs: 250,
    reactionMaxMs: 470,
  },
  {
    id: 'gambler',
    name: 'Zara — booster hunter',
    baseTapsPerSecond: 7.25,
    fatigue: 0.17,
    burstiness: 0.22,
    boosterRisk: 0.88,
    reactionMinMs: 210,
    reactionMaxMs: 410,
  },
] as const

const DIFFICULTY_TARGET_SCALE: Record<QuickTapExperimentDifficulty, number> = {
  friendly: 0.85,
  balanced: 1.1,
  competitive: 1.23,
}

const MIN_PLAUSIBLE_TAPS_PER_SECOND = 3.5
const MAX_PLAUSIBLE_TAPS_PER_SECOND = 12
const ACCEPTABLE_SCORE_GAP = 3

const COMPETITIVE_RHYTHM_BAND = { min: 7.1, max: 8.7 } as const

function rhythmBandDistance(
  averageTapsPerSecond: number,
  difficulty: QuickTapExperimentDifficulty
): number {
  if (difficulty === 'friendly') return 0
  if (averageTapsPerSecond < COMPETITIVE_RHYTHM_BAND.min) {
    return COMPETITIVE_RHYTHM_BAND.min - averageTapsPerSecond
  }
  if (averageTapsPerSecond > COMPETITIVE_RHYTHM_BAND.max) {
    return averageTapsPerSecond - COMPETITIVE_RHYTHM_BAND.max
  }
  return 0
}

function hashIdentity(value: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function ranged(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

/**
 * Experimental action-based Quick Tap opponent.
 *
 * Unlike the production score-band model, this creates the same actions a human
 * can create: delayed taps, variable rhythm, pauses, fatigue, and mystery-booster
 * choices. Booster acceptance is rolled before its revealed effect is applied, so
 * the opponent never uses hidden knowledge to avoid a harmful pickup.
 */
function simulateActionTrace({
  seed,
  config,
  baseTapsPerSecond,
  durationSeconds = 30,
}: {
  seed: number
  config: QuickTapHumanAiConfig
  baseTapsPerSecond: number
  durationSeconds?: number
}): Omit<QuickTapHumanAiResult, 'bandTargetScore' | 'scoreGap' | 'targetReached'> {
  const rng = mulberry32(((seed >>> 0) ^ hashIdentity(config.id) ^ 0x71a9c3e5) >>> 0)
  const prompts = selectBoosterPrompts(seed)
  const openingReactionMs = Math.round(ranged(rng, config.reactionMinMs, config.reactionMaxMs))

  // Decide whether to take each mystery box without consulting its hidden type.
  const boosterPlans = prompts.map((prompt) => {
    const taken = rng() < config.boosterRisk
    const reactionMs = taken ? Math.round(ranged(rng, 260, 920)) : null
    return {
      prompt,
      taken,
      reactionMs,
      // Skips still get an event at prompt time so later prompts remain reachable.
      activationAtMs: prompt.scheduleAt * 1000 + (reactionMs ?? 0),
    }
  })

  let finishAtMs = durationSeconds * 1000
  let nextTapAtMs = openingReactionMs
  let boosterIndex = 0
  let rawTaps = 0
  let effectiveScore = 0
  let activeMultiplier = 1
  let multiplierEndsAtMs = 0
  let drainInertiaTapsRemaining = 0
  const actions: QuickTapAiAction[] = []

  while (true) {
    const nextBoosterAtMs = boosterPlans[boosterIndex]?.activationAtMs ?? Number.POSITIVE_INFINITY
    const nextEventAtMs = Math.min(nextTapAtMs, nextBoosterAtMs)
    if (nextEventAtMs >= finishAtMs) break

    if (nextBoosterAtMs <= nextTapAtMs) {
      const plan = boosterPlans[boosterIndex]
      boosterIndex += 1
      const visibleUntilMs = (plan.prompt.scheduleAt + plan.prompt.visibleFor) * 1000
      if (!plan.taken || nextBoosterAtMs > visibleUntilMs) continue

      if (plan.prompt.kind === 'time') {
        finishAtMs = Math.max(nextBoosterAtMs, finishAtMs + (plan.prompt.timeDelta ?? 0) * 1000)
      } else {
        activeMultiplier = plan.prompt.multiplier ?? 1
        multiplierEndsAtMs = nextBoosterAtMs + plan.prompt.activeDuration * 1000
        if (activeMultiplier < 0) {
          // A small number of momentum taps slip through before the opponent
          // recognizes the revealed drain and stops.
          drainInertiaTapsRemaining = 1 + Math.floor(rng() * 3)
        }
      }
      actions.push({
        atMs: Math.round(nextBoosterAtMs),
        type: 'booster',
        boosterType: plan.prompt.type,
        scoreAfter: effectiveScore,
      })
      continue
    }

    if (nextTapAtMs >= multiplierEndsAtMs) {
      activeMultiplier = 1
      drainInertiaTapsRemaining = 0
    }
    rawTaps += 1
    effectiveScore += activeMultiplier
    actions.push({
      atMs: Math.round(nextTapAtMs),
      type: 'tap',
      scoreAfter: effectiveScore,
    })

    const progress = clamp(nextTapAtMs / Math.max(1, finishAtMs), 0, 1)
    const fatigueScale = 1 - config.fatigue * progress
    const rhythmNoise = 1 + (rng() - 0.5) * config.burstiness
    const tapsPerSecond = Math.max(1, baseTapsPerSecond * fatigueScale * rhythmNoise)
    let intervalMs = 1000 / tapsPerSecond

    // Short bursts and occasional hesitations keep the trace from looking metronomic.
    const behaviorRoll = rng()
    if (behaviorRoll < 0.08) intervalMs *= ranged(rng, 0.62, 0.84)
    else if (behaviorRoll > 0.95) intervalMs += ranged(rng, 180, 520)
    intervalMs += (rng() + rng() + rng() - 1.5) * 42
    nextTapAtMs += clamp(intervalMs, 72, 780)
    if (activeMultiplier < 0) {
      drainInertiaTapsRemaining -= 1
      if (drainInertiaTapsRemaining <= 0) {
        nextTapAtMs = Math.max(nextTapAtMs, multiplierEndsAtMs)
      }
    }
  }

  const boosters: QuickTapBoosterDecision[] = boosterPlans.map((plan) => ({
    type: plan.prompt.type,
    scheduledAtMs: plan.prompt.scheduleAt * 1000,
    taken: plan.taken,
    reactionMs: plan.reactionMs,
    beneficial: plan.prompt.beneficial,
  }))

  return {
    id: config.id,
    name: config.name,
    effectiveScore,
    rawTaps,
    averageTapsPerSecond: Number((rawTaps / Math.max(1, finishAtMs / 1000)).toFixed(2)),
    openingReactionMs,
    elapsedMs: Math.round(finishAtMs),
    boosters,
    actions,
  }
}

/**
 * Hybrid experimental opponent: production's weighted score bands establish the
 * fair result target, while an action trace has to earn that score using bounded
 * human-like tapping and the same mystery-booster sequence as the player.
 * Unreachable targets remain visible as a score gap instead of being fabricated.
 */
export function simulateHumanlikeQuickTapAi({
  seed,
  config,
  difficulty = 'balanced',
  durationSeconds = 30,
  forceAllBoosters = false,
}: {
  seed: number
  config: QuickTapHumanAiConfig
  difficulty?: QuickTapExperimentDifficulty
  durationSeconds?: number
  forceAllBoosters?: boolean
}): QuickTapHumanAiResult {
  const productionBandScore = simulateQuickTapAiScore({
    seed,
    playerId: config.id,
    timeLimitSeconds: durationSeconds,
  })
  const bandTargetScore = Math.round(productionBandScore * DIFFICULTY_TARGET_SCALE[difficulty])

  let bestRate = MIN_PLAUSIBLE_TAPS_PER_SECOND
  let best = simulateActionTrace({
    seed,
    config: forceAllBoosters ? { ...config, boosterRisk: 1 } : config,
    baseTapsPerSecond: bestRate,
    durationSeconds,
  })

  for (
    let rate = MIN_PLAUSIBLE_TAPS_PER_SECOND + 0.1;
    rate <= MAX_PLAUSIBLE_TAPS_PER_SECOND + 0.001;
    rate += 0.1
  ) {
    const candidate = simulateActionTrace({
      seed,
      config: forceAllBoosters ? { ...config, boosterRisk: 1 } : config,
      baseTapsPerSecond: rate,
      durationSeconds,
    })
    const candidateGap = Math.abs(candidate.effectiveScore - bandTargetScore)
    const bestGap = Math.abs(best.effectiveScore - bandTargetScore)
    const candidateRhythmDistance = rhythmBandDistance(candidate.averageTapsPerSecond, difficulty)
    const bestRhythmDistance = rhythmBandDistance(best.averageTapsPerSecond, difficulty)
    if (
      candidateRhythmDistance < bestRhythmDistance ||
      (candidateRhythmDistance === bestRhythmDistance &&
        (candidateGap < bestGap ||
          (candidateGap === bestGap &&
            Math.abs(rate - config.baseTapsPerSecond) <
              Math.abs(bestRate - config.baseTapsPerSecond))))
    ) {
      best = candidate
      bestRate = rate
    }
  }

  const scoreGap = best.effectiveScore - bandTargetScore
  return {
    ...best,
    bandTargetScore,
    scoreGap,
    targetReached: Math.abs(scoreGap) <= ACCEPTABLE_SCORE_GAP,
  }
}

export function simulateHumanlikeQuickTapField(
  seed: number,
  difficulty: QuickTapExperimentDifficulty,
  options: { forceAllBoosters?: boolean } = {}
): QuickTapHumanAiResult[] {
  return QUICK_TAP_EXPERIMENT_FIELD.map((config) =>
    simulateHumanlikeQuickTapAi({
      seed,
      config,
      difficulty,
      forceAllBoosters: options.forceAllBoosters,
    })
  )
}
