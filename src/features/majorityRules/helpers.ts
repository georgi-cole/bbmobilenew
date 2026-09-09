import { mulberry32 } from '../../store/rng'
import type { AiGameIdentity } from '../../ai/aiGameIdentity'
import { MAJORITY_RULES_QUESTION_BANK } from './majorityRulesQuestions'

export type MajorityRulesHintType = 'pollHint' | 'peekTwo' | 'followPlayer'

export interface MajorityRulesQuestionOption {
  id: string
  label: string
  text: string
  baseBias: number
}

export interface MajorityRulesQuestion {
  id: string
  prompt: string
  options: [MajorityRulesQuestionOption, MajorityRulesQuestionOption, MajorityRulesQuestionOption]
}

export interface MajorityRulesHintInventory {
  pollHintUsed: boolean
  peekTwoUsed: boolean
  followPlayerUsed: boolean
}

export interface MajorityRulesHintPreview {
  type: MajorityRulesHintType
  pollEstimate?: Record<string, number>
  peekedAnswers?: Record<string, string>
  targetId?: string | null
}

export interface MajorityRulesAiHintDecision extends MajorityRulesHintPreview {
  playerId: string
}

export interface MajorityRulesRoundSimulation {
  answers: Record<string, string>
  distribution: Record<string, number>
  aiHintDecision: MajorityRulesAiHintDecision | null
}

export interface MajorityRulesBallotResolution {
  kind: 'unanimous' | 'revote' | 'split' | 'elimination'
  distribution: Record<string, number>
  answers: Record<string, string>
  eliminatedIds: string[]
  minorityOptionId: string | null
  tiedOptionIds: string[]
  eliminationCount: number
}

export interface MajorityRulesDiceDuelState {
  finalists: [string, string]
  chosenNumbers: Record<string, number | null>
  currentRollerId: string
  pressureHolderId: string | null
  roundCount: number
  suddenDeath: boolean
  turnCount: number
  lastRoll: {
    playerId: string
    value: number
    hitTarget: boolean
    cancelled: boolean
    winnerId: string | null
  } | null
}

export interface MajorityRulesDiceRollResult {
  duel: MajorityRulesDiceDuelState
  winnerId: string | null
}

export interface MajorityRulesThreeWayDiceState {
  finalists: [string, string, string]
  chosenNumbers: Record<string, number | null>
  currentRoundRolls: Record<string, number | null>
  currentRollerId: string
  roundCount: number
  turnCount: number
  lastRoll: {
    playerId: string
    value: number
    hitTarget: boolean
  } | null
  lastRoundResult: {
    rolls: Record<string, number>
    successfulIds: string[]
    eliminatedId: string | null
    winnerId: string | null
  } | null
}

export interface MajorityRulesThreeWayDiceRollResult {
  duel: MajorityRulesThreeWayDiceState
  winnerId: string | null
  eliminatedId: string | null
  advancingIds: [string, string] | null
}

const AI_HINT_USAGE_CHANCE = 0.18
const POLL_HINT_WEIGHT = 0.3
const PEEK_HINT_WEIGHT = 0.35
const PERSONALITY_WEIGHT = 0.2
const NOISE_WEIGHT = 0.12
const MIN_OPTION_WEIGHT = 0.05
const MAX_SUDDEN_DEATH_ROUNDS = 10
const MAJORITY_RULES_OPTION_IDS = ['a', 'b', 'c'] as const
const MAJORITY_RULES_OPTION_LABELS = ['A', 'B', 'C'] as const
const MAJORITY_RULES_OPTION_BIASES = [0.62, 0.5, 0.38] as const

