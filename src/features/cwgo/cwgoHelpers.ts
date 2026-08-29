/**
 * Pure helper functions for the "Closest Without Going Over" (CWGO) minigame.
 * All functions are deterministic given a seeded RNG.
 */
import { mulberry32 } from '../../store/rng'
import type { CwgoAnswerMode, CwgoQuestion } from './cwgoQuestions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CwgoGuessEntry {
  playerId: string
  guess: number
}

export interface CwgoResult {
  playerId: string
  guess: number
  /** Difference from the answer (answer - guess). Negative means went over. */
  diff: number
  /** Whether the guess went over the answer. */
  wentOver: boolean
  isWinner: boolean
  /** Time from the fully displayed question to submission. */
  responseTimeMs?: number
}

export interface AIResponseTimeContext {
  answerMode?: CwgoAnswerMode
  knewAnswer?: boolean
  aiSkill?: number
}

// ─── AI Guess Generator ───────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hashString(value: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function normaliseGuess(value: number, question: Pick<CwgoQuestion, 'min' | 'max'>): number {
  const min = question.min ?? 0
  const max = question.max ?? Number.MAX_SAFE_INTEGER
  return Math.round(clamp(value, min, max))
}

/**
 * Stable contestant knowledge trait derived from the player id.
 * Difficulty is deliberately not included: the contestant stays the same person,
 * while the question controls how likely that person is to know the answer.
 */
export function aiSkillForPlayer(playerId: string): number {
  const rng = mulberry32((hashString(playerId) ^ 0x6a09e667) >>> 0)
  return 0.2 + rng() * 0.75
}

/**
 * Generate a deterministic continuous estimate for a CWGO round.
 *
 * This is the correct model for questions where human answers naturally form a
 * numerical distribution. It is intentionally not used for common-knowledge
 * facts such as 365 days in a year or 1,000 metres in a kilometre.
 */
export function generateAIGuess(answer: number, aiSkill: number, seed: number): number {
  const rng = mulberry32((seed ^ 0xdeadbeef) >>> 0)

  // Clamp skill to [0, 1]
  const skill = clamp(aiSkill, 0, 1)

  // High skill → tight spread; low skill → wide, sloppy spread.
  const spread = Math.max(1, answer * (0.02 + 0.45 * (1 - skill)))

  // Aim under the answer. A skilled AI sits just below it; a weak AI aims much
  // lower (and, with the wide spread, can still overshoot or land far off).
  const margin = answer * (0.02 + 0.2 * (1 - skill))
  const target = answer - margin

  const rawGuess = Math.round(target + (rng() * 2 - 1) * spread)

  // Return at minimum 0 (no negative guesses)
  return Math.max(0, rawGuess)
}

function knowledgeProbability(question: CwgoQuestion, aiSkill: number): number {
  const difficulty = clamp(Math.round(question.difficulty), 1, 5)
  const skill = clamp(aiSkill, 0, 1)

  if (question.answerMode === 'common_knowledge') {
    // Common knowledge should produce many identical exact answers. Difficulty
    // still matters, but even a weak contestant usually knows a very easy fact.
    const baseByDifficulty = [0.985, 0.97, 0.94, 0.89, 0.82]
    const base = baseByDifficulty[difficulty - 1]
    return clamp(base + (1 - base) * skill * 0.8, 0, 0.999)
  }

  if (question.answerMode === 'exact_fact') {
    // Learned facts have a genuine know/don't-know split. Stronger contestants
    // retain a meaningful advantage, while harder questions reduce recall.
    const baseByDifficulty = [0.9, 0.72, 0.52, 0.34, 0.18]
    const base = baseByDifficulty[difficulty - 1]
    return clamp(base + (1 - base) * (0.2 + skill * 0.65), 0, 0.985)
  }

  return 0
}

function selectPlausibleMistake(question: CwgoQuestion, rng: () => number): number {
  const candidates = (question.plausibleMistakes ?? [])
    .filter((value) => Number.isFinite(value) && value !== question.answer)
    .map((value) => normaliseGuess(value, question))

  if (candidates.length > 0) {
    return candidates[Math.floor(rng() * candidates.length)]
  }

  // Defensive fallback for remotely supplied question banks that omit explicit
  // mistakes. Keep the miss discrete and recognisable rather than inventing a
  // random percentage such as 361 for a 365-day question.
  const answer = question.answer
  const fallback =
    answer <= 10
      ? answer + (rng() < 0.5 ? -1 : 1)
      : rng() < 0.5
        ? answer + (rng() < 0.5 ? -1 : 1)
        : answer * (rng() < 0.5 ? 0.1 : 10)
  return normaliseGuess(fallback, question)
}

