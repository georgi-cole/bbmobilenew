import type { GameState, Player } from '../../types'

export type MemoryLaneCategory = 'competition' | 'nominations' | 'milestone' | 'shock' | 'public' | 'cupid'

export interface MemoryLaneQuestion {
  id: string
  prompt: string
  correctPlayerId: string
  optionPlayerIds: string[]
  category: MemoryLaneCategory
  difficulty: number
  receipt?: string
}

export interface MemoryLaneAiDecision {
  willBuzz: boolean
  delayMs: number
  correct: boolean
  answerPlayerId: string
  confidence: number
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function rngFor(seed: number, salt: string): () => number {
  let state = (seed ^ hashString(salt)) >>> 0
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

function aliveOrSeasonPlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.id && player.name)
}

function uniqueWinner(
  players: readonly Player[],
  score: (player: Player) => number,
  options: { requirePositive?: boolean; lowest?: boolean } = {}
): Player | null {
  if (players.length === 0) return null
  const scored = players.map((player) => ({ player, score: score(player) }))
  const target = options.lowest
    ? Math.min(...scored.map((entry) => entry.score))
    : Math.max(...scored.map((entry) => entry.score))
  if (options.requirePositive && target <= 0) return null
  const tied = scored.filter((entry) => entry.score === target)
  return tied.length === 1 ? tied[0].player : null
}

function firstPlayerNamedInFeed(
  state: GameState,
  matcher: (text: string, event: GameState['tvFeed'][number]) => boolean
): Player | null {
  for (const event of state.tvFeed) {
    if (!matcher(event.text, event)) continue
    const lowered = event.text.toLowerCase()
    const candidates = state.players
      .filter((player) => lowered.includes(player.name.toLowerCase()))
      .sort((left, right) => right.name.length - left.name.length)
    if (candidates.length > 0) return candidates[0]
  }
  return null
}

function makeOptions(
  correctId: string,
  pool: readonly Player[],
  seed: number,
  salt: string,
  preferredIds: readonly string[] = []
): string[] | null {
  const byId = new Map(pool.map((player) => [player.id, player]))
  if (!byId.has(correctId)) return null
  const preferred = preferredIds.filter((id) => id !== correctId && byId.has(id))
  const random = rngFor(seed, `options:${salt}`)
  const rest = shuffle(
    pool.map((player) => player.id).filter((id) => id !== correctId && !preferred.includes(id)),
    random
  )
  const distractors = [...preferred, ...rest].slice(0, 3)
  if (distractors.length < 3) return null
  return shuffle([correctId, ...distractors], random)
}

function pushQuestion(
  questions: MemoryLaneQuestion[],
  state: GameState,
  seed: number,
  input: Omit<MemoryLaneQuestion, 'optionPlayerIds'> & { preferredIds?: string[] }
): void {
  const options = makeOptions(
    input.correctPlayerId,
    aliveOrSeasonPlayers(state),
    seed,
    input.id,
    input.preferredIds
  )
  if (!options) return
  questions.push({
    id: input.id,
    prompt: input.prompt,
    correctPlayerId: input.correctPlayerId,
    optionPlayerIds: options,
    category: input.category,
    difficulty: Math.max(0, Math.min(1, input.difficulty)),
    receipt: input.receipt,
  })
}

