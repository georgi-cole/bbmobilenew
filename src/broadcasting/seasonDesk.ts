import type { GameState, Player, TvEvent } from '../types'
import { getBroadcastEditorialMetadata } from './broadcastEditorialPolicy'

export const BY_THE_NUMBERS_CATEGORY = 'by_the_numbers'
export const DAILY_NUMBERS_MIN_DAY = 2

export interface FauxTvEditorialCandidate {
  text: string
  storyKey: string
  cooldownKey: string
  subjectIds: string[]
  category: string
  significance: number
}

const POWER_MILESTONES = new Set([2, 3, 5])
const NOMINATION_MILESTONES = new Set([3, 5, 7])

function isActivePlayer(player: Player): boolean {
  return player.status !== 'evicted' && player.status !== 'jury'
}

function hasStory(history: readonly TvEvent[], storyKey: string): boolean {
  return history.some((event) => getBroadcastEditorialMetadata(event)?.storyKey === storyKey)
}

function ordinal(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  switch (value % 10) {
    case 1:
      return `${value}st`
    case 2:
      return `${value}nd`
    case 3:
      return `${value}rd`
    default:
      return `${value}th`
  }
}

function plural(value: number, singular: string, pluralForm = `${singular}s`): string {
  return value === 1 ? singular : pluralForm
}

function firstToThreshold(
  state: Pick<GameState, 'players'>,
  playerId: string,
  stat: 'lohWins' | 'posWins',
  threshold: number
): boolean {
  return state.players.every((player) => {
    if (player.id === playerId) return true
    return (player.stats?.[stat] ?? 0) < threshold
  })
}

function powerCandidate(
  state: Pick<GameState, 'players' | 'tvFeed'>,
  player: Player,
  stat: 'lohWins' | 'posWins'
): FauxTvEditorialCandidate | null {
  const count = player.stats?.[stat] ?? 0
  if (!POWER_MILESTONES.has(count)) return null

  const label = stat === 'lohWins' ? 'LOH' : 'Power of Safety'
  const keyPart = stat === 'lohWins' ? 'loh' : 'pos'
  const storyKey = `stats:${keyPart}:${player.id}:${count}`
  if (hasStory(state.tvFeed, storyKey)) return null

  const first = firstToThreshold(state, player.id, stat, count)
  const text = first
    ? `BY THE NUMBERS · ${player.name} is the first player this season to reach ${count} ${label} wins.`
    : `BY THE NUMBERS · ${player.name} has now won ${label} ${count} times this season.`

  return {
    text,
    storyKey,
    cooldownKey: `stats:power:${player.id}`,
    subjectIds: [player.id],
    category: BY_THE_NUMBERS_CATEGORY,
    significance: first ? 96 : 88 + count,
  }
}

function dualPowerCandidate(
  state: Pick<GameState, 'players' | 'tvFeed'>,
  player: Player
): FauxTvEditorialCandidate | null {
  if ((player.stats?.lohWins ?? 0) < 1 || (player.stats?.posWins ?? 0) < 1) return null
  const storyKey = `stats:dual-power:${player.id}`
  if (hasStory(state.tvFeed, storyKey)) return null

  const anyoneElseHasBoth = state.players.some(
    (candidate) =>
      candidate.id !== player.id &&
      (candidate.stats?.lohWins ?? 0) > 0 &&
      (candidate.stats?.posWins ?? 0) > 0
  )

  return {
    text: anyoneElseHasBoth
      ? `BY THE NUMBERS · ${player.name} has now won both LOH and the Power of Safety this season.`
      : `BY THE NUMBERS · ${player.name} is the first player this season to win both LOH and the Power of Safety.`,
    storyKey,
    cooldownKey: `stats:power:${player.id}`,
    subjectIds: [player.id],
    category: BY_THE_NUMBERS_CATEGORY,
    significance: anyoneElseHasBoth ? 92 : 99,
  }
}

function nominationCandidates(
  state: Pick<GameState, 'players' | 'tvFeed' | 'nomineeIds'>
): FauxTvEditorialCandidate[] {
  return state.nomineeIds.flatMap((playerId) => {
    const player = state.players.find((candidate) => candidate.id === playerId)
    if (!player) return []
    const count = player.stats?.timesNominated ?? 0
    if (!NOMINATION_MILESTONES.has(count)) return []
    const storyKey = `stats:nominated:${player.id}:${count}`
    if (hasStory(state.tvFeed, storyKey)) return []

    return [
      {
        text: `BY THE NUMBERS · ${player.name} is on the block for the ${ordinal(count)} time this season.`,
        storyKey,
        cooldownKey: `stats:nominations:${player.id}`,
        subjectIds: [player.id],
        category: BY_THE_NUMBERS_CATEGORY,
        significance: 82 + count,
      },
    ]
  })
}

function survivalCandidates(
  state: Pick<GameState, 'players' | 'tvFeed'>
): FauxTvEditorialCandidate[] {
  return state.players.flatMap((player) => {
    if (!isActivePlayer(player)) return []
    const count = player.stats?.timesNominated ?? 0
    if (!NOMINATION_MILESTONES.has(count)) return []
    const storyKey = `stats:block-survival:${player.id}:${count}`
    if (hasStory(state.tvFeed, storyKey)) return []

    return [
      {
        text: `BY THE NUMBERS · ${player.name} has survived the block ${count} times this season.`,
        storyKey,
        cooldownKey: `stats:nominations:${player.id}`,
        subjectIds: [player.id],
        category: BY_THE_NUMBERS_CATEGORY,
        significance: 86 + count,
      },
    ]
  })
}