function generateUnknownExactFactGuess(
  question: CwgoQuestion,
  aiSkill: number,
  rng: () => number
): number {
  // Most factual misses should be familiar confusions or near-neighbour values.
  if ((question.plausibleMistakes?.length ?? 0) > 0 && rng() < 0.82) {
    return selectPlausibleMistake(question, rng)
  }

  const skill = clamp(aiSkill, 0, 1)
  const difficulty = clamp(question.difficulty, 1, 5)
  const relativeSpread = 0.025 + 0.16 * (1 - skill) + 0.025 * (difficulty - 1)
  const underBias = 0.025 + 0.075 * (1 - skill)
  const multiplier = 1 - underBias + (rng() * 2 - 1) * relativeSpread
  return normaliseGuess(question.answer * multiplier, question)
}

/**
 * Generate an answer using the question's human answer model.
 *
 * The decision order is:
 *  1. Decide whether the contestant knows an exact answer.
 *  2. If known, submit the exact value.
 *  3. If unknown, use a discrete plausible mistake for common knowledge or a
 *     related/nearby factual miss for learned facts.
 *  4. Use continuous strategic estimation only for estimate-mode questions.
 */
export function generateAIQuestionGuess(
  question: CwgoQuestion,
  aiSkill: number,
  seed: number
): number {
  const rng = mulberry32((seed ^ 0x243f6a88) >>> 0)
  const skill = clamp(aiSkill, 0, 1)

  if (question.answerMode === 'common_knowledge') {
    if (rng() < knowledgeProbability(question, skill)) {
      return normaliseGuess(question.answer, question)
    }
    return selectPlausibleMistake(question, rng)
  }

  if (question.answerMode === 'exact_fact') {
    if (rng() < knowledgeProbability(question, skill)) {
      return normaliseGuess(question.answer, question)
    }
    return generateUnknownExactFactGuess(question, skill, rng)
  }

  // Difficult estimation questions widen uncertainty rather than making the AI
  // mysteriously more intelligent. This reverses the old difficulty logic.
  const difficultyPenalty = (clamp(question.difficulty, 1, 5) - 1) * 0.08
  const effectiveSkill = clamp(skill - difficultyPenalty, 0, 1)
  return normaliseGuess(generateAIGuess(question.answer, effectiveSkill, seed), question)
}

// ─── AI Skill Calibration ─────────────────────────────────────────────────────

/**
 * Legacy compatibility helper retained for callers outside CWGO.
 * New CWGO logic uses a stable per-player skill and applies difficulty through
 * knowledge probability and estimate uncertainty instead of resampling a new
 * contestant intelligence band for every question.
 */
export function aiSkillRangeForDifficulty(difficulty: number): { min: number; max: number } {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)))
  switch (d) {
    case 1:
      return { min: 0, max: 0.15 }
    case 2:
      return { min: 0.1, max: 0.4 }
    case 3:
      return { min: 0.25, max: 0.6 }
    case 4:
      return { min: 0.45, max: 0.85 }
    default:
      return { min: 0.6, max: 1 }
  }
}

/**
 * Produce a deterministic but human-like AI response time. Each player has a
 * stable speed tendency, while question difficulty and round-level jitter keep
 * their timing from looking robotic. The opening three rounds deliberately add
 * reading/typing hesitation, with some contestants becoming slower thinkers, so
 * exact-answer ties do not systematically punish the human for needing to type.
 */
