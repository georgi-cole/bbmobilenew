import type { CompetitionSkillProfile } from '../../ai/competition/types'
import type { GameHistoryEvent, GameState, Player } from '../../types'

export type MemoryLaneCategory =
  | 'competition'
  | 'nominations'
  | 'milestone'
  | 'shock'
  | 'public'
  | 'cupid'

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

interface SeasonExitReceipt {
  playerId: string
  week: number
  nomineeIds: string[]
  leaderIds: string[]
  voteCounts: Record<string, number>
  votesByVoterId: Record<string, string>
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

function choosePrompt(seed: number, salt: string, prompts: readonly string[]): string {
  if (prompts.length === 0) return ''
  const random = rngFor(seed, `prompt:${salt}`)
  return prompts[Math.floor(random() * prompts.length)] ?? prompts[0]
}

function seasonPlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.id && player.name)
}

function evictedPlayers(state: GameState): Player[] {
  return seasonPlayers(state).filter(
    (player) => player.status === 'evicted' || player.status === 'jury' || player.evictedAtWeek != null
  )
}

function compWinners(state: GameState): Player[] {
  return seasonPlayers(state).filter(
    (player) => (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0) > 0
  )
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
  const ordered = [...state.tvFeed].sort((left, right) => left.timestamp - right.timestamp)
  for (const event of ordered) {
    if (!matcher(event.text, event)) continue
    const lowered = event.text.toLowerCase()
    const candidates = state.players
      .filter((player) => lowered.includes(player.name.toLowerCase()))
      .sort((left, right) => right.name.length - left.name.length)
    if (candidates.length > 0) return candidates[0]
  }
  return null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function numericRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  )
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
}

export function getSeasonExitReceipts(state: Pick<GameState, 'history'>): SeasonExitReceipt[] {
  return (state.history ?? []).flatMap((event) => {
    if (event.type !== 'seasonExit') return []
    const playerId = typeof event.data.playerId === 'string' ? event.data.playerId : null
    if (!playerId) return []
    return [
      {
        playerId,
        week: typeof event.week === 'number' ? event.week : 0,
        nomineeIds: stringArray(event.data.nomineeIds),
        leaderIds: stringArray(event.data.leaderIds),
        voteCounts: numericRecord(event.data.voteCounts),
        votesByVoterId: stringRecord(event.data.votesByVoterId),
      },
    ]
  })
}

function makeOptions(
  correctId: string,
  pool: readonly Player[],
  seed: number,
  salt: string,
  preferredIds: readonly string[] = [],
  excludedIds: readonly string[] = []
): string[] | null {
  const byId = new Map(pool.map((player) => [player.id, player]))
  if (!byId.has(correctId)) return null
  const excluded = new Set(excludedIds.filter((id) => id !== correctId))
  const preferred = preferredIds.filter(
    (id, index, values) =>
      id !== correctId &&
      !excluded.has(id) &&
      byId.has(id) &&
      values.indexOf(id) === index
  )
  const random = rngFor(seed, `options:${salt}`)
  const rest = shuffle(
    pool
      .map((player) => player.id)
      .filter((id) => id !== correctId && !excluded.has(id) && !preferred.includes(id)),
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
  input: Omit<MemoryLaneQuestion, 'optionPlayerIds'> & {
    preferredIds?: string[]
    excludedIds?: string[]
  }
): void {
  const options = makeOptions(
    input.correctPlayerId,
    seasonPlayers(state),
    seed,
    input.id,
    input.preferredIds,
    input.excludedIds
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
    return (
      template.startsWith('loh.') ||
      /won leader of the house|has won leader of the house|wins the immunity competition/i.test(text)
    )
  })
}

function getFirstPosWinner(state: GameState): Player | null {
  const receipt = state.history?.find((event) => event.type === 'seasonReceipt:posWin')
  const id = typeof receipt?.data.playerId === 'string' ? receipt.data.playerId : null
  if (id) return state.players.find((player) => player.id === id) ?? null
  return firstPlayerNamedInFeed(
    state,
    (text) => /won the power of safety|has won the power of safety/i.test(text)
  )
}