function pickBest(candidates: FauxTvEditorialCandidate[]): FauxTvEditorialCandidate | null {
  return (
    candidates
      .slice()
      .sort(
        (a, b) =>
          b.significance - a.significance ||
          a.storyKey.localeCompare(b.storyKey, 'en', { sensitivity: 'base' })
      )[0] ?? null
  )
}

/**
 * Produces only public, factual season milestones. It intentionally reads no
 * relationship, intelligence, targeting, personality or other hidden AI state.
 */
export function buildByTheNumbersCandidate(
  state: Pick<GameState, 'phase' | 'players' | 'tvFeed' | 'lohId' | 'posWinnerId' | 'nomineeIds'>
): FauxTvEditorialCandidate | null {
  const candidates: FauxTvEditorialCandidate[] = []

  if (state.phase === 'loh_results' && state.lohId) {
    const winner = state.players.find((player) => player.id === state.lohId)
    if (winner) {
      const power = powerCandidate(state, winner, 'lohWins')
      const dual = dualPowerCandidate(state, winner)
      if (power) candidates.push(power)
      if (dual) candidates.push(dual)
    }
  }

  if (state.phase === 'pos_results' && state.posWinnerId) {
    const winner = state.players.find((player) => player.id === state.posWinnerId)
    if (winner) {
      const power = powerCandidate(state, winner, 'posWins')
      const dual = dualPowerCandidate(state, winner)
      if (power) candidates.push(power)
      if (dual) candidates.push(dual)
    }
  }

  if (state.phase === 'nomination_results') {
    candidates.push(...nominationCandidates(state))
  }

  if (state.phase === 'week_end') {
    candidates.push(...survivalCandidates(state))
  }

  return pickBest(candidates)
}

/**
 * Quiet-day fallback for the existing programming desk. It deliberately waits
 * until week_end so competitions, nominations, twists and Big Eye callbacks get
 * the first opportunity to occupy the day's editorial slot. This is a public
 * ledger, not a milestone: milestone copy remains reserved for the thresholds
 * above and always outranks this candidate.
 */
export function buildDailyNumbersCandidate(
  state: Pick<GameState, 'phase' | 'week' | 'players' | 'tvFeed'>
): FauxTvEditorialCandidate | null {
  if (state.phase !== 'week_end' || state.week < DAILY_NUMBERS_MIN_DAY) return null
  if (hasByTheNumbersStoryForWeek(state.tvFeed, state.week)) return null

  const active = state.players.filter(isActivePlayer)
  if (active.length === 0) return null

  const totals = state.players.reduce(
    (result, player) => ({
      lohWins: result.lohWins + (player.stats?.lohWins ?? 0),
      posWins: result.posWins + (player.stats?.posWins ?? 0),
      nominations: result.nominations + (player.stats?.timesNominated ?? 0),
    }),
    { lohWins: 0, posWins: 0, nominations: 0 }
  )

  const rankedActive = active
    .map((player) => ({
      player,
      score:
        (player.stats?.lohWins ?? 0) * 4 +
        (player.stats?.posWins ?? 0) * 3 +
        (player.stats?.timesNominated ?? 0) * 2,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.player.id.localeCompare(b.player.id, 'en'))

  const variant = state.week % 3
  let text: string
  let subjectIds: string[] = []

  if (variant === 0) {
    const totalPowerWins = totals.lohWins + totals.posWins
    text = `BY THE NUMBERS · Day ${state.week} closes with ${active.length} players still in the game and ${totalPowerWins} ${plural(totalPowerWins, 'power win')} on the season ledger.`
  } else if (variant === 1 || rankedActive.length === 0) {
    text = `BY THE NUMBERS · The season has now produced ${totals.nominations} ${plural(totals.nominations, 'nomination appearance')} across ${active.length} remaining players.`
  } else {
    const spotlightPool = rankedActive.slice(0, 3)
    const spotlight = spotlightPool[(state.week - DAILY_NUMBERS_MIN_DAY) % spotlightPool.length].player
    const lohWins = spotlight.stats?.lohWins ?? 0
    const posWins = spotlight.stats?.posWins ?? 0
    const nominations = spotlight.stats?.timesNominated ?? 0
    subjectIds = [spotlight.id]
    text = `BY THE NUMBERS · ${spotlight.name}'s public ledger: ${lohWins} ${plural(lohWins, 'LOH win')}, ${posWins} ${plural(posWins, 'Power of Safety win')}, and ${nominations} ${plural(nominations, 'trip', 'trips')} to the block as Day ${state.week} closes.`
  }

  return {
    text,
    storyKey: `stats:daily:${state.week}`,
    cooldownKey: `stats:daily:${state.week}`,
    subjectIds,
    category: BY_THE_NUMBERS_CATEGORY,
    significance: 28,
  }
}

export function hasByTheNumbersStoryForWeek(history: readonly TvEvent[], week: number): boolean {
  return history.some(
    (event) =>
      event.meta?.week === week &&
      getBroadcastEditorialMetadata(event)?.category === BY_THE_NUMBERS_CATEGORY
  )
}