const DIVISIVE_QUESTION_IDS = new Set([
  'q014',
  'q045',
  'q051',
  'q057',
  'q079',
  'q094',
  'q106',
  'q116',
  'q136',
  'q151',
  'q152',
  'q157',
  'q160',
  'q162',
  'q175',
  'q199',
  'q200',
])
const STRONG_CONSENSUS_QUESTION_IDS = new Set([
  'q013',
  'q022',
  'q055',
  'q087',
  'q123',
  'q132',
  'q147',
  'q149',
  'q161',
  'q180',
  'q183',
  'q193',
])
const QUESTION_PRIOR_OVERRIDES: Record<string, Record<string, number>> = {
  q014: { Attractive: 0.46, Reliable: 0.64, Fun: 0.43 },
  q024: { 'Fast food': 0.4, 'Healthy food': 0.5, 'Mixed diet': 0.64 },
  q035: { Food: 0.48, Bills: 0.68, Leisure: 0.36 },
  q054: { Success: 0.48, Kindness: 0.6, Talent: 0.52 },
  q072: { 'Avoid it': 0.46, 'Confront it': 0.42, Compromise: 0.64 },
  q087: { 'Safe option': 0.59, 'Moderate option': 0.7, 'High-risk option': 0.27 },
  q090: { Wealth: 0.46, Happiness: 0.64, Freedom: 0.55 },
  q094: { Intelligence: 0.56, Kindness: 0.6, Success: 0.46 },
  q116: { Passion: 0.45, Stability: 0.58, Trust: 0.67 },
  q124: { Reliability: 0.68, Chemistry: 0.52, Ambition: 0.37 },
  q127: { Speed: 0.48, Privacy: 0.57, 'Ease of use': 0.62 },
  q134: { 'Save it': 0.61, 'Spend it': 0.37, 'Pay debt': 0.58 },
  q146: { Friendly: 0.61, Confident: 0.56, Polite: 0.48 },
  q155: { Pay: 0.58, Security: 0.53, 'Work-life balance': 0.62 },
  q162: { Safety: 0.58, Excitement: 0.41, Understanding: 0.64 },
  q165: { Decisiveness: 0.45, Empathy: 0.55, Fairness: 0.66 },
  q170: { Easygoing: 0.65, Organized: 0.49, Funny: 0.53 },
  q178: { Therapy: 0.47, Books: 0.49, 'Better routines': 0.62 },
  q185: { 'Low rent': 0.52, 'Good location': 0.65, 'More space': 0.55 },
  q190: { Patience: 0.65, 'Practical help': 0.58, Affection: 0.52 },
  q197: { 'Be direct': 0.56, 'Be gentle': 0.59, 'Delay it': 0.34 },
}

function normalizeMajorityRulesPrompt(prompt: string) {
  const qualifierMatch = prompt.match(/^(.*)\?\s+(.+)\?$/)
  if (!qualifierMatch) return prompt

  const [, rawBase, rawQualifier] = qualifierMatch
  const base = rawBase.trim()
  const qualifier = rawQualifier.trim()

  if (base === 'What would people choose' && qualifier === 'for most people') {
    return 'What would most people choose?'
  }

  return `${base} ${qualifier}?`
}

function buildMajorityRulesQuestion(
  id: string,
  prompt: string,
  options: [string, string, string]
): MajorityRulesQuestion {
  return {
    id,
    prompt: normalizeMajorityRulesPrompt(prompt),
    options: options.map((text, index) => ({
      id: MAJORITY_RULES_OPTION_IDS[index],
      label: MAJORITY_RULES_OPTION_LABELS[index],
      text,
      baseBias: MAJORITY_RULES_OPTION_BIASES[index],
    })) as [MajorityRulesQuestionOption, MajorityRulesQuestionOption, MajorityRulesQuestionOption],
  }
}

function shuffleMajorityRulesQuestion(
  question: MajorityRulesQuestion,
  seed: number,
  roundNumber: number,
  usedQuestionIds: string[]
): MajorityRulesQuestion {
  const shuffledOptions = question.options
    .map((option) => ({
      option,
      sortKey: seededValue(
        seed,
        'question-option',
        roundNumber,
        question.id,
        usedQuestionIds.join('|'),
        option.id
      ),
    }))
    .sort((left, right) => {
      if (left.sortKey !== right.sortKey) {
        return left.sortKey - right.sortKey
      }
      return left.option.id.localeCompare(right.option.id)
    })
    .map(({ option }, index) => ({
      ...option,
      id: MAJORITY_RULES_OPTION_IDS[index],
      label: MAJORITY_RULES_OPTION_LABELS[index],
    })) as [MajorityRulesQuestionOption, MajorityRulesQuestionOption, MajorityRulesQuestionOption]

  return {
    ...question,
    options: shuffledOptions,
  }
}

export const MAJORITY_RULES_QUESTIONS: MajorityRulesQuestion[] = MAJORITY_RULES_QUESTION_BANK.map(
  (question) => buildMajorityRulesQuestion(question.id, question.prompt, question.options)
)

export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function seededValue(seed: number, ...parts: Array<number | string>): number {
  let mixed = seed >>> 0
  for (const part of parts) {
    const piece = typeof part === 'number' ? part >>> 0 : fnv1a32(part)
    mixed = (mixed ^ piece ^ Math.imul(piece, 0x9e3779b9)) >>> 0
  }
  return mixed >>> 0
}