function addUniqueCountQuestions(
  questions: MemoryLaneQuestion[],
  state: GameState,
  seed: number,
  kind: 'loh' | 'pos' | 'noms'
): void {
  const players = seasonPlayers(state)
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
    const prompt =
      kind === 'loh'
        ? `Who won exactly ${value} LOH competition${value === 1 ? '' : 's'} this season?`
        : kind === 'pos'
          ? `Who won exactly ${value} Power of Safety competition${value === 1 ? '' : 's'} this season?`
          : `Who received exactly ${value} nomination${value === 1 ? '' : 's'} this season?`
    pushQuestion(questions, state, seed, {
      id: `unique-${kind}-${value}-${index}`,
      prompt,
      correctPlayerId: player.id,
      preferredIds:
        kind === 'noms'
          ? players.filter((entry) => (entry.stats?.timesNominated ?? 0) > 0).map((entry) => entry.id)
          : compWinners(state).map((entry) => entry.id),
      category: kind === 'noms' ? 'nominations' : 'competition',
      difficulty: 0.64,
    })
  })
}

function addExitReceiptQuestions(
  questions: MemoryLaneQuestion[],
  state: GameState,
  seed: number,
  receipts: SeasonExitReceipt[]
): void {
  const players = seasonPlayers(state)
  const evictedIds = evictedPlayers(state).map((player) => player.id)
  const voteEvents = receipts
    .map((receipt) => ({
      receipt,
      count: receipt.voteCounts[receipt.playerId] ?? 0,
    }))
    .filter((entry) => entry.count > 0)

  if (voteEvents.length > 0) {
    const highestCount = Math.max(...voteEvents.map((entry) => entry.count))
    const highestPlayerIds = [
      ...new Set(
        voteEvents
          .filter((entry) => entry.count === highestCount)
          .map((entry) => entry.receipt.playerId)
      ),
    ]
    if (highestPlayerIds.length === 1) {
      pushQuestion(questions, state, seed, {
        id: 'highest-eviction-vote-count',
        prompt: choosePrompt(seed, 'highest-eviction-vote-count', [
          'Who was evicted with the highest single vote count of the season?',
          'Which housemate received the most eviction votes in a single house vote?',
          'Whose eviction came with the season’s biggest vote total?',
        ]),
        correctPlayerId: highestPlayerIds[0],
        preferredIds: evictedIds,
        category: 'milestone',
        difficulty: 0.7,
        receipt: `${highestCount} eviction votes`,
      })
    }

    const margins = voteEvents.flatMap(({ receipt, count }) => {
      const otherCounts = Object.entries(receipt.voteCounts)
        .filter(([id]) => id !== receipt.playerId)
        .map(([, value]) => value)
      if (otherCounts.length === 0) return []
      const runnerUp = Math.max(...otherCounts)
      const margin = count - runnerUp
      return margin > 0 ? [{ playerId: receipt.playerId, margin }] : []
    })
    if (margins.length > 0) {
      const narrowest = Math.min(...margins.map((entry) => entry.margin))
      const ids = [...new Set(margins.filter((entry) => entry.margin === narrowest).map((entry) => entry.playerId))]
      if (ids.length === 1) {
        pushQuestion(questions, state, seed, {
          id: 'narrowest-eviction-margin',
          prompt: 'Whose eviction was decided by the narrowest clear vote margin?',
          correctPlayerId: ids[0],
          preferredIds: evictedIds,
          category: 'milestone',
          difficulty: 0.78,
          receipt: `${narrowest}-vote margin`,
        })
      }
    }
  }

  const soleVoteExits = receipts.filter(
    (receipt) => Object.keys(receipt.votesByVoterId).length === 1 && receipt.playerId
  )
  const soleVoteIds = [...new Set(soleVoteExits.map((receipt) => receipt.playerId))]
  if (soleVoteIds.length === 1) {
    pushQuestion(questions, state, seed, {
      id: 'sole-vote-eviction',
      prompt: 'Who was sent out in the eviction decided by a single housemate’s vote?',
      correctPlayerId: soleVoteIds[0],
      preferredIds: evictedIds,
      category: 'milestone',
      difficulty: 0.68,
    })
  }

  const relationshipReceipts = shuffle(
    receipts.filter(
      (receipt) => receipt.nomineeIds.length === 2 && receipt.nomineeIds.includes(receipt.playerId)
    ),
    rngFor(seed, 'exit-companions')
  ).slice(0, 2)
  relationshipReceipts.forEach((receipt, index) => {
    const survivorId = receipt.nomineeIds.find((id) => id !== receipt.playerId)
    const evictee = players.find((player) => player.id === receipt.playerId)
    if (!survivorId || !evictee) return
    pushQuestion(questions, state, seed, {
      id: `eviction-companion-${receipt.week}-${index}`,
      prompt: `Who was sitting beside ${evictee.name} on the block when ${evictee.name} was evicted?`,
      correctPlayerId: survivorId,
      preferredIds: receipt.nomineeIds,
      category: 'nominations',
      difficulty: 0.72,
    })
  })

  const leaderReceipts = shuffle(
    receipts.filter((receipt) => receipt.leaderIds.length === 1),
    rngFor(seed, 'exit-leaders')
  ).slice(0, 2)
  leaderReceipts.forEach((receipt, index) => {
    const evictee = players.find((player) => player.id === receipt.playerId)
    if (!evictee) return
    pushQuestion(questions, state, seed, {
      id: `eviction-leader-${receipt.week}-${index}`,
      prompt: `Who was LOH when ${evictee.name} was evicted?`,
      correctPlayerId: receipt.leaderIds[0],
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'milestone',
      difficulty: 0.74,
    })
  })
}

