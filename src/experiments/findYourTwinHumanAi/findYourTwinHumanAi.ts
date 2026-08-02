import { mulberry32 } from '../../store/rng'
import {
  PENALTY_DEATH,
  PENALTY_OUT_OF_LIVES,
  RESPAWN_PENALTY,
  SCORE_BRICK,
  SCORE_CHECKPOINT,
  SCORE_COIN,
  SCORE_ENEMY,
  TIME_LIMIT_MS,
} from '../../minigames/castleRescue/castleRescueConstants'
import { generateLevelConfig } from '../../minigames/castleRescue/castleRescueGenerator'
import { computePlatformerFinalScore } from '../../minigames/castleRescue/castleRescuePlatformerLogic'
import type { CastleRescueEndReason } from '../../minigames/castleRescue/castleRescueSession'

export type FindYourTwinExperimentDifficulty = 'friendly' | 'balanced' | 'competitive'

export interface FindYourTwinHumanTelemetry {
  seed: number
  finalScore: number
  elapsedMs: number
  endReason: CastleRescueEndReason
  rescued: boolean
  pipesComplete: number
  pipeEntries: number
  wrongPipes: number
  roomsEntered: number
  deaths: number
  jumps: number
  directionChanges: number
  coinsCollected: number
  enemiesStomped: number
  bricksBroken: number
  checkpointsActivated: number
  longestFrameMs: number
}

export interface FindYourTwinAiConfig {
  id: string
  name: string
  moveSpeedPxPerSecond: number
  navigationEfficiency: number
  pickupAwareness: number
  combatControl: number
  hazardMistakeRate: number
  decisionMinMs: number
  decisionMaxMs: number
}

export type FindYourTwinAiActionType =
  | 'move'
  | 'jump'
  | 'pipe'
  | 'room'
  | 'death'
  | 'collect'
  | 'rescue'

export interface FindYourTwinAiAction {
  atMs: number
  type: FindYourTwinAiActionType
  detail: string
  scoreAfter: number
}

export interface FindYourTwinAiResult extends FindYourTwinHumanTelemetry {
  id: string
  name: string
  bandTargetScore: number
  scoreGap: number
  targetReached: boolean
  correctRoute: readonly number[]
  lockedRouteSlot: number | null
  actions: FindYourTwinAiAction[]
}

export const FIND_YOUR_TWIN_EXPERIMENT_FIELD: readonly FindYourTwinAiConfig[] = [
  {
    id: 'scout',
    name: 'Nova — curious scout',
    moveSpeedPxPerSecond: 238,
    navigationEfficiency: 0.78,
    pickupAwareness: 0.7,
    combatControl: 0.68,
    hazardMistakeRate: 0.035,
    decisionMinMs: 520,
    decisionMaxMs: 1_050,
  },
  {
    id: 'runner',
    name: 'Milo — route runner',
    moveSpeedPxPerSecond: 258,
    navigationEfficiency: 0.86,
    pickupAwareness: 0.47,
    combatControl: 0.74,
    hazardMistakeRate: 0.026,
    decisionMinMs: 390,
    decisionMaxMs: 820,
  },
  {
    id: 'treasure',
    name: 'Zara — treasure hunter',
    moveSpeedPxPerSecond: 226,
    navigationEfficiency: 0.72,
    pickupAwareness: 0.86,
    combatControl: 0.62,
    hazardMistakeRate: 0.042,
    decisionMinMs: 610,
    decisionMaxMs: 1_180,
  },
] as const

const PIPE_X = [490, 860, 1400, 1810, 2760, 3110] as const
const CHECKPOINTS = [
  { x: 1065, respawnX: 80 },
  { x: 2295, respawnX: 1075 },
  { x: 3510, respawnX: 2305 },
] as const
const MAIN_COIN_X = [
  230, 262, 460, 492, 524, 780, 812, 1190, 1222, 1420, 1452, 1484, 1680, 2110, 2142, 2410, 2442,
  2474, 2680, 2712, 2940, 2972, 3172, 3204, 3640, 3672, 3704, 4100, 4132, 4570, 4602, 4634,
] as const
const MAIN_BRICK_X = [
  218, 250, 460, 492, 760, 1170, 1202, 1410, 1442, 1660, 2100, 2132, 2400, 2432, 2660, 2692, 2930,
  3162, 3622, 3654, 4080,
] as const
const MAIN_ENEMY_X = [240, 650, 1270, 1520, 1800, 2190, 2530, 2890, 3310, 3740, 4220, 4640] as const
const TWIN_X = 4670
const DIFFICULTY_SCALE: Record<FindYourTwinExperimentDifficulty, number> = {
  friendly: 0.88,
  balanced: 1,
  competitive: 1.08,
}

