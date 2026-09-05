import { mulberry32 } from '../../store/rng'
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin'
import {
  CAPITALIZATION_CONTINENTS,
  CAPITALIZATION_COUNTRIES_BY_CONTINENT,
  type CapitalizationContinent,
  type CapitalizationCountry,
} from './capitalizationData'

export const CAPITALIZATION_TOTAL_CONTINENTS = 3
export const CAPITALIZATION_QUESTIONS_PER_CONTINENT = 3
export const CAPITALIZATION_TOTAL_QUESTIONS =
  CAPITALIZATION_TOTAL_CONTINENTS * CAPITALIZATION_QUESTIONS_PER_CONTINENT
export const CAPITALIZATION_ELIMINATION_RATE = 0.3

export interface CapitalizationQuestion extends CapitalizationCountry {
  continent: CapitalizationContinent
  questionNumber: number
}

export interface CapitalizationQuestionSet {
  continents: CapitalizationContinent[]
  questions: CapitalizationQuestion[]
}

export interface CapitalizationParticipant {
  id: string
  name: string
  isHuman: boolean
  precomputedScore: number
}

export interface CapitalizationRoundPerformance {
  guessed: boolean
  attempts: number
  timeMs: number
  skipped?: boolean
  incorrect?: boolean
  hintUsed?: boolean
}

export interface CapitalizationStanding {
  participantId: string
  participantName: string
  isHuman: boolean
  cumulativeScore: number
  correctAnswers: number
  questionsPlayed: number
  lastQuestionScore: number
  lastQuestionAttempts: number
  lastQuestionTimeMs: number
  lastQuestionGuessed: boolean
  lastQuestionHintUsed: boolean
  hintsUsed: number
  eliminatedAfterQuestion: number | null
}

export interface CapitalizationAiRngContext {
  seed: number
  questionNumber: number
  participantId: string
}

export interface CapitalizationAiPerformanceContext {
  participant: CapitalizationParticipant
  question: CapitalizationQuestion
}

export function resolveCapitalizationRunSeed(
  seed: number | undefined,
  makeSeed: () => number = cryptoSeed
): number {
  return seed !== undefined && seed !== 0 ? seed : makeSeed()
}

export function buildCapitalizationQuestionSet(seed: number): CapitalizationQuestionSet {
  const rng = mulberry32(seed >>> 0)
  const continents = shuffleWithRng(CAPITALIZATION_CONTINENTS, rng).slice(
    0,
    CAPITALIZATION_TOTAL_CONTINENTS
  )
  const questions = continents.flatMap((continent, continentIndex) => {
    const countries = CAPITALIZATION_COUNTRIES_BY_CONTINENT[continent]
    const difficultyPools = [
      countries.filter((country) => country.difficulty <= 2),
      countries.filter((country) => country.difficulty === 3),
      countries.filter((country) => country.difficulty >= 4),
    ]
    return difficultyPools
      .map((pool) => shuffleWithRng(pool, rng)[0])
      .filter((item): item is CapitalizationCountry => Boolean(item))
      .map((item, questionIndex) => ({
        ...item,
        continent,
        questionNumber: continentIndex * CAPITALIZATION_QUESTIONS_PER_CONTINENT + questionIndex + 1,
      }))
  })

  return { continents, questions }
}

export function createCapitalizationStandings(
  participants: CapitalizationParticipant[]
): CapitalizationStanding[] {
  return participants.map((participant) => ({
    participantId: participant.id,
    participantName: participant.name,
    isHuman: participant.isHuman,
    cumulativeScore: 0,
    correctAnswers: 0,
    questionsPlayed: 0,
    lastQuestionScore: 0,
    lastQuestionAttempts: 0,
    lastQuestionTimeMs: 0,
    lastQuestionGuessed: false,
    lastQuestionHintUsed: false,
    hintsUsed: 0,
    eliminatedAfterQuestion: null,
  }))
}