function seededRng(seed: number, ...parts: Array<number | string>) {
  return mulberry32(seededValue(seed, ...parts))
}

function getAllowedOptionIds(
  options: readonly MajorityRulesQuestionOption[],
  blockedAnswer: string | null | undefined
): string[] {
  const ids = options.map((option) => option.id)
  if (!blockedAnswer) return ids
  const filtered = ids.filter((id) => id !== blockedAnswer)
  return filtered.length > 0 ? filtered : ids
}

function chooseExtremaOption(scores: Record<string, number>, optionIds: string[]): string {
  const sorted = [...optionIds].sort((left, right) => scores[right] - scores[left])
  return sorted[0] ?? optionIds[0]
}

function chooseWeightedOption(
  scores: Record<string, number>,
  optionIds: string[],
  rng: () => number,
  power = 1
): string {
  const weights = optionIds.map(
    (optionId) => Math.max(MIN_OPTION_WEIGHT, scores[optionId] ?? 0) ** power
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return chooseExtremaOption(scores, optionIds)

  let roll = rng() * total
  for (let index = 0; index < optionIds.length; index += 1) {
    roll -= weights[index] ?? 0
    if (roll <= 0) return optionIds[index] ?? optionIds[0]
  }
  return optionIds[optionIds.length - 1] ?? optionIds[0]
}

function getQuestionConsensusPower(question: MajorityRulesQuestion): number {
  if (DIVISIVE_QUESTION_IDS.has(question.id)) return 1.15
  if (STRONG_CONSENSUS_QUESTION_IDS.has(question.id)) return 3

  const prompt = question.prompt.toLowerCase()
  if (
    /\b(first|daily|most often|when tired|before bed|checkout|commute|in danger)\b/.test(prompt)
  ) {
    return 2.6
  }
  if (/\b(prefer|value|want more|rather|admire|fear|regret|envy|known for)\b/.test(prompt)) {
    return 1.35
  }
  return 1.9
}

function getPopulationPrior(question: MajorityRulesQuestion, option: MajorityRulesQuestionOption) {
  return QUESTION_PRIOR_OVERRIDES[question.id]?.[option.text] ?? option.baseBias
}

function getIdentityConformity(identity: AiGameIdentity | undefined): number {
  if (!identity) return 1
  let value = 0.94 + identity.competitionDrive * 0.16
  if (
    [
      'public_pleaser',
      'audience_chameleon',
      'media_strategist',
      'active_floater',
      'strategic_operator',
    ].includes(identity.archetype)
  ) {
    value += 0.12
  }
  if (['chaos_agent', 'lone_wolf', 'antihero', 'risk_taker'].includes(identity.archetype)) {
    value -= 0.18
  }
  return Math.max(0.72, Math.min(1.28, value))
}

function semanticIdentityAffinity(
  identity: AiGameIdentity | undefined,
  optionText: string
): number {
  if (!identity) return 0
  const text = optionText.toLowerCase()
  const keywordSets: Partial<Record<AiGameIdentity['archetype'], string[]>> = {
    loyal_anchor: [
      'loyal',
      'trust',
      'family',
      'stability',
      'reliable',
      'support',
      'safety',
      'security',
    ],
    romantic_loyalist: [
      'affection',
      'chemistry',
      'passion',
      'relationship',
      'trust',
      'loyal',
      'understanding',
    ],
    risk_taker: ['risk', 'adventure', 'exciting', 'excitement', 'new', 'travel', 'freedom'],
    chaos_agent: ['risk', 'adventure', 'go out', 'fun', 'new', 'impulse'],
    aggressive_competitor: ['success', 'career', 'achievement', 'gym', 'discipline', 'growth'],
    clutch_competitor: ['success', 'achievement', 'confidence', 'pressure', 'discipline'],
    social_butterfly: ['friends', 'social', 'party', 'connection', 'talk', 'fun', 'people'],
    public_pleaser: ['liked', 'friendly', 'kindness', 'praise', 'attention', 'recognition'],
    audience_darling: ['friendly', 'kindness', 'support', 'people', 'harmony'],
    media_strategist: ['attention', 'recognition', 'status', 'style', 'looks', 'social media'],
    audience_chameleon: ['attention', 'recognition', 'liked', 'style', 'social'],
    underdog_survivor: [
      'safe',
      'safety',
      'security',
      'saving',
      'cheap',
      'low cost',
      'reliability',
      'practical',
    ],
    strategic_operator: ['planning', 'security', 'money', 'career', 'position', 'control'],
    puppet_master: ['control', 'influence', 'recognition', 'connections', 'strategy'],
    puzzle_specialist: ['intelligence', 'knowledge', 'planning', 'focus', 'skill'],
  }
  const keywords = keywordSets[identity.archetype] ?? []
  return keywords.some((keyword) => text.includes(keyword)) ? 0.1 : 0
}

function getIdentityNoiseWeight(identity: AiGameIdentity | undefined): number {
  if (!identity) return NOISE_WEIGHT
  let multiplier = 0.65 + identity.emotionalVolatility * 0.9
  if (identity.temperament === 'impulsive') multiplier += 0.35
  if (identity.temperament === 'calm') multiplier -= 0.2
  return NOISE_WEIGHT * Math.max(0.5, Math.min(1.6, multiplier))
}

function buildPlayerScores(params: {
  seed: number
  roundNumber: number
  playerId: string
  question: MajorityRulesQuestion
  previousDistribution?: Record<string, number> | null
  blockedAnswer?: string | null
  identity?: AiGameIdentity
}) {
  const { seed, roundNumber, playerId, question, blockedAnswer, identity } = params
  const optionIds = getAllowedOptionIds(question.options, blockedAnswer)
  const rng = seededRng(seed, 'player-choice', roundNumber, playerId, question.id)
  const scores: Record<string, number> = {}
  const conformity = getIdentityConformity(identity)
  const choicePower = getQuestionConsensusPower(question) * (0.9 + conformity * 0.1)
  const noiseWeight = getIdentityNoiseWeight(identity)

  for (const option of question.options) {
    if (!optionIds.includes(option.id)) continue
    // Preference is attached to the semantic answer text rather than its shuffled A/B/C slot.
    // That gives each contestant a stable lean toward concepts while avoiding fake cross-question
    // memory such as "A won last round, therefore A is likely again".
    const preferenceKey = `${playerId}:${option.text.trim().toLowerCase()}`
    const personalBias = ((fnv1a32(preferenceKey) % 1000) / 1000 - 0.5) * PERSONALITY_WEIGHT * 0.55
    const noise = (rng() - 0.5) * noiseWeight
    const populationPrior = getPopulationPrior(question, option)
    const centeredPrior = 0.5 + (populationPrior - 0.5) * conformity
    const semanticBias = semanticIdentityAffinity(identity, option.text)
    scores[option.id] = Math.max(
      MIN_OPTION_WEIGHT,
      centeredPrior + semanticBias + personalBias + noise
    )
  }

  return { optionIds, scores, rng, choicePower }
}

export function chooseAiAnswer(params: {
  seed: number
  roundNumber: number
  playerId: string
  question: MajorityRulesQuestion
  previousDistribution?: Record<string, number> | null
  blockedAnswer?: string | null
  identity?: AiGameIdentity
}): string {
  const { optionIds, scores, rng, choicePower } = buildPlayerScores(params)
  return chooseWeightedOption(scores, optionIds, rng, choicePower)
}

export function countAnswerDistribution(
  answers: Record<string, string>,
  options: readonly MajorityRulesQuestionOption[]
): Record<string, number> {
  const distribution: Record<string, number> = {}
  for (const option of options) {
    distribution[option.id] = 0
  }
  for (const answer of Object.values(answers)) {
    if (distribution[answer] !== undefined) distribution[answer] += 1
  }
  return distribution
}

export function buildPollEstimate(
  exactDistribution: Record<string, number>,
  seed: number,
  roundNumber: number,
  viewerId: string
): Record<string, number> {
  const total = Object.values(exactDistribution).reduce((sum, count) => sum + count, 0)
  if (total <= 0) return Object.fromEntries(Object.keys(exactDistribution).map((key) => [key, 0]))
  const rng = seededRng(seed, 'poll-hint', roundNumber, viewerId)
  const adjusted = Object.entries(exactDistribution).map(([optionId, count]) => {
    const exactPercent = (count / total) * 100
    const noise = (rng() - 0.5) * 14
    return {
      optionId,
      value: Math.max(3, Math.min(94, exactPercent + noise)),
    }
  })
  const sum = adjusted.reduce((acc, entry) => acc + entry.value, 0) || 1
  const normalized = adjusted.map((entry) => ({
    optionId: entry.optionId,
    value: Math.round((entry.value / sum) * 100),
  }))
  const diff = 100 - normalized.reduce((acc, entry) => acc + entry.value, 0)
  if (normalized.length > 0) {
    normalized[0].value += diff
  }
  return Object.fromEntries(normalized.map((entry) => [entry.optionId, entry.value]))
}

export function buildBaseAiAnswers(params: {
  activeIds: string[]
  humanPlayerId: string | null
  seed: number
  roundNumber: number
  question: MajorityRulesQuestion
  previousDistribution?: Record<string, number> | null
  blockedAnswers?: Record<string, string>
  aiIdentities?: Record<string, AiGameIdentity | undefined>
}): Record<string, string> {
  const {
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    previousDistribution,
    blockedAnswers = {},
    aiIdentities = {},
  } = params
  const answers: Record<string, string> = {}
  for (const playerId of activeIds) {
    if (playerId === humanPlayerId) continue
    answers[playerId] = chooseAiAnswer({
      seed,
      roundNumber,
      playerId,
      question,
      previousDistribution,
      blockedAnswer: blockedAnswers[playerId] ?? null,
      identity: aiIdentities[playerId],
    })
  }
  return answers
}

function chooseAiHintDecision(params: {
  activeIds: string[]
  humanPlayerId: string | null
  seed: number
  roundNumber: number
  question: MajorityRulesQuestion
  inventories: Record<string, MajorityRulesHintInventory>
  baseAiAnswers: Record<string, string>
  blockedAnswers?: Record<string, string>
  humanHintUsed: boolean
}): MajorityRulesAiHintDecision | null {
  const {
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    inventories,
    baseAiAnswers,
    blockedAnswers = {},
    humanHintUsed,
  } = params
  if (humanHintUsed) return null

  for (const playerId of activeIds) {
    if (playerId === humanPlayerId) continue
    const inventory = inventories[playerId] ?? {
      pollHintUsed: false,
      peekTwoUsed: false,
      followPlayerUsed: false,
    }
    const availableTypes: MajorityRulesHintType[] = []
    if (!inventory.pollHintUsed) availableTypes.push('pollHint')
    if (!inventory.peekTwoUsed) availableTypes.push('peekTwo')
    if (!inventory.followPlayerUsed) availableTypes.push('followPlayer')
    if (availableTypes.length === 0) continue
    const rng = seededRng(seed, 'ai-hint', roundNumber, playerId, question.id)
    if (rng() >= AI_HINT_USAGE_CHANCE) continue
    const type = availableTypes[Math.floor(rng() * availableTypes.length)] ?? 'pollHint'

    if (type === 'pollHint') {
      const distribution = countAnswerDistribution(baseAiAnswers, question.options)
      return {
        playerId,
        type,
        pollEstimate: buildPollEstimate(distribution, seed, roundNumber, playerId),
      }
    }

    const otherIds = activeIds.filter((id) => id !== playerId)
    if (type === 'peekTwo') {
      const peekedAnswers: Record<string, string> = {}
      const pool = [...otherIds]
      while (pool.length > 0 && Object.keys(peekedAnswers).length < 2) {
        const index = Math.floor(rng() * pool.length)
        const [targetId] = pool.splice(index, 1)
        if (!targetId) continue
        const previewAnswer =
          baseAiAnswers[targetId] ??
          chooseAiAnswer({
            seed,
            roundNumber,
            playerId: targetId,
            question,
            blockedAnswer: blockedAnswers[targetId] ?? null,
          })
        peekedAnswers[targetId] = previewAnswer
      }
      return { playerId, type, peekedAnswers }
    }

    const targetCandidates = otherIds.filter((id) => baseAiAnswers[id] !== undefined)
    if (targetCandidates.length === 0) return null
    const targetId = targetCandidates[Math.floor(rng() * targetCandidates.length)] ?? null
    return { playerId, type, targetId }
  }

  return null
}

export function buildPeekPreview(params: {
  activeIds: string[]
  viewerId: string
  seed: number
  roundNumber: number
  question: MajorityRulesQuestion
  baseAiAnswers: Record<string, string>
  blockedAnswers?: Record<string, string>
}): Record<string, string> {
  const {
    activeIds,
    viewerId,
    seed,
    roundNumber,
    question,
    baseAiAnswers,
    blockedAnswers = {},
  } = params
  const rng = seededRng(seed, 'peek-hint', roundNumber, viewerId, question.id)
  const pool = activeIds.filter((id) => id !== viewerId)
  const preview: Record<string, string> = {}
  while (pool.length > 0 && Object.keys(preview).length < 2) {
    const index = Math.floor(rng() * pool.length)
    const [targetId] = pool.splice(index, 1)
    if (!targetId) continue
    preview[targetId] =
      baseAiAnswers[targetId] ??
      chooseAiAnswer({
        seed,
        roundNumber,
        playerId: targetId,
        question,
        blockedAnswer: blockedAnswers[targetId] ?? null,
      })
  }
  return preview
}

function applyHintToAnswer(params: {
  seed: number
  roundNumber: number
  playerId: string
  question: MajorityRulesQuestion
  blockedAnswer?: string | null
  baseAnswer: string
  hint: MajorityRulesHintPreview | MajorityRulesAiHintDecision
}): string {
  const { seed, roundNumber, playerId, question, blockedAnswer, baseAnswer, hint } = params
  const allowedOptionIds = getAllowedOptionIds(question.options, blockedAnswer)
  if (hint.type === 'followPlayer') {
    return allowedOptionIds.includes(baseAnswer) ? baseAnswer : allowedOptionIds[0]
  }
  if (hint.type === 'peekTwo' && hint.peekedAnswers) {
    const tally: Record<string, number> = {}
    const { optionIds, scores, rng } = buildPlayerScores({
      seed,
      roundNumber,
      playerId,
      question,
      blockedAnswer,
    })
    for (const optionId of allowedOptionIds) tally[optionId] = 0
    for (const answer of Object.values(hint.peekedAnswers)) {
      if (tally[answer] !== undefined) tally[answer] += 1
    }
    for (const optionId of optionIds) {
      scores[optionId] += (tally[optionId] ?? 0) * PEEK_HINT_WEIGHT
    }
    return chooseWeightedOption(scores, optionIds, rng)
  }
  if (hint.type === 'pollHint' && hint.pollEstimate) {
    const { optionIds, scores, rng } = buildPlayerScores({
      seed,
      roundNumber,
      playerId,
      question,
      blockedAnswer,
    })
    for (const optionId of optionIds) {
      scores[optionId] += ((hint.pollEstimate[optionId] ?? 0) / 100) * POLL_HINT_WEIGHT
    }
    return chooseWeightedOption(scores, optionIds, rng)
  }
  return baseAnswer
}

export function simulateMajorityRulesBallot(params: {
  activeIds: string[]
  humanPlayerId: string | null
  humanAnswer?: string | null
  humanHint?: MajorityRulesHintPreview | null
  inventories: Record<string, MajorityRulesHintInventory>
  seed: number
  roundNumber: number
  question: MajorityRulesQuestion
  previousDistribution?: Record<string, number> | null
  blockedAnswers?: Record<string, string>
  aiIdentities?: Record<string, AiGameIdentity | undefined>
}): MajorityRulesRoundSimulation {
  const {
    activeIds,
    humanPlayerId,
    humanAnswer,
    humanHint,
    inventories,
    seed,
    roundNumber,
    question,
    previousDistribution,
    blockedAnswers = {},
    aiIdentities = {},
  } = params

  const baseAiAnswers = buildBaseAiAnswers({
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    previousDistribution,
    blockedAnswers,
    aiIdentities,
  })
  const aiHintDecision = chooseAiHintDecision({
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    inventories,
    baseAiAnswers,
    blockedAnswers,
    humanHintUsed: humanHint != null,
  })
  const answers: Record<string, string> = { ...baseAiAnswers }

  if (aiHintDecision) {
    const inventoryBlockedAnswer = blockedAnswers[aiHintDecision.playerId] ?? null
    if (aiHintDecision.type === 'followPlayer' && aiHintDecision.targetId) {
      const copiedAnswer = answers[aiHintDecision.targetId]
      if (copiedAnswer) {
        answers[aiHintDecision.playerId] = applyHintToAnswer({
          seed,
          roundNumber,
          playerId: aiHintDecision.playerId,
          question,
          blockedAnswer: inventoryBlockedAnswer,
          baseAnswer: copiedAnswer,
          hint: aiHintDecision,
        })
      }
    } else if (aiHintDecision.type === 'peekTwo' || aiHintDecision.type === 'pollHint') {
      answers[aiHintDecision.playerId] = applyHintToAnswer({
        seed,
        roundNumber,
        playerId: aiHintDecision.playerId,
        question,
        blockedAnswer: inventoryBlockedAnswer,
        baseAnswer: answers[aiHintDecision.playerId],
        hint: aiHintDecision,
      })
    }
  }

  if (humanPlayerId && activeIds.includes(humanPlayerId)) {
    const blockedAnswer = blockedAnswers[humanPlayerId] ?? null
    const allowedOptionIds = getAllowedOptionIds(question.options, blockedAnswer)
    if (humanHint?.type === 'followPlayer' && humanHint.targetId) {
      const copiedAnswer = answers[humanHint.targetId]
      if (copiedAnswer) {
        answers[humanPlayerId] = applyHintToAnswer({
          seed,
          roundNumber,
          playerId: humanPlayerId,
          question,
          blockedAnswer,
          baseAnswer: copiedAnswer,
          hint: humanHint,
        })
      }
    } else if (humanAnswer && allowedOptionIds.includes(humanAnswer)) {
      answers[humanPlayerId] = humanAnswer
    } else if (humanAnswer) {
      answers[humanPlayerId] = allowedOptionIds[0]
    }
  }

  return {
    answers,
    distribution: countAnswerDistribution(answers, question.options),
    aiHintDecision,
  }
}

export function resolveMajorityRulesBallot(params: {
  activeIds: string[]
  answers: Record<string, string>
  question: MajorityRulesQuestion
  eliminationCount: number
}): MajorityRulesBallotResolution {
  const { activeIds, answers, question, eliminationCount } = params
  const distribution = countAnswerDistribution(answers, question.options)
  const populatedOptionIds = question.options
    .map((option) => option.id)
    .filter((optionId) => (distribution[optionId] ?? 0) > 0)

  if (populatedOptionIds.length <= 1) {
    return {
      kind: 'unanimous',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId: populatedOptionIds[0] ?? null,
      tiedOptionIds: [],
      eliminationCount,
    }
  }

  const minCount = Math.min(...populatedOptionIds.map((optionId) => distribution[optionId] ?? 0))
  const tiedOptionIds = populatedOptionIds.filter(
    (optionId) => (distribution[optionId] ?? 0) === minCount
  )
  if (tiedOptionIds.length !== 1) {
    if (tiedOptionIds.length === populatedOptionIds.length) {
      return {
        kind: 'revote',
        distribution,
        answers,
        eliminatedIds: [],
        minorityOptionId: null,
        tiedOptionIds,
        eliminationCount,
      }
    }
    return {
      kind: 'split',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId: null,
      tiedOptionIds,
      eliminationCount,
    }
  }

  const minorityOptionId = tiedOptionIds[0]
  const eliminatedIds = activeIds.filter((playerId) => answers[playerId] === minorityOptionId)
  const maxClearMinoritySize = activeIds.length >= 6 ? 2 : 1
  if (eliminatedIds.length > maxClearMinoritySize) {
    return {
      kind: 'split',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId,
      tiedOptionIds: [],
      eliminationCount,
    }
  }

  return {
    kind: 'elimination',
    distribution,
    answers,
    eliminatedIds,
    minorityOptionId,
    tiedOptionIds: [],
    eliminationCount,
  }
}

export function pickMajorityRulesQuestion(
  seed: number,
  roundNumber: number,
  usedQuestionIds: string[]
): MajorityRulesQuestion {
  const remaining = MAJORITY_RULES_QUESTIONS.filter(
    (question) => !usedQuestionIds.includes(question.id)
  )
  const pool = remaining.length > 0 ? remaining : MAJORITY_RULES_QUESTIONS
  const rng = seededRng(seed, 'question', roundNumber, usedQuestionIds.join('|'))
  const index = Math.floor(rng() * pool.length)
  const selectedQuestion = pool[index] ?? MAJORITY_RULES_QUESTIONS[0]
  return shuffleMajorityRulesQuestion(selectedQuestion, seed, roundNumber, usedQuestionIds)
}

export function initializeDiceDuel(finalists: [string, string]): MajorityRulesDiceDuelState {
  return {
    finalists,
    chosenNumbers: {
      [finalists[0]]: null,
      [finalists[1]]: null,
    },
    currentRollerId: finalists[0],
    pressureHolderId: null,
    roundCount: 0,
    suddenDeath: false,
    turnCount: 0,
    lastRoll: null,
  }
}

export function initializeThreeWayDice(
  finalists: [string, string, string]
): MajorityRulesThreeWayDiceState {
  return {
    finalists,
    chosenNumbers: {
      [finalists[0]]: null,
      [finalists[1]]: null,
      [finalists[2]]: null,
    },
    currentRoundRolls: {
      [finalists[0]]: null,
      [finalists[1]]: null,
      [finalists[2]]: null,
    },
    currentRollerId: finalists[0],
    roundCount: 0,
    turnCount: 0,
    lastRoll: null,
    lastRoundResult: null,
  }
}

export function pickAiDuelNumber(seed: number, playerId: string, takenNumbers: number[]): number {
  const available = [1, 2, 3, 4, 5, 6].filter((value) => !takenNumbers.includes(value))
  const rng = seededRng(seed, 'duel-pick', playerId, takenNumbers.join(','))
  const index = Math.floor(rng() * available.length)
  return available[index] ?? available[0] ?? 1
}

export function resolveDiceDuelRoll(
  duel: MajorityRulesDiceDuelState,
  seed: number
): MajorityRulesDiceRollResult {
  const rollerId = duel.currentRollerId
  const target = duel.chosenNumbers[rollerId]
  if (target == null) {
    return { duel, winnerId: null }
  }
  const otherId = duel.finalists.find((id) => id !== rollerId) ?? rollerId
  const rng = seededRng(seed, 'duel-roll', duel.turnCount, duel.roundCount, rollerId)
  const value = Math.floor(rng() * 6) + 1
  const hitTarget = value === target

  let winnerId: string | null = null
  let pressureHolderId = duel.pressureHolderId
  let currentRollerId = otherId
  let roundCount = duel.roundCount
  let suddenDeath = duel.suddenDeath
  let cancelled = false

  if (suddenDeath) {
    if (hitTarget) winnerId = rollerId
  } else if (pressureHolderId) {
    if (hitTarget) {
      cancelled = true
      pressureHolderId = null
      currentRollerId = otherId
    } else {
      winnerId = pressureHolderId
    }
  } else if (hitTarget) {
    pressureHolderId = rollerId
    currentRollerId = otherId
  }

  if (!winnerId && currentRollerId === duel.finalists[0]) {
    roundCount += 1
    if (roundCount >= MAX_SUDDEN_DEATH_ROUNDS) {
      suddenDeath = true
    }
  }

  return {
    winnerId,
    duel: {
      ...duel,
      currentRollerId,
      pressureHolderId,
      roundCount,
      suddenDeath,
      turnCount: duel.turnCount + 1,
      lastRoll: {
        playerId: rollerId,
        value,
        hitTarget,
        cancelled,
        winnerId,
      },
    },
  }
}

export function resolveThreeWayDiceRoll(
  duel: MajorityRulesThreeWayDiceState,
  seed: number
): MajorityRulesThreeWayDiceRollResult {
  const rollerId = duel.currentRollerId
  const target = duel.chosenNumbers[rollerId]
  if (target == null) {
    return { duel, winnerId: null, eliminatedId: null, advancingIds: null }
  }

  const rng = seededRng(seed, 'three-way-duel-roll', duel.turnCount, duel.roundCount, rollerId)
  const value = Math.floor(rng() * 6) + 1
  const hitTarget = value === target
  const currentRoundRolls = {
    ...duel.currentRoundRolls,
    [rollerId]: value,
  }

  const remainingRollers = duel.finalists.filter((playerId) => currentRoundRolls[playerId] == null)
  if (remainingRollers.length > 0) {
    return {
      winnerId: null,
      eliminatedId: null,
      advancingIds: null,
      duel: {
        ...duel,
        currentRoundRolls,
        currentRollerId: remainingRollers[0],
        turnCount: duel.turnCount + 1,
        lastRoll: {
          playerId: rollerId,
          value,
          hitTarget,
        },
      },
    }
  }

  const successfulIds = duel.finalists.filter(
    (playerId) => currentRoundRolls[playerId] === duel.chosenNumbers[playerId]
  )
  const winnerId = successfulIds.length === 1 ? successfulIds[0] : null
  const advancingIds = successfulIds.length === 2 ? (successfulIds as [string, string]) : null
  const eliminatedId =
    advancingIds != null
      ? (duel.finalists.find((playerId) => !advancingIds.includes(playerId)) ?? null)
      : null

  return {
    winnerId,
    eliminatedId,
    advancingIds,
    duel: {
      ...duel,
      currentRoundRolls: {
        [duel.finalists[0]]: null,
        [duel.finalists[1]]: null,
        [duel.finalists[2]]: null,
      },
      currentRollerId: duel.finalists[0],
      roundCount: duel.roundCount + 1,
      turnCount: duel.turnCount + 1,
      lastRoll: {
        playerId: rollerId,
        value,
        hitTarget,
      },
      lastRoundResult: {
        rolls: currentRoundRolls as Record<string, number>,
        successfulIds,
        eliminatedId,
        winnerId,
      },
    },
  }
}