export function generateAIResponseTimeMs(
  difficulty: number,
  seed: number,
  playerId: string,
  round: number,
  context?: AIResponseTimeContext
): number {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)))
  const idHash = hashString(playerId)
  const traitRng = mulberry32((idHash ^ 0x51f15e) >>> 0)
  const roundRng = mulberry32((seed ^ idHash ^ Math.imul(round + 1, 0x6d2b79f5)) >>> 0)
  const speedTrait = 0.78 + traitRng() * 0.48

  // Preserve the established timing distribution for legacy callers.
  if (!context) {
    const thinkingMs = (1_700 + d * 720 + roundRng() * (1_900 + d * 520)) * speedTrait
    return Math.round(Math.max(1_800, Math.min(13_500, thinkingMs)))
  }

  const skill = clamp(context.aiSkill ?? 0.5, 0, 1)
  const skillSpeedModifier = 1.08 - skill * 0.2
  const isOpeningRound = round < 3
  const hesitationRng = mulberry32(
    (seed ^ idHash ^ Math.imul(round + 1, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0
  )
  const openingBaseDelayMs = isOpeningRound
    ? 1_600 + hesitationRng() * Math.max(1_500, 2_600 - round * 300)
    : 0
  const slowThinkerChance = Math.max(0.2, 0.45 - round * 0.1)
  const slowThinkerDelayMs =
    isOpeningRound && hesitationRng() < slowThinkerChance ? 2_500 + hesitationRng() * 3_000 : 0
  const openingDelayMs = openingBaseDelayMs + slowThinkerDelayMs

  if (context.answerMode === 'common_knowledge' && context.knewAnswer) {
    const readingAndRecallMs = 900 + d * 180 + roundRng() * (1_250 + d * 170)
    const totalMs = readingAndRecallMs * speedTrait * skillSpeedModifier + openingDelayMs
    return Math.round(
      clamp(totalMs, isOpeningRound ? 3_200 : 1_200, isOpeningRound ? 13_500 : 6_500)
    )
  }

  if (context.answerMode === 'exact_fact' && context.knewAnswer) {
    const recallMs = 1_250 + d * 430 + roundRng() * (1_500 + d * 300)
    const totalMs = recallMs * speedTrait * skillSpeedModifier + openingDelayMs
    return Math.round(
      clamp(totalMs, isOpeningRound ? 3_600 : 1_500, isOpeningRound ? 14_500 : 8_500)
    )
  }

  const thinkingMs = (1_700 + d * 720 + roundRng() * (1_900 + d * 520)) * speedTrait
  const totalMs = thinkingMs * skillSpeedModifier + openingDelayMs
  return Math.round(
    clamp(totalMs, isOpeningRound ? 4_200 : 1_800, isOpeningRound ? 16_000 : 13_500)
  )
}

/**
 * Map a question's 1–5 difficulty rating to a player-facing label.
 */
export function difficultyLabel(
  difficulty: number
): 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard' {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)))
  return ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'][d - 1] as
    | 'Very Easy'
    | 'Easy'
    | 'Medium'
    | 'Hard'
    | 'Very Hard'
}

// ─── Winner Computation ───────────────────────────────────────────────────────

/**
 * Given a set of guesses and the true answer, determine which player wins.
 *
 * Rules:
 *  1. Any guess that exceeds the answer ("goes over") is disqualified.
 *  2. Among non-disqualified guesses, the closest (highest without going over) wins.
 *  3. Equal guesses are broken by faster response time.
 *  4. If all guesses went over, the round is void and returns null.
 *
 * @returns The winning playerId, or null if entries array is empty.
 */
export function computeWinnerClosestWithoutGoingOver(
  guesses: CwgoGuessEntry[],
  answer: number,
  responseTimesMs: Record<string, number> = {},
  tieSeed = 0
): string | null {
  if (guesses.length === 0) return null

  const valid = guesses.filter((g) => g.guess <= answer)
  // A round where everyone went over is void and must be replayed.
  if (valid.length === 0) return null

  const bestGuess = Math.max(...valid.map((entry) => entry.guess))
  const tied = valid.filter((entry) => entry.guess === bestGuess)
  return (
    [...tied].sort((a, b) => {
      const timeDiff =
        (responseTimesMs[a.playerId] ?? Number.MAX_SAFE_INTEGER) -
        (responseTimesMs[b.playerId] ?? Number.MAX_SAFE_INTEGER)
      if (timeDiff !== 0) return timeDiff
      const seededRank = (id: string) => {
        let hash = tieSeed >>> 0
        for (let index = 0; index < id.length; index += 1) {
          hash ^= id.charCodeAt(index)
          hash = Math.imul(hash, 16777619)
        }
        return hash >>> 0
      }
      return seededRank(a.playerId) - seededRank(b.playerId)
    })[0]?.playerId ?? null
  )
}

// ─── Mass Elimination ─────────────────────────────────────────────────────────

/**
 * For a mass-input round, compute which players are eliminated.
 *
 * Elimination rule:
 *  - Players whose guess goes over are eliminated, but a qualifier can never
 *    collapse from 3+ contestants straight to a single survivor. If necessary,
 *    only the worst over-guesses leave so the final always begins with two.
 *  - If no one goes over, the furthest valid guess is eliminated. An exact tie
 *    eliminates only the slower player.
 *  - If all go over, nobody is eliminated and the question is redrawn.
 */