export function normalizeCapitalAnswer(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(capital|city|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function isCapitalAnswerAccepted(
  answer: string,
  question: Pick<CapitalizationQuestion, 'accepted'>
): boolean {
  const normalizedAnswer = normalizeCapitalAnswer(answer)
  return question.accepted.some(
    (acceptedAnswer) => normalizeCapitalAnswer(acceptedAnswer) === normalizedAnswer
  )
}

export function computeCapitalizationQuestionScore(
  performance: CapitalizationRoundPerformance
): number {
  const attempts = Math.max(1, performance.attempts)
  if (!performance.guessed || performance.skipped) return 0

  const timePenalty = Math.min(620, Math.round((performance.timeMs / 1000) * 18))
  const attemptPenalty = Math.max(0, attempts - 1) * 140
  const firstTryBonus = attempts === 1 ? 110 : 0
  const score = Math.max(90, 1000 + firstTryBonus - timePenalty - attemptPenalty)
  return performance.hintUsed ? Math.floor(score / 2) : score
}

export function createCapitalizationAiRng(context: CapitalizationAiRngContext): () => number {
  const roundSeed = Math.imul(context.questionNumber >>> 0, 0x9e3779b9) >>> 0
  const participantSeed = hashStringU32(context.participantId)
  return mulberry32(((context.seed >>> 0) ^ roundSeed ^ participantSeed) >>> 0)
}

export function simulateCapitalizationAiPerformance(
  context: CapitalizationAiPerformanceContext,
  rng: () => number
): CapitalizationRoundPerformance {
  const skill = clamp(context.participant.precomputedScore / 100, 0.18, 0.96)
  const correctChanceByDifficulty: Record<CapitalizationQuestion['difficulty'], number> = {
    1: 0.999,
    2: 0.9,
    3: 0.5,
    4: 0.3,
    5: 0.1,
  }
  const fallbackHintChanceByDifficulty: Record<CapitalizationQuestion['difficulty'], number> = {
    1: 0.08,
    2: 0.35,
    3: 0.68,
    4: 0.9,
    5: 0.97,
  }
  const correctChance = correctChanceByDifficulty[context.question.difficulty]
  const recalledAnswer = rng() < correctChance

  // Hints are a fallback for a failed recall, not an unrelated random event.
  // Once shown three options, stronger players are better at recognition, but
  // the hint is never an automatic correct answer.
  const hintUsed =
    !recalledAnswer && rng() < fallbackHintChanceByDifficulty[context.question.difficulty]
  const hintAnswerChance = clamp(0.48 + skill * 0.32, 0.54, 0.79)
  const guessedWithHint = hintUsed && rng() < hintAnswerChance
  const guessed = recalledAnswer || guessedWithHint
  const speedBias = 1 - skill
  const hintDecisionTimeMs = hintUsed ? 1200 + rng() * 1800 : 0
  const baseTimeMs =
    2400 + rng() * 2800 + speedBias * 6200 + context.question.difficulty * 420 + hintDecisionTimeMs

  if (guessed) {
    let attempts = 1
    let extraAttemptChance = clamp(
      0.28 - skill * 0.18 + context.question.difficulty * 0.07,
      0.08,
      0.62
    )
    while (!hintUsed && attempts < 4 && rng() < extraAttemptChance) {
      attempts += 1
      extraAttemptChance *= 0.42
    }

    return {
      guessed: true,
      attempts,
      timeMs: Math.round(baseTimeMs + (attempts - 1) * (1100 + rng() * 900)),
      hintUsed,
    }
  }

  const attempts = hintUsed ? 1 : 1 + Math.floor(rng() * (context.question.difficulty >= 4 ? 4 : 3))
  return {
    guessed: false,
    attempts,
    skipped: !hintUsed && rng() < 0.35,
    timeMs: Math.round(baseTimeMs + attempts * (1200 + rng() * 1000)),
    hintUsed,
  }
}

export function applyCapitalizationPerformance(
  standings: CapitalizationStanding[],
  performanceByParticipantId: Record<string, CapitalizationRoundPerformance>
): CapitalizationStanding[] {
  return standings.map((standing) => {
    const performance = performanceByParticipantId[standing.participantId]
    if (!performance) return standing
    const score = computeCapitalizationQuestionScore(performance)
    return {
      ...standing,
      cumulativeScore: standing.cumulativeScore + score,
      correctAnswers: standing.correctAnswers + (performance.guessed ? 1 : 0),
      questionsPlayed: standing.questionsPlayed + 1,
      lastQuestionScore: score,
      lastQuestionAttempts: Math.max(1, performance.attempts),
      lastQuestionTimeMs: Math.max(0, performance.timeMs),
      lastQuestionGuessed: performance.guessed,
      lastQuestionHintUsed: Boolean(performance.hintUsed),
      hintsUsed: standing.hintsUsed + (performance.hintUsed ? 1 : 0),
    }
  })
}

export function getCapitalizationEliminationCount(activePlayerCount: number): number {
  if (activePlayerCount <= 1) return 0
  return Math.min(
    Math.ceil(activePlayerCount * CAPITALIZATION_ELIMINATION_RATE),
    activePlayerCount - 1
  )
}

export function eliminateCapitalizationField(
  standings: CapitalizationStanding[],
  questionNumber: number
): {
  standings: CapitalizationStanding[]
  eliminatedIds: string[]
} {
  // The player is a contestant, not a protected observer. Checkpoints rank
  // the whole active field so a skipped run can be eliminated like any AI.
  const activePlayers = standings.filter((standing) => standing.eliminatedAfterQuestion === null)
  const eliminationCount = getCapitalizationEliminationCount(activePlayers.length)
  if (eliminationCount <= 0) return { standings, eliminatedIds: [] }

  const eliminatedIds = activePlayers
    .slice()
    .sort(compareCapitalizationStandingsForElimination)
    .slice(0, eliminationCount)
    .map((standing) => standing.participantId)
  const eliminatedSet = new Set(eliminatedIds)

  return {
    eliminatedIds,
    standings: standings.map((standing) =>
      eliminatedSet.has(standing.participantId) && standing.eliminatedAfterQuestion === null
        ? { ...standing, eliminatedAfterQuestion: questionNumber }
        : standing
    ),
  }
}

export function compareCapitalizationStandings(
  a: CapitalizationStanding,
  b: CapitalizationStanding
): number {
  const aActive = a.eliminatedAfterQuestion === null
  const bActive = b.eliminatedAfterQuestion === null
  if (aActive !== bActive) return aActive ? -1 : 1
  if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore
  if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers
  if (a.lastQuestionTimeMs !== b.lastQuestionTimeMs)
    return a.lastQuestionTimeMs - b.lastQuestionTimeMs
  if (a.lastQuestionAttempts !== b.lastQuestionAttempts) {
    return a.lastQuestionAttempts - b.lastQuestionAttempts
  }
  return a.participantName.localeCompare(b.participantName)
}

export function rankCapitalizationStandings(
  standings: CapitalizationStanding[]
): CapitalizationStanding[] {
  return standings.slice().sort(compareCapitalizationStandings)
}

export function buildCapitalizationRawResults(
  standings: CapitalizationStanding[]
): Record<string, number> {
  return Object.fromEntries(
    standings.map((standing) => [standing.participantId, standing.cumulativeScore])
  )
}

export function formatCapitalizationTimeMs(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return '-'
  return `${(timeMs / 1000).toFixed(1)}s`
}

function compareCapitalizationStandingsForElimination(
  a: CapitalizationStanding,
  b: CapitalizationStanding
): number {
  if (a.cumulativeScore !== b.cumulativeScore) return a.cumulativeScore - b.cumulativeScore
  if (a.correctAnswers !== b.correctAnswers) return a.correctAnswers - b.correctAnswers
  if (a.lastQuestionAttempts !== b.lastQuestionAttempts) {
    return b.lastQuestionAttempts - a.lastQuestionAttempts
  }
  if (a.lastQuestionTimeMs !== b.lastQuestionTimeMs)
    return b.lastQuestionTimeMs - a.lastQuestionTimeMs
  return a.participantName.localeCompare(b.participantName)
}

function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

function hashStringU32(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