function hashIdentity(value: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function ranged(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

function crossed(x: number, from: number, to: number): boolean {
  return x >= Math.min(from, to) && x <= Math.max(from, to)
}

function resolveLockedRoute(seed: number): { lockedSlot: number | null; keySlot: number | null } {
  const config = generateLevelConfig(seed)
  const rng = mulberry32(((seed >>> 0) ^ 0xf00dcafe) >>> 0)
  if (rng() >= 0.5) return { lockedSlot: null, keySlot: null }
  const keys = Object.keys(config.wrongPipeTypes)
    .map(Number)
    .filter((slot) => {
      const type = config.wrongPipeTypes[slot]
      return type === 'bonus' || type === 'ambush'
    })
  if (keys.length === 0) return { lockedSlot: null, keySlot: null }
  return {
    lockedSlot: config.correctPipeSlots[2],
    keySlot: keys[Math.floor(rng() * keys.length)],
  }
}

export function simulateHumanlikeFindYourTwinAi({
  seed,
  config,
  difficulty = 'balanced',
  timeLimitMs = TIME_LIMIT_MS,
}: {
  seed: number
  config: FindYourTwinAiConfig
  difficulty?: FindYourTwinExperimentDifficulty
  timeLimitMs?: number
}): FindYourTwinAiResult {
  const level = generateLevelConfig(seed)
  const lock = resolveLockedRoute(seed)
  const rng = mulberry32(((seed >>> 0) ^ hashIdentity(config.id) ^ 0x52a7b91d) >>> 0)
  const difficultyScale = DIFFICULTY_SCALE[difficulty]
  const moveSpeed = config.moveSpeedPxPerSecond * difficultyScale
  const pickupAwareness = Math.min(0.96, config.pickupAwareness * difficultyScale)
  const navigationEfficiency = Math.min(0.97, config.navigationEfficiency * difficultyScale)
  const combatControl = Math.min(0.95, config.combatControl * difficultyScale)
  const hazardRate = config.hazardMistakeRate / difficultyScale
  let elapsedMs = Math.round(ranged(rng, config.decisionMinMs, config.decisionMaxMs))
  let position = 80
  let spawnX = 80
  let score = 0
  let hearts = 3
  let pipesComplete = 0
  let pipeEntries = 0
  let wrongPipes = 0
  let roomsEntered = 0
  let deaths = 0
  let jumps = 0
  let directionChanges = 0
  let lastDirection = 0
  let enemiesStomped = 0
  let coinsCollected = 0
  let bricksBroken = 0
  let checkpointsActivated = 0
  let endReason: CastleRescueEndReason = 'timeout'
  let rescued = false
  let locked = lock.lockedSlot !== null
  const actions: FindYourTwinAiAction[] = []
  const usedPipes = new Set<number>()
  const collectedCoins = new Set<number>()
  const brokenBricks = new Set<number>()
  const defeatedEnemies = new Set<number>()
  const activatedCheckpoints = new Set<number>()
  let attemptedThisStage = new Set<number>()

  const push = (type: FindYourTwinAiActionType, detail: string) => {
    actions.push({ atMs: Math.round(elapsedMs), type, detail, scoreAfter: score })
  }

  const collectAlongPath = (from: number, to: number) => {
    CHECKPOINTS.forEach((checkpoint, index) => {
      if (!activatedCheckpoints.has(index) && crossed(checkpoint.x, from, to)) {
        activatedCheckpoints.add(index)
        checkpointsActivated += 1
        spawnX = checkpoint.respawnX
        score += SCORE_CHECKPOINT
        push('collect', `activated checkpoint ${index + 1}`)
      }
    })
    MAIN_COIN_X.forEach((x, index) => {
      if (!collectedCoins.has(index) && crossed(x, from, to) && rng() < pickupAwareness) {
        collectedCoins.add(index)
        coinsCollected += 1
        score += SCORE_COIN
        push('collect', `collected Eyeolean ${index + 1}`)
      }
    })
    MAIN_BRICK_X.forEach((x, index) => {
      if (!brokenBricks.has(index) && crossed(x, from, to) && rng() < pickupAwareness * 0.42) {
        brokenBricks.add(index)
        bricksBroken += 1
        score += SCORE_BRICK
        push('collect', `broke brick ${index + 1}`)
      }
    })
    MAIN_ENEMY_X.forEach((x, index) => {
      if (!defeatedEnemies.has(index) && crossed(x, from, to) && rng() < combatControl) {
        defeatedEnemies.add(index)
        enemiesStomped += 1
        score += SCORE_ENEMY
        push('collect', `stomped enemy ${index + 1}`)
      }
    })
  }

  const travelTo = (target: number, detail: string): boolean => {
    if (elapsedMs >= timeLimitMs || hearts <= 0) return false
    const from = position
    const direction = Math.sign(target - from)
    if (lastDirection !== 0 && direction !== 0 && direction !== lastDirection) directionChanges += 1
    if (direction !== 0) lastDirection = direction
    const distance = Math.abs(target - from)
    const terrainFactor = ranged(rng, 1.08, 1.24) / Math.max(0.65, navigationEfficiency)
    const duration = (distance / moveSpeed) * 1000 * terrainFactor
    const segmentJumps = Math.max(0, Math.round((distance / 360) * ranged(rng, 0.75, 1.25)))
    jumps += segmentJumps
    elapsedMs += duration
    position = target
    push('move', `${detail}: ${Math.round(distance)}px in ${(duration / 1000).toFixed(1)}s`)
    for (let jumpIndex = 0; jumpIndex < segmentJumps; jumpIndex += 1) {
      const jumpAt = elapsedMs - duration + ((jumpIndex + 1) / (segmentJumps + 1)) * duration
      actions.push({
        atMs: Math.round(jumpAt),
        type: 'jump',
        detail: 'cleared terrain',
        scoreAfter: score,
      })
    }
    collectAlongPath(from, target)

    const hazardExposure = distance / 650
    if (rng() < 1 - Math.pow(1 - hazardRate, hazardExposure)) {
      deaths += 1
      hearts -= 1
      score = Math.max(0, score - PENALTY_DEATH)
      elapsedMs += ranged(rng, 650, 1_050)
      push('death', `mistimed obstacle; ${hearts} hearts left`)
      if (hearts <= 0) {
        score = Math.max(0, score - PENALTY_OUT_OF_LIVES)
        endReason = 'out_of_lives'
        return false
      }
      position = spawnX
    }
    return elapsedMs < timeLimitMs
  }

  while (pipesComplete < 3 && elapsedMs < timeLimitMs && hearts > 0) {
    const candidates = PIPE_X.map((_, slot) => slot).filter((slot) => {
      if (usedPipes.has(slot) || attemptedThisStage.has(slot)) return false
      if (locked && slot === lock.lockedSlot) return true
      return true
    })
    if (candidates.length === 0) {
      attemptedThisStage = new Set<number>()
      continue
    }

    const nearest = [...candidates].sort(
      (left, right) => Math.abs(PIPE_X[left] - position) - Math.abs(PIPE_X[right] - position)
    )[0]
    const slot =
      rng() < navigationEfficiency ? nearest : candidates[Math.floor(rng() * candidates.length)]
    attemptedThisStage.add(slot)
    if (!travelTo(PIPE_X[slot], `approached pipe ${slot + 1}`)) break
    elapsedMs += ranged(rng, config.decisionMinMs, config.decisionMaxMs) / difficultyScale
    pipeEntries += 1

    if (locked && slot === lock.lockedSlot) {
      push('pipe', `pipe ${slot + 1} was visibly locked`)
      elapsedMs += 700
      continue
    }

    const routeIndex = level.correctPipeSlots.indexOf(slot)
    if (routeIndex === pipesComplete) {
      usedPipes.add(slot)
      pipesComplete += 1
      push('pipe', `found route pipe ${pipesComplete} of 3 at slot ${slot + 1}`)
      attemptedThisStage = new Set<number>()
      continue
    }

    if (routeIndex >= 0) {
      wrongPipes += 1
      score = Math.max(0, score - RESPAWN_PENALTY)
      elapsedMs += 700
      position = spawnX
      push('pipe', `correct route pipe tried out of order at slot ${slot + 1}`)
      continue
    }

    const wrongType = level.wrongPipeTypes[slot]
    usedPipes.add(slot)
    if (wrongType === 'setback') {
      wrongPipes += 1
      score = Math.max(0, score - RESPAWN_PENALTY)
      elapsedMs += 700
      position = spawnX
      push('pipe', `setback pipe ${slot + 1}; returned to checkpoint`)
    } else if (wrongType === 'dead') {
      elapsedMs += 700
      push('pipe', `dead-end pipe ${slot + 1}`)
    } else {
      roomsEntered += 1
      const isBonus = wrongType === 'bonus'
      const roomDuration = ranged(rng, isBonus ? 8_500 : 9_500, isBonus ? 14_500 : 16_500)
      elapsedMs += roomDuration / difficultyScale
      const roomCoins = isBonus
        ? Math.round(10 * pickupAwareness * ranged(rng, 0.7, 1))
        : Math.round(3 * pickupAwareness * ranged(rng, 0.65, 1))
      const roomBricks = isBonus ? Math.round(6 * pickupAwareness * ranged(rng, 0.45, 0.9)) : 0
      const roomEnemies = isBonus ? 0 : Math.round(5 * combatControl * ranged(rng, 0.45, 0.95))
      coinsCollected += roomCoins
      bricksBroken += roomBricks
      enemiesStomped += roomEnemies
      score += roomCoins * SCORE_COIN + roomBricks * SCORE_BRICK + roomEnemies * SCORE_ENEMY
      push(
        'room',
        `${wrongType} room: ${roomCoins} coins, ${roomBricks} bricks, ${roomEnemies} enemies`
      )
      if (!isBonus && rng() > combatControl + 0.12) {
        deaths += 1
        hearts -= 1
        score = Math.max(0, score - PENALTY_DEATH)
        push('death', `hit in ambush room; ${hearts} hearts left`)
      }
      if (slot === lock.keySlot) locked = false
      position = spawnX
    }
  }

  if (pipesComplete === 3 && hearts > 0 && elapsedMs < timeLimitMs) {
    if (travelTo(TWIN_X, 'ran through the opened gate to the twin') && elapsedMs < timeLimitMs) {
      rescued = true
      endReason = 'rescued'
      push('rescue', 'found the twin')
    }
  }

  if (hearts <= 0) endReason = 'out_of_lives'
  else if (!rescued) {
    endReason = 'timeout'
    elapsedMs = Math.min(Math.max(elapsedMs, timeLimitMs), timeLimitMs)
  }

  const finalScore = computePlatformerFinalScore(
    { score, princessRescued: rescued },
    Math.min(elapsedMs, timeLimitMs)
  )
  return {
    id: config.id,
    name: config.name,
    seed,
    finalScore,
    elapsedMs: Math.round(Math.min(elapsedMs, timeLimitMs)),
    endReason,
    rescued,
    pipesComplete,
    pipeEntries,
    wrongPipes,
    roomsEntered,
    deaths,
    jumps,
    directionChanges,
    coinsCollected,
    enemiesStomped,
    bricksBroken,
    checkpointsActivated,
    longestFrameMs: 0,
    bandTargetScore: finalScore,
    scoreGap: 0,
    targetReached: true,
    correctRoute: level.correctPipeSlots,
    lockedRouteSlot: lock.lockedSlot,
    actions: actions.sort((left, right) => left.atMs - right.atMs),
  }
}

export function simulateFindYourTwinCompetitionScore({
  seed,
  playerId,
  participantIndex = 0,
  difficulty = 'balanced',
  timeLimitMs = TIME_LIMIT_MS,
}: {
  seed: number
  playerId?: string
  participantIndex?: number
  difficulty?: FindYourTwinExperimentDifficulty
  timeLimitMs?: number
}): number {
  const identity = playerId || `castle-rescue-participant-${participantIndex}`
  const archetype =
    FIND_YOUR_TWIN_EXPERIMENT_FIELD[hashIdentity(identity) % FIND_YOUR_TWIN_EXPERIMENT_FIELD.length]
  return simulateHumanlikeFindYourTwinAi({
    seed,
    difficulty,
    timeLimitMs,
    config: { ...archetype, id: identity },
  }).finalScore
}

export function simulateHumanlikeFindYourTwinField(
  seed: number,
  difficulty: FindYourTwinExperimentDifficulty
): FindYourTwinAiResult[] {
  return FIND_YOUR_TWIN_EXPERIMENT_FIELD.map((config) =>
    simulateHumanlikeFindYourTwinAi({ seed, config, difficulty })
  )
}