function shockWeeksFromHistory(
  history: readonly GameHistoryEvent[] | undefined,
  predicate: (event: GameHistoryEvent) => boolean
): number[] {
  return [...new Set((history ?? []).filter(predicate).map((event) => event.week))]
}

function shockWeeksFromFeed(state: GameState, pattern: RegExp): number[] {
  return [
    ...new Set(
      state.tvFeed
        .filter((event) => pattern.test(event.text) || pattern.test(String(event.meta?.major ?? '')))
        .map((event) => Number(event.meta?.week ?? 0))
        .filter((week) => Number.isFinite(week) && week > 0)
    ),
  ]
}

function addShockExitQuestions(
  questions: MemoryLaneQuestion[],
  state: GameState,
  seed: number,
  receipts: SeasonExitReceipt[],
  weeks: readonly number[],
  idPrefix: string,
  label: string
): void {
  const matching = receipts.filter((receipt) => weeks.includes(receipt.week))
  if (matching.length === 0) return
  const ids = [...new Set(matching.map((receipt) => receipt.playerId))]
  shuffle(ids, rngFor(seed, `shock:${idPrefix}`))
    .slice(0, Math.min(2, ids.length))
    .forEach((id, index) => {
      pushQuestion(questions, state, seed, {
        id: `${idPrefix}-${index}`,
        prompt: `Which of these housemates was evicted during ${label}?`,
        correctPlayerId: id,
        excludedIds: ids.filter((other) => other !== id),
        preferredIds: evictedPlayers(state).map((player) => player.id),
        category: 'shock',
        difficulty: 0.58,
        receipt: label,
      })
    })
}

function categoryBalancedShuffle(questions: MemoryLaneQuestion[], seed: number): MemoryLaneQuestion[] {
  const random = rngFor(seed, 'balanced-question-order')
  const groups = new Map<MemoryLaneCategory, MemoryLaneQuestion[]>()
  for (const question of questions) {
    const group = groups.get(question.category) ?? []
    group.push(question)
    groups.set(question.category, group)
  }
  for (const [category, group] of groups.entries()) {
    groups.set(category, shuffle(group, rngFor(seed, `category:${category}`)))
  }

  const preferredOrder: MemoryLaneCategory[] = [
    'milestone',
    'competition',
    'nominations',
    'shock',
    'public',
    'cupid',
  ]
  const result: MemoryLaneQuestion[] = []
  while ([...groups.values()].some((group) => group.length > 0)) {
    const availableCategories = preferredOrder.filter((category) => (groups.get(category)?.length ?? 0) > 0)
    if (availableCategories.length === 0) break
    const offset = Math.floor(random() * availableCategories.length)
    const rotated = [...availableCategories.slice(offset), ...availableCategories.slice(0, offset)]
    for (const category of rotated) {
      const group = groups.get(category)
      const question = group?.shift()
      if (question) result.push(question)
    }
  }
  return result
}