export function computeMassElimination(
  guesses: CwgoGuessEntry[],
  answer: number,
  aliveIds: string[],
  responseTimesMs: Record<string, number> = {},
  tieSeed = 0
): { eliminated: string[]; surviving: string[]; redraw: boolean } {
  if (guesses.length === 0) return { eliminated: [], surviving: [], redraw: false }

  const overEntries = guesses.filter((g) => g.guess > answer)

  if (overEntries.length === guesses.length) {
    // Everyone missed the core rule, so discard the question without elimination.
    return { eliminated: [], surviving: [...aliveIds], redraw: true }
  }

  const seededRank = (id: string) => {
    let hash = tieSeed >>> 0
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }

  if (overEntries.length > 0) {
    // Keep at least two contestants whenever this is still a qualifier. This
    // prevents a 3-player round with two over-guesses from accidentally ending
    // the whole competition instead of producing the intended final duel.
    const eliminationCount =
      aliveIds.length > 2 ? Math.min(overEntries.length, aliveIds.length - 2) : overEntries.length
    const worstOverGuesses = [...overEntries].sort((a, b) => {
      const overshootDiff = b.guess - answer - (a.guess - answer)
      if (overshootDiff !== 0) return overshootDiff
      const timeDiff =
        (responseTimesMs[b.playerId] ?? Number.MAX_SAFE_INTEGER) -
        (responseTimesMs[a.playerId] ?? Number.MAX_SAFE_INTEGER)
      if (timeDiff !== 0) return timeDiff
      return seededRank(a.playerId) - seededRank(b.playerId)
    })
    const eliminatedSet = new Set(
      worstOverGuesses.slice(0, eliminationCount).map((entry) => entry.playerId)
    )
    const eliminated = aliveIds.filter((id) => eliminatedSet.has(id))
    const surviving = aliveIds.filter((id) => !eliminatedSet.has(id))
    return { eliminated, surviving, redraw: false }
  }

  // Nobody went over: the furthest valid guess is vulnerable. If several
  // players made that exact guess, only the slowest submission is eliminated.
  const lowestGuess = Math.min(...guesses.map((entry) => entry.guess))
  const tiedFurthest = guesses.filter((entry) => entry.guess === lowestGuess)
  const eliminatedId = [...tiedFurthest].sort((a, b) => {
    const timeDiff =
      (responseTimesMs[b.playerId] ?? Number.MAX_SAFE_INTEGER) -
      (responseTimesMs[a.playerId] ?? Number.MAX_SAFE_INTEGER)
    if (timeDiff !== 0) return timeDiff
    return seededRank(a.playerId) - seededRank(b.playerId)
  })[0]?.playerId
  const eliminated = eliminatedId ? [eliminatedId] : []
  const surviving = aliveIds.filter((id) => id !== eliminatedId)
  return { eliminated, surviving, redraw: false }
}

// ─── Sorted Results for Reveal ────────────────────────────────────────────────

/**
 * Build a sorted list of results suitable for animating a reveal.
 *
 * Returns results sorted:
 *  1. Winners first (closest without going over), then valid non-winners, then over-guessers.
 *  2. Within each group, sorted by diff ascending (closest to answer first).
 */
export function computeSortedResultsForReveal(
  guesses: CwgoGuessEntry[],
  answer: number,
  responseTimesMs: Record<string, number> = {},
  tieSeed = 0
): CwgoResult[] {
  const winnerId = computeWinnerClosestWithoutGoingOver(guesses, answer, responseTimesMs, tieSeed)

  const results: CwgoResult[] = guesses.map((g) => {
    const diff = answer - g.guess
    const wentOver = g.guess > answer
    return {
      playerId: g.playerId,
      guess: g.guess,
      diff,
      wentOver,
      isWinner: g.playerId === winnerId,
      responseTimeMs: responseTimesMs[g.playerId],
    }
  })

  return results.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1
    if (a.wentOver !== b.wentOver) return a.wentOver ? 1 : -1
    const distance = Math.abs(a.diff) - Math.abs(b.diff)
    if (distance !== 0) return distance
    return (
      (a.responseTimeMs ?? Number.MAX_SAFE_INTEGER) - (b.responseTimeMs ?? Number.MAX_SAFE_INTEGER)
    )
  })
}
