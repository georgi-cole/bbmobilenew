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

function seasonPlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.id && player.name)
}

function evictedPlayers(state: GameState): Player[] {
  return seasonPlayers(state).filter(
    (player) =>
      player.status === 'evicted' || player.status === 'jury' || player.evictedAtWeek != null
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
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function numericRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  )
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
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
      id !== correctId && !excluded.has(id) && byId.has(id) && values.indexOf(id) === index
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
  const counts: Record<string, number> = {}
  const seen = new Set<string>()

  for (const event of state.history ?? []) {
    if (event.type !== 'seasonReceipt:publicSave') continue
    const id = typeof event.data.playerId === 'string' ? event.data.playerId : null
    if (!id) continue
    const key = `${event.week}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    counts[id] = (counts[id] ?? 0) + 1
  }

  // Older Drama-mode saves already have a durable event id ending in the
  // actually saved player id. Use them as a backwards-compatible fallback,
  // but never treat the nominee list's first member as the saved player.
  const playersByLongestId = [...seasonPlayers(state)].sort(
    (left, right) => right.id.length - left.id.length
  )
  for (const event of state.social?.dramaNetwork?.events ?? []) {
    if (!event.id.startsWith('public-save-')) continue
    const saved = playersByLongestId.find((player) => event.id.endsWith(`-${player.id}`))
    if (!saved) continue
    const key = `${event.week}:${saved.id}`
    if (seen.has(key)) continue
    seen.add(key)
    counts[saved.id] = (counts[saved.id] ?? 0) + 1
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
      /won leader of the house|has won leader of the house|wins the immunity competition/i.test(
        text
      )
    )
  })
}

interface FirstSafetyUse {
  holder: Player
  saved: Player
}

function getFirstSafetyUse(state: GameState): FirstSafetyUse | null {
  const players = seasonPlayers(state)
  const ordered = [...state.tvFeed].sort((left, right) => left.timestamp - right.timestamp)

  for (const event of ordered) {
    const lower = event.text.toLowerCase()
    if (!/power of safety|used the power|used safety|used pos/.test(lower)) continue

    const actionMarkers = [' decided to use ', ' used ']
      .map((marker) => lower.indexOf(marker))
      .filter((index) => index >= 0)
    if (actionMarkers.length === 0) continue
    const actionIndex = Math.min(...actionMarkers)

    const named = players
      .map((player) => ({ player, index: lower.indexOf(player.name.toLowerCase()) }))
      .filter((entry) => entry.index >= 0)
    const holderMatches = named.filter((entry) => entry.index < actionIndex)
    if (holderMatches.length !== 1) continue
    const holder = holderMatches[0].player

    const afterAction = lower.slice(actionIndex)
    if (/on (?:himself|herself|themselves|themself)/.test(afterAction)) {
      return { holder, saved: holder }
    }

    const onIndex = lower.indexOf(' on ', actionIndex)
    const savingIndex = lower.indexOf(' saving ', actionIndex)
    const saveMarker = [onIndex, savingIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0]
    if (saveMarker == null) continue

    const savedMatches = named.filter(
      (entry) => entry.index > saveMarker && entry.player.id !== holder.id
    )
    if (savedMatches.length !== 1) continue
    return { holder, saved: savedMatches[0].player }
  }

  return null
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
      ? (player.stats?.lohWins ?? 0)
      : kind === 'pos'
        ? (player.stats?.posWins ?? 0)
        : (player.stats?.timesNominated ?? 0)
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
        ? `Which hubmate won exactly ${value} LOH competition${value === 1 ? '' : 's'} this season?`
        : kind === 'pos'
          ? `Which hubmate won exactly ${value} POS competition${value === 1 ? '' : 's'} this season?`
          : `Which hubmate was nominated exactly ${value} time${value === 1 ? '' : 's'} this season?`
    pushQuestion(questions, state, seed, {
      id: `unique-${kind}-${value}-${index}`,
      prompt,
      correctPlayerId: player.id,
      preferredIds:
        kind === 'noms'
          ? players
              .filter((entry) => (entry.stats?.timesNominated ?? 0) > 0)
              .map((entry) => entry.id)
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
        prompt: `The biggest elimination vote of the season was ${highestCount} votes. Who received them?`,
        correctPlayerId: highestPlayerIds[0],
        preferredIds: evictedIds,
        category: 'milestone',
        difficulty: 0.7,
        receipt: `${highestCount} elimination votes`,
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
      const ids = [
        ...new Set(
          margins.filter((entry) => entry.margin === narrowest).map((entry) => entry.playerId)
        ),
      ]
      if (ids.length === 1) {
        pushQuestion(questions, state, seed, {
          id: 'narrowest-eviction-margin',
          prompt: `The closest elimination was decided by just ${narrowest} vote${narrowest === 1 ? '' : 's'}. Who was eliminated?`,
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
      prompt: 'One elimination was decided by a single hubmate’s vote. Who was eliminated?',
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
      prompt: `${evictee.name} was eliminated in Week ${receipt.week}. Who was nominated alongside ${evictee.name}?`,
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
      prompt: `${evictee.name} left in Week ${receipt.week}. Who held LOH that week?`,
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
        .filter(
          (event) => pattern.test(event.text) || pattern.test(String(event.meta?.major ?? ''))
        )
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
  // If a shock removed more than one hubmate, "who was eliminated during it?"
  // has more than one true answer. Skip that template instead of hiding another
  // correct answer from the four options.
  if (ids.length !== 1) return
  const receipt = matching.find((entry) => entry.playerId === ids[0])
  pushQuestion(questions, state, seed, {
    id: `${idPrefix}-0`,
    prompt: `${label} hit in Week ${receipt?.week ?? '?'}, when one hubmate was eliminated. Who was it?`,
    correctPlayerId: ids[0],
    preferredIds: evictedPlayers(state).map((player) => player.id),
    category: 'shock',
    difficulty: 0.58,
    receipt: label,
  })
}

function categoryBalancedShuffle(
  questions: MemoryLaneQuestion[],
  seed: number
): MemoryLaneQuestion[] {
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
    const availableCategories = preferredOrder.filter(
      (category) => (groups.get(category)?.length ?? 0) > 0
    )
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
      id: 'first-competition',
      prompt: 'Who won the very first competition of the season?',
      correctPlayerId: firstLoh.id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'milestone',
      difficulty: 0.28,
      receipt: 'First competition of the season',
    })
  }

  const firstSafetyUse = getFirstSafetyUse(state)
  if (firstSafetyUse) {
    const selfSave = firstSafetyUse.holder.id === firstSafetyUse.saved.id
    pushQuestion(questions, state, seed, {
      id: 'first-pos-use',
      prompt: selfSave
        ? 'On the season’s first POS use, one hubmate saved themselves. Who used it?'
        : `${firstSafetyUse.saved.name} was saved on the season’s first POS use. Who used the POS?`,
      correctPlayerId: firstSafetyUse.holder.id,
      preferredIds: compWinners(state).map((player) => player.id),
      category: 'milestone',
      difficulty: 0.4,
      receipt: selfSave
        ? 'First POS use · self-save'
        : `First POS use · saved ${firstSafetyUse.saved.name}`,
    })
  }

  const mostLoh = uniqueWinner(players, (player) => player.stats?.lohWins ?? 0, {
    requirePositive: true,
  })
  if (mostLoh) {
    pushQuestion(questions, state, seed, {
      id: 'most-loh',
      prompt: isVoxSeason(state)
        ? `One hubmate finished with ${mostLoh.stats?.lohWins ?? 0} immunity wins — the season high. Who was it?`
        : `One hubmate finished with ${mostLoh.stats?.lohWins ?? 0} LOH wins — the season high. Who was it?`,
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
      prompt: `One hubmate finished with ${mostPos.stats?.posWins ?? 0} POS wins — the season high. Who was it?`,
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
      prompt: `LOH and POS combined, one hubmate won ${(mostComps.stats?.lohWins ?? 0) + (mostComps.stats?.posWins ?? 0)} competitions — more than anyone else. Who?`,
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
      prompt: `One hubmate faced nomination ${mostNominated.stats?.timesNominated ?? 0} times — the most this season. Who was it?`,
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
      prompt: 'Only one hubmate reached this point without ever being nominated. Who?',
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
    const survivedCount = Math.max(
      0,
      (mostSurvivedNoms.stats?.timesNominated ?? 0) -
        (exitCountByPlayer.get(mostSurvivedNoms.id) ?? 0)
    )
    pushQuestion(questions, state, seed, {
      id: 'most-nomination-survivals',
      prompt: `One hubmate survived nomination ${survivedCount} time${survivedCount === 1 ? '' : 's'} — more than anyone else. Who?`,
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
      prompt: `Week ${firstEvicted.evictedAtWeek ?? '?'} brought the season’s first elimination. Who left the game?`,
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
      prompt: `Just before the Final 3, one hubmate was eliminated in Week ${fourth[0].evictedAtWeek ?? '?'}. Who was it?`,
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
      prompt: 'Back 2 the Game brought one eliminated hubmate back. Who returned?',
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
      prompt: 'One hubmate survived the Double Elimination shock. Who was it?',
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
    'the Double Elimination'
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
    const saveCount = saves[mostSaved.id] ?? 0
    pushQuestion(questions, state, seed, {
      id: 'most-public-saves',
      prompt: isVoxSeason(state)
        ? `The audience saved one hubmate ${saveCount} time${saveCount === 1 ? '' : 's'} — more than anyone else. Who?`
        : `The public saved one hubmate ${saveCount} time${saveCount === 1 ? '' : 's'} — more than anyone else. Who?`,
      correctPlayerId: mostSaved.id,
      category: 'public',
      difficulty: 0.66,
    })
  }

  if (isVoxSeason(state) && state.voxPopuli?.safetySaveCounts) {
    const mostPosSaved = uniqueWinner(
      players,
      (player) => state.voxPopuli?.safetySaveCounts?.[player.id] ?? 0,
      { requirePositive: true }
    )
    if (mostPosSaved) {
      const posSaveCount = state.voxPopuli.safetySaveCounts[mostPosSaved.id] ?? 0
      pushQuestion(questions, state, seed, {
        id: 'vox-most-pos-saves',
        prompt: `One hubmate was saved by POS ${posSaveCount} time${
          posSaveCount === 1 ? '' : 's'
        } — more than anyone else. Who?`,
        correctPlayerId: mostPosSaved.id,
        category: 'competition',
        difficulty: 0.64,
      })
    }
  }

  if (state.voxPopuli?.audienceVoteDaysByPlayerId) {
    const mostAudienceBallots = uniqueWinner(
      players,
      (player) => state.voxPopuli?.audienceVoteDaysByPlayerId?.[player.id]?.length ?? 0,
      { requirePositive: true }
    )
    if (mostAudienceBallots) {
      const audienceDays =
        state.voxPopuli?.audienceVoteDaysByPlayerId?.[mostAudienceBallots.id]?.length ?? 0
      pushQuestion(questions, state, seed, {
        id: 'vox-most-audience-ballots',
        prompt: `One hubmate faced the audience vote on ${audienceDays} day${audienceDays === 1 ? '' : 's'} — more than anyone else. Who?`,
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
        prompt: 'Only one hubmate never faced an audience elimination vote. Who?',
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
        prompt: `Cupid’s Arrow paired ${subject.name} with which hubmate?`,
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
      prompt: 'Only one hubmate won both an LOH and a POS this season. Who?',
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
      prompt: `One hubmate made it all the way to Week ${deepestZeroWin.evictedAtWeek ?? '?'} without an LOH or POS win. Who?`,
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
export function buildMemoryLanePreviewBank(
  players: readonly Player[],
  seed: number
): MemoryLaneQuestion[] {
  if (players.length < 4) return []
  const random = rngFor(seed, 'preview-bank')
  const roster = shuffle(players, random)
  const prompts = [
    'Think back to opening day: who won the first competition?',
    'The first POS save protected a nominee. Who used that POS?',
    'The biggest early elimination vote sent which hubmate out?',
    'Who has the most LOH and POS wins combined?',
    'Who survived nomination more times than anyone else?',
    'Back 2 the Game returned one eliminated hubmate. Who came back?',
    'Who was recorded as the survivor of the Double Elimination shock?',
    'Who received the most audience saves?',
    'Which hubmate reached Final 4 after surviving the most nominations?',
    'Who was eliminated first?',
    'Who won the final POS competition before finale week?',
    'Who entered finale week with the highest total competition-win count?',
  ]
  return prompts.map((prompt, index) => {
    const correct = roster[index % roster.length]
    const options =
      makeOptions(correct.id, players, seed + index * 31, `preview-${index}`) ??
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
    mental * 0.56 +
    consistency * 0.16 +
    nerve * 0.12 +
    clutch * 0.16 -
    Math.max(0, chokeRisk - 50) * 0.08
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
  const ability =
    rawAbility > 1
      ? Math.max(0, Math.min(1, rawAbility / 100))
      : Math.max(0, Math.min(1, rawAbility))

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
    : (wrongOptions[Math.floor(random() * Math.max(1, wrongOptions.length))] ??
      question.correctPlayerId)

  return { willBuzz, delayMs, correct, answerPlayerId, confidence }
}
