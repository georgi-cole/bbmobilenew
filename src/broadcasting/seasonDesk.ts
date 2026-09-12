import type { GameState, Player, TvEvent } from '../types'
import { getBroadcastEditorialMetadata } from './broadcastEditorialPolicy'

export const BY_THE_NUMBERS_CATEGORY = 'by_the_numbers'

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
  state: Pick<
    GameState,
    'phase' | 'players' | 'tvFeed' | 'lohId' | 'posWinnerId' | 'nomineeIds'
  >
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

export function hasByTheNumbersStoryForWeek(history: readonly TvEvent[], week: number): boolean {
  return history.some(
    (event) =>
      event.meta?.week === week &&
      getBroadcastEditorialMetadata(event)?.category === BY_THE_NUMBERS_CATEGORY
  )
}