function publicSaveCounts(state: GameState): Record<string, number> {
  const counts: Record<string, number> = { ...(state.voxPopuli?.safetySaveCounts ?? {}) }
  for (const event of state.social?.dramaNetwork?.events ?? []) {
    if (!event.id.startsWith('public-save-')) continue
    const id = event.participantIds[0]
    if (!id) continue
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

function getFirstLohWinner(state: GameState): Player | null {
  const receipt = state.history?.find((event) => event.type === 'seasonReceipt:lohWin')
  const id = typeof receipt?.data.playerId === 'string' ? receipt.data.playerId : null
  if (id) return state.players.find((player) => player.id === id) ?? null
  return firstPlayerNamedInFeed(state, (text, event) => {
    const template = String(event.meta?.broadcastTemplateId ?? '')
    return template.startsWith('loh.') || /won leader of the house|has won leader of the house/i.test(text)
  })
}

function getFirstPosWinner(state: GameState): Player | null {
  const receipt = state.history?.find((event) => event.type === 'seasonReceipt:posWin')
  const id = typeof receipt?.data.playerId === 'string' ? receipt.data.playerId : null
  if (id) return state.players.find((player) => player.id === id) ?? null
  return firstPlayerNamedInFeed(state, (text) => /won the power of safety|has won the power of safety/i.test(text))
}

function addUniqueCountQuestions(
  questions: MemoryLaneQuestion[],
  state: GameState,
  seed: number,
  kind: 'loh' | 'pos' | 'noms'
): void {
  const players = aliveOrSeasonPlayers(state)
  const score = (player: Player) =>
    kind === 'loh'
      ? player.stats?.lohWins ?? 0
      : kind === 'pos'
        ? player.stats?.posWins ?? 0
        : player.stats?.timesNominated ?? 0
  const buckets = new Map<number, Player[]>()
  for (const player of players) {
    const value = score(player)
    if (value <= 0) continue
    buckets.set(value, [...(buckets.get(value) ?? []), player])
  }
  const unique = [...buckets.entries()]
    .filter(([, bucket]) => bucket.length === 1)
    .sort((left, right) => right[0] - left[0])
    .slice(0, 2)
  unique.forEach(([value, bucket], index) => {
    const player = bucket[0]
    const noun = kind === 'loh' ? 'LOH' : kind === 'pos' ? 'POS' : 'nomination'
    const verb = kind === 'noms' ? 'received' : 'won'
    pushQuestion(questions, state, seed, {
      id: `unique-${kind}-${value}-${index}`,
      prompt: `Who ${verb} exactly ${value} ${noun}${value === 1 ? '' : kind === 'noms' ? 's' : ' wins'} this season?`,
      correctPlayerId: player.id,
      category: kind === 'noms' ? 'nominations' : 'competition',
      difficulty: 0.62,
    })
  })
}

export function buildMemoryLaneQuestionBank(state: GameState, seed: number): MemoryLaneQuestion[] {
  const players = aliveOrSeasonPlayers(state)
  const questions: MemoryLaneQuestion[] = []
  if (players.length < 4) return questions

  const firstLoh = getFirstLohWinner(state)
  if (firstLoh) {
    pushQuestion(questions, state, seed, {
      id: 'first-loh',
      prompt: isVoxSeason(state) ? 'Who won the very first immunity competition?' : 'Who won the very first LOH of the season?',
      correctPlayerId: firstLoh.id,
      category: 'milestone',
      difficulty: 0.32,
      receipt: 'Opening power',
    })
  }

  const firstPos = getFirstPosWinner(state)
  if (firstPos) {
    pushQuestion(questions, state, seed, {
      id: 'first-pos',
      prompt: 'Who won the first Power of Safety of the season?',
      correctPlayerId: firstPos.id,
      category: 'milestone',
      difficulty: 0.36,
      receipt: 'First Safety win',
    })
  }

  const mostLoh = uniqueWinner(players, (player) => player.stats?.lohWins ?? 0, { requirePositive: true })
  if (mostLoh) pushQuestion(questions, state, seed, {
    id: 'most-loh',
    prompt: isVoxSeason(state) ? 'Who won the most immunity competitions?' : 'Who won the most LOH competitions?',
    correctPlayerId: mostLoh.id,
    category: 'competition',
    difficulty: 0.48,
  })

  const mostPos = uniqueWinner(players, (player) => player.stats?.posWins ?? 0, { requirePositive: true })
  if (mostPos) pushQuestion(questions, state, seed, {
    id: 'most-pos',
    prompt: 'Who won the most Power of Safety competitions?',
    correctPlayerId: mostPos.id,
    category: 'competition',
    difficulty: 0.52,
  })

  const mostComps = uniqueWinner(
    players,
    (player) => (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0),
    { requirePositive: true }
  )
  if (mostComps) pushQuestion(questions, state, seed, {
    id: 'most-comps',
    prompt: 'Who won the most competitions overall?',
    correctPlayerId: mostComps.id,
    category: 'competition',
    difficulty: 0.58,
  })

  const mostNominated = uniqueWinner(players, (player) => player.stats?.timesNominated ?? 0, { requirePositive: true })
  if (mostNominated) pushQuestion(questions, state, seed, {
    id: 'most-nominated',
    prompt: 'Who was nominated the most times this season?',
    correctPlayerId: mostNominated.id,
    category: 'nominations',
    difficulty: 0.52,
  })

  const neverNominated = players.filter((player) => (player.stats?.timesNominated ?? 0) === 0)
  if (neverNominated.length === 1) pushQuestion(questions, state, seed, {
    id: 'never-nominated',
    prompt: 'Who made it through the season without ever being nominated?',
    correctPlayerId: neverNominated[0].id,
    category: 'nominations',
    difficulty: 0.64,
  })

  const firstEvicted = uniqueWinner(
    players.filter((player) => typeof player.evictedAtWeek === 'number'),
    (player) => player.evictedAtWeek ?? Number.MAX_SAFE_INTEGER,
    { lowest: true }
  )
  if (firstEvicted) pushQuestion(questions, state, seed, {
    id: 'first-evicted',
    prompt: 'Who was the first housemate evicted this season?',
    correctPlayerId: firstEvicted.id,
    category: 'milestone',
    difficulty: 0.3,
    preferredIds: players.filter((player) => player.status === 'evicted' || player.status === 'jury').map((player) => player.id),
  })

  const fourth = players.filter((player) => player.seasonPlacement === 4)
  if (fourth.length === 1) pushQuestion(questions, state, seed, {
    id: 'fourth-place',
    prompt: 'Who was the last housemate evicted before the Final 3?',
    correctPlayerId: fourth[0].id,
    category: 'milestone',
    difficulty: 0.42,
  })

  const battleBackWinners = players.filter((player) => (player.stats?.battleBackWins ?? 0) > 0)
  if (battleBackWinners.length === 1) pushQuestion(questions, state, seed, {
    id: 'battle-back-return',
    prompt: 'Who fought their way back into the game after being evicted?',
    correctPlayerId: battleBackWinners[0].id,
    category: 'shock',
    difficulty: 0.38,
    receipt: 'Back 2 the Game',
  })

  const doubleSurvivors = players.filter((player) => player.stats?.survivedDoubleEviction === true)
  if (doubleSurvivors.length === 1) pushQuestion(questions, state, seed, {
    id: 'double-survivor',
    prompt: 'Who survived the season’s Double Eviction danger?',
    correctPlayerId: doubleSurvivors[0].id,
    category: 'shock',
    difficulty: 0.56,
  })

  const depressionWeek = state.depressionShock?.activatedWeek
  if (typeof depressionWeek === 'number') {
    const stormEvictees = players.filter(
      (player) => player.evictedAtWeek === depressionWeek || player.evictedAtWeek === depressionWeek + 1
    )
    if (stormEvictees.length === 1) pushQuestion(questions, state, seed, {
      id: 'depression-eviction',
      prompt: 'Who was evicted while the Depression Shock was hanging over the house?',
      correctPlayerId: stormEvictees[0].id,
      category: 'shock',
      difficulty: 0.68,
    })
  }

  const saves = publicSaveCounts(state)
  const mostSaved = uniqueWinner(players, (player) => saves[player.id] ?? 0, { requirePositive: true })
  if (mostSaved) pushQuestion(questions, state, seed, {
    id: 'most-public-saves',
    prompt: isVoxSeason(state)
      ? 'Who received the most Safety saves during the audience-led season?'
      : 'Who was saved by the public the most times?',
    correctPlayerId: mostSaved.id,
    category: 'public',
    difficulty: 0.66,
  })

  if (state.voxPopuli?.audienceVoteDaysByPlayerId) {
    const mostAudienceBallots = uniqueWinner(
      players,
      (player) => state.voxPopuli?.audienceVoteDaysByPlayerId?.[player.id]?.length ?? 0,
      { requirePositive: true }
    )
    if (mostAudienceBallots) pushQuestion(questions, state, seed, {
      id: 'vox-most-audience-ballots',
      prompt: 'Who faced the audience vote on the most days?',
      correctPlayerId: mostAudienceBallots.id,
      category: 'public',
      difficulty: 0.7,
    })
  }

  if (state.cupidArrow?.pairs?.length) {
    const pairQuestions = shuffle(state.cupidArrow.pairs, rngFor(seed, 'cupid-pairs')).slice(0, 3)
    pairQuestions.forEach((pair, index) => {
      const [firstId, secondId] = pair.memberIds
      const first = players.find((player) => player.id === firstId)
      const second = players.find((player) => player.id === secondId)
      if (!first || !second) return
      const askAboutFirst = (seed + index) % 2 === 0
      const subject = askAboutFirst ? first : second
      const answer = askAboutFirst ? second : first
      pushQuestion(questions, state, seed, {
        id: `cupid-partner-${pair.id}-${index}`,
        prompt: `Who was paired with ${subject.name} by Cupid's Arrow?`,
        correctPlayerId: answer.id,
        category: 'cupid',
        difficulty: 0.44,
      })
    })
  }

  addUniqueCountQuestions(questions, state, seed, 'loh')
  addUniqueCountQuestions(questions, state, seed, 'pos')
  addUniqueCountQuestions(questions, state, seed, 'noms')

  const zeroWinEvictees = players.filter(
    (player) =>
      (player.status === 'evicted' || player.status === 'jury') &&
      (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0) === 0 &&
      typeof player.evictedAtWeek === 'number'
  )
  const deepestZeroWin = uniqueWinner(zeroWinEvictees, (player) => player.evictedAtWeek ?? 0, {
    requirePositive: true,
  })
  if (deepestZeroWin) pushQuestion(questions, state, seed, {
    id: 'deepest-zero-win',
    prompt: 'Who made the deepest run without winning an LOH or POS competition?',
    correctPlayerId: deepestZeroWin.id,
    category: 'milestone',
    difficulty: 0.78,
  })

  const deduped = [...new Map(questions.map((question) => [question.id, question])).values()]
  return shuffle(deduped, rngFor(seed, 'question-order'))
}

export function isVoxSeason(state: GameState): boolean {
  return state.voxPopuli?.status === 'active' || state.voxPopuli?.status === 'complete'
}

export function simulateMemoryLaneAiDecision(input: {
  seed: number
  question: MemoryLaneQuestion
  aiPlayerId: string
  aiAbility?: number
  aiLives: number
  humanLives: number
}): MemoryLaneAiDecision {
  const { seed, question, aiPlayerId, aiLives, humanLives } = input
  const random = rngFor(seed, `ai:${aiPlayerId}:${question.id}:${aiLives}:${humanLives}`)
  const rawAbility = Number.isFinite(input.aiAbility) ? Number(input.aiAbility) : 0.68
  const ability = rawAbility > 1 ? Math.max(0, Math.min(1, rawAbility / 100)) : Math.max(0, Math.min(1, rawAbility))
  const knowledgeProbability = Math.max(0.34, Math.min(0.93, 0.49 + ability * 0.42 - question.difficulty * 0.24))
  const actuallyKnows = random() < knowledgeProbability
  const confidenceBase = actuallyKnows
    ? 0.64 + random() * 0.34
    : 0.3 + random() * 0.4
  const pressureAdjustment = aiLives <= 1 ? -0.09 : humanLives <= 1 ? 0.07 : 0
  const confidence = Math.max(0.12, Math.min(0.98, confidenceBase + pressureAdjustment))
  const threshold = aiLives <= 1 ? 0.68 : humanLives <= 1 ? 0.5 : 0.57
  const willBuzz = confidence >= threshold || random() < Math.max(0.04, confidence - 0.46)
  const delayMs = Math.round(
    1050 + (1 - confidence) * 3600 + question.difficulty * 850 + random() * 900
  )
  const wrongOptions = question.optionPlayerIds.filter((id) => id !== question.correctPlayerId)
  const correct = actuallyKnows && random() < Math.max(0.66, 0.86 - question.difficulty * 0.12)
  const answerPlayerId = correct
    ? question.correctPlayerId
    : wrongOptions[Math.floor(random() * Math.max(1, wrongOptions.length))] ?? question.correctPlayerId
  return { willBuzz, delayMs, correct, answerPlayerId, confidence }
}