export function isVoxSeason(state: GameState): boolean {
  return state.voxPopuli?.status === 'active' || state.voxPopuli?.status === 'complete'
}

export function buildMemoryLaneQuestionBank(state: GameState, seed: number): MemoryLaneQuestion[] {
  const players = seasonPlayers(state)
  const questions: MemoryLaneQuestion[] = []
  if (players.length < 4) return questions

  const firstLoh = getFirstLohWinner(state)
  if (firstLoh) {
    pushQuestion(questions, state, seed, {
      id: 'first-loh',
      prompt: isVoxSeason(state)
        ? choosePrompt(seed, 'first-loh-vox', [
            'Who won the very first immunity competition?',
            'Who claimed the season’s first competition immunity?',
          ])
        : choosePrompt(seed, 'first-loh', [
            'Who won the very first LOH of the season?',
            'Who held LOH power first this season?',
            'Who kicked off the season as the first LOH winner?',
          ]),
      correctPlayerId: firstLoh.id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'milestone',
      difficulty: 0.3,
      receipt: 'Opening power',
    })
  }

  const firstPos = getFirstPosWinner(state)
  if (firstPos) {
    pushQuestion(questions, state, seed, {
      id: 'first-pos',
      prompt: choosePrompt(seed, 'first-pos', [
        'Who won the first Power of Safety of the season?',
        'Who was the season’s first Safety winner?',
      ]),
      correctPlayerId: firstPos.id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'milestone',
      difficulty: 0.34,
      receipt: 'First Safety win',
    })
  }

  const mostLoh = uniqueWinner(players, (player) => player.stats?.lohWins ?? 0, {
    requirePositive: true,
  })
  if (mostLoh) {
    pushQuestion(questions, state, seed, {
      id: 'most-loh',
      prompt: isVoxSeason(state)
        ? 'Who won the most immunity competitions?'
        : 'Who won the most LOH competitions?',
      correctPlayerId: mostLoh.id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'competition',
      difficulty: 0.48,
    })
  }

  const mostPos = uniqueWinner(players, (player) => player.stats?.posWins ?? 0, {
    requirePositive: true,
  })
  if (mostPos) {
    pushQuestion(questions, state, seed, {
      id: 'most-pos',
      prompt: 'Who won the most Power of Safety competitions?',
      correctPlayerId: mostPos.id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'competition',
      difficulty: 0.52,
    })
  }

  const mostComps = uniqueWinner(
    players,
    (player) => (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0),
    { requirePositive: true }
  )
  if (mostComps) {
    pushQuestion(questions, state, seed, {
      id: 'most-comps',
      prompt: 'Who won the most competitions overall?',
      correctPlayerId: mostComps.id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'competition',
      difficulty: 0.58,
    })
  }

  const mostNominated = uniqueWinner(players, (player) => player.stats?.timesNominated ?? 0, {
    requirePositive: true,
  })
  if (mostNominated) {
    pushQuestion(questions, state, seed, {
      id: 'most-nominated',
      prompt: choosePrompt(seed, 'most-nominated', [
        'Who was nominated the most times this season?',
        'Who spent the most time on the block?',
      ]),
      correctPlayerId: mostNominated.id,
      preferredIds: players
        .filter((player) => (player.stats?.timesNominated ?? 0) > 0)
        .map((player) => player.id),
      category: 'nominations',
      difficulty: 0.52,
    })
  }

  const neverNominated = players.filter((player) => (player.stats?.timesNominated ?? 0) === 0)
  if (neverNominated.length === 1) {
    pushQuestion(questions, state, seed, {
      id: 'never-nominated',
      prompt: 'Who made it through the season without ever being nominated?',
      correctPlayerId: neverNominated[0].id,
      category: 'nominations',
      difficulty: 0.64,
    })
  }

  const exits = getSeasonExitReceipts(state)
  const exitCountByPlayer = new Map<string, number>()
  for (const receipt of exits) {
    exitCountByPlayer.set(receipt.playerId, (exitCountByPlayer.get(receipt.playerId) ?? 0) + 1)
  }
  const mostSurvivedNoms = uniqueWinner(
    players,
    (player) =>
      Math.max(0, (player.stats?.timesNominated ?? 0) - (exitCountByPlayer.get(player.id) ?? 0)),
    { requirePositive: true }
  )
  if (mostSurvivedNoms) {
    pushQuestion(questions, state, seed, {
      id: 'most-nomination-survivals',
      prompt: 'Who survived being nominated the greatest number of times?',
      correctPlayerId: mostSurvivedNoms.id,
      preferredIds: players
        .filter((player) => (player.stats?.timesNominated ?? 0) > 0)
        .map((player) => player.id),
      category: 'nominations',
      difficulty: 0.72,
    })
  }

  const firstEvicted = uniqueWinner(
    players.filter((player) => typeof player.evictedAtWeek === 'number'),
    (player) => player.evictedAtWeek ?? Number.MAX_SAFE_INTEGER,
    { lowest: true }
  )
  if (firstEvicted) {
    pushQuestion(questions, state, seed, {
      id: 'first-evicted',
      prompt: 'Who was the first housemate evicted this season?',
      correctPlayerId: firstEvicted.id,
      category: 'milestone',
      difficulty: 0.28,
      preferredIds: evictedPlayers(state).map((player) => player.id),
    })
  }

  const fourth = players.filter((player) => player.seasonPlacement === 4)
  if (fourth.length === 1) {
    pushQuestion(questions, state, seed, {
      id: 'fourth-place',
      prompt: 'Who was the last housemate evicted before the Final 3?',
      correctPlayerId: fourth[0].id,
      preferredIds: evictedPlayers(state).map((player) => player.id),
      category: 'milestone',
      difficulty: 0.4,
    })
  }

  const battleBackWinners = players.filter((player) => (player.stats?.battleBackWins ?? 0) > 0)
  if (battleBackWinners.length === 1) {
    pushQuestion(questions, state, seed, {
      id: 'battle-back-return',
      prompt: 'Who fought their way back into the game after being evicted?',
      correctPlayerId: battleBackWinners[0].id,
      preferredIds: evictedPlayers(state).map((player) => player.id),
      category: 'shock',
      difficulty: 0.36,
      receipt: 'Back 2 the Game',
    })
  }

  const doubleSurvivors = players.filter((player) => player.stats?.survivedDoubleEviction === true)
  if (doubleSurvivors.length === 1) {
    pushQuestion(questions, state, seed, {
      id: 'double-survivor',
      prompt: 'Who survived the season’s Double Eviction danger?',
      correctPlayerId: doubleSurvivors[0].id,
      category: 'shock',
      difficulty: 0.56,
    })
  }

  addExitReceiptQuestions(questions, state, seed, exits)

  const doubleWeeks = [
    ...new Set([
      ...shockWeeksFromHistory(state.history, (event) =>
        /double.?eviction|double.?elimination/i.test(`${event.type} ${JSON.stringify(event.data)}`)
      ),
      ...shockWeeksFromFeed(state, /double.?eviction|double.?elimination/i),
    ]),
  ]
  addShockExitQuestions(
    questions,
    state,
    seed,
    exits,
    doubleWeeks,
    'double-eviction-exit',
    'the Double Eviction'
  )

  const depressionWeek = state.depressionShock?.activatedWeek
  if (typeof depressionWeek === 'number') {
    addShockExitQuestions(
      questions,
      state,
      seed,
      exits,
      [depressionWeek, depressionWeek + 1],
      'depression-shock-exit',
      'the Depression Shock'
    )
  }

  const saves = publicSaveCounts(state)
  const mostSaved = uniqueWinner(players, (player) => saves[player.id] ?? 0, {
    requirePositive: true,
  })
  if (mostSaved) {
    pushQuestion(questions, state, seed, {
      id: 'most-public-saves',
      prompt: isVoxSeason(state)
        ? 'Who received the most Safety saves during the audience-led season?'
        : 'Who was saved by the public the most times?',
      correctPlayerId: mostSaved.id,
      category: 'public',
      difficulty: 0.66,
    })
  }

  if (state.voxPopuli?.audienceVoteDaysByPlayerId) {
    const mostAudienceBallots = uniqueWinner(
      players,
      (player) => state.voxPopuli?.audienceVoteDaysByPlayerId?.[player.id]?.length ?? 0,
      { requirePositive: true }
    )
    if (mostAudienceBallots) {
      pushQuestion(questions, state, seed, {
        id: 'vox-most-audience-ballots',
        prompt: 'Who faced the audience vote on the most days?',
        correctPlayerId: mostAudienceBallots.id,
        category: 'public',
        difficulty: 0.7,
      })
    }

    const audienceNeverFaced = players.filter(
      (player) => (state.voxPopuli?.audienceVoteDaysByPlayerId?.[player.id]?.length ?? 0) === 0
    )
    if (audienceNeverFaced.length === 1) {
      pushQuestion(questions, state, seed, {
        id: 'vox-never-audience-ballot',
        prompt: 'Who never faced an audience eviction vote?',
        correctPlayerId: audienceNeverFaced[0].id,
        category: 'public',
        difficulty: 0.74,
      })
    }
  }

  if (state.cupidArrow?.pairs?.length) {
    const pairQuestions = shuffle(state.cupidArrow.pairs, rngFor(seed, 'cupid-pairs')).slice(0, 4)
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

  const onlyBothPowerTypes = players.filter(
    (player) => (player.stats?.lohWins ?? 0) > 0 && (player.stats?.posWins ?? 0) > 0
  )
  if (onlyBothPowerTypes.length === 1) {
    pushQuestion(questions, state, seed, {
      id: 'only-loh-and-pos-winner',
      prompt: 'Who was the only housemate to win both LOH and Power of Safety this season?',
      correctPlayerId: onlyBothPowerTypes[0].id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'competition',
      difficulty: 0.7,
    })
  }

  const zeroWinEvictees = players.filter(
    (player) =>
      (player.status === 'evicted' || player.status === 'jury') &&
      (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0) === 0 &&
      typeof player.evictedAtWeek === 'number'
  )
  const deepestZeroWin = uniqueWinner(zeroWinEvictees, (player) => player.evictedAtWeek ?? 0, {
    requirePositive: true,
  })
  if (deepestZeroWin) {
    pushQuestion(questions, state, seed, {
      id: 'deepest-zero-win',
      prompt: 'Who made the deepest run without winning an LOH or Power of Safety competition?',
      correctPlayerId: deepestZeroWin.id,
      preferredIds: evictedPlayers(state).map((player) => player.id),
      category: 'milestone',
      difficulty: 0.78,
    })
  }

  const deduped = [...new Map(questions.map((question) => [question.id, question])).values()]
  return categoryBalancedShuffle(deduped, seed)
}

/**
 * Minigame Lab can launch Part 3 without a played season. This deterministic
 * preview bank exists only so the duel interaction can be QA'd in development;
 * a real Final 3 always uses buildMemoryLaneQuestionBank and real season facts.
 */
export function buildMemoryLanePreviewBank(players: readonly Player[], seed: number): MemoryLaneQuestion[] {
  if (players.length < 4) return []
  const random = rngFor(seed, 'preview-bank')
  const roster = shuffle(players, random)
  const prompts = [
    'Who held the opening power in this preview season?',
    'Who won the first Safety competition in this preview season?',
    'Who survived the biggest early vote in this preview?',
    'Who had the strongest competition record in this preview?',
    'Who escaped the block most often in this preview?',
    'Who returned to the house in this preview season?',
    'Who survived the Double Eviction in this preview?',
    'Who was saved by the audience most often in this preview?',
    'Who reached the Final 4 after the longest block run?',
    'Who was the season’s first evictee in this preview?',
    'Who won the last Safety before the finale in this preview?',
    'Who entered finale week with the most total wins in this preview?',
  ]
  return prompts.map((prompt, index) => {
    const correct = roster[index % roster.length]
    const options = makeOptions(correct.id, players, seed + index * 31, `preview-${index}`) ??
      players.slice(0, 4).map((player) => player.id)
    const categories: MemoryLaneCategory[] = [
      'milestone',
      'competition',
      'milestone',
      'competition',
      'nominations',
      'shock',
      'shock',
      'public',
      'nominations',
      'milestone',
      'competition',
      'competition',
    ]
    return {
      id: `lab-preview-${index}`,
      prompt,
      correctPlayerId: correct.id,
      optionPlayerIds: options,
      category: categories[index] ?? 'milestone',
      difficulty: 0.42 + (index % 5) * 0.08,
      receipt: 'Minigame Lab preview',
    }
  })
}

export function deriveMemoryLaneAiAbility(profile: CompetitionSkillProfile | undefined): number {
  if (!profile) return 66
  const normalize = (value: number | undefined, fallback: number) => {
    const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    return raw <= 1 ? raw * 100 : raw
  }
  const mental = normalize(profile.mental, 60)
  const consistency = normalize(profile.consistency, 55)
  const nerve = normalize(profile.nerve, 55)
  const clutch = normalize(profile.clutch, 55)
  const chokeRisk = normalize(profile.chokeRisk, 45)
  const ability =
    mental * 0.56 + consistency * 0.16 + nerve * 0.12 + clutch * 0.16 - Math.max(0, chokeRisk - 50) * 0.08
  return Math.max(42, Math.min(88, ability))
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
  const rawAbility = Number.isFinite(input.aiAbility) ? Number(input.aiAbility) : 66
  const ability = rawAbility > 1 ? Math.max(0, Math.min(1, rawAbility / 100)) : Math.max(0, Math.min(1, rawAbility))

  // Knowledge and buzzer confidence are intentionally separate. An AI can know
  // an answer but hesitate, or buzz confidently and be wrong.
  const knowledgeProbability = Math.max(
    0.34,
    Math.min(0.9, 0.46 + ability * 0.43 - question.difficulty * 0.22)
  )
  const actuallyKnows = random() < knowledgeProbability
  const confidenceBase = actuallyKnows ? 0.58 + random() * 0.36 : 0.25 + random() * 0.43
  const pressureAdjustment = aiLives <= 1 ? -0.1 : humanLives <= 1 ? 0.06 : 0
  const confidence = Math.max(0.1, Math.min(0.96, confidenceBase + pressureAdjustment))
  const threshold = aiLives <= 1 ? 0.69 : humanLives <= 1 ? 0.5 : 0.58
  const willBuzz = confidence >= threshold || random() < Math.max(0.03, confidence - 0.5)

  // Never machine-fast. Even a very confident AI still has a visible human-like
  // read/reaction delay, while hard memories can push hesitation past 5 seconds.
  const delayMs = Math.round(
    1200 + (1 - confidence) * 3500 + question.difficulty * 820 + random() * 850
  )
  const wrongOptions = question.optionPlayerIds.filter((id) => id !== question.correctPlayerId)
  const executionAccuracy = Math.max(0.7, Math.min(0.94, 0.91 - question.difficulty * 0.14))
  const correct = actuallyKnows && random() < executionAccuracy
  const answerPlayerId = correct
    ? question.correctPlayerId
    : wrongOptions[Math.floor(random() * Math.max(1, wrongOptions.length))] ?? question.correctPlayerId

  return { willBuzz, delayMs, correct, answerPlayerId, confidence }
}
