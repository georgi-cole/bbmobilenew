import type { PublicOpinionState } from '../../publicOpinion/types'
import type { Player } from '../../types'

export interface SeasonRecapHighlight {
  id: string
  eyebrow: string
  title: string
  caption: string
  stamp: string
  player: Player
  importance: number
}

function totalCompetitionWins(player: Player): number {
  return (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)
}

function nominationCount(player: Player): number {
  return player.stats?.timesNominated ?? 0
}

function conciseStamp(delta: number): string {
  if (delta > 0) return `+${Math.round(delta)} approval`
  if (delta < 0) return `${Math.round(delta)} approval`
  return 'Audience headline'
}

function buildPublicOpinionHighlights(
  playersById: Map<string, Player>,
  publicOpinion?: PublicOpinionState | null
): SeasonRecapHighlight[] {
  return (publicOpinion?.feed ?? [])
    .filter(
      (item) => item.isHeadline && typeof item.text === 'string' && item.text.trim().length > 0
    )
    .map((item): SeasonRecapHighlight | null => {
      const player = playersById.get(item.playerId)
      if (!player) return null
      const delta = typeof item.delta === 'number' && Number.isFinite(item.delta) ? item.delta : 0
      return {
        id: `public-${item.id}`,
        eyebrow: `Week ${Math.max(1, Math.round(item.week))} · Public reaction`,
        title: player.name,
        caption: item.text.trim(),
        stamp: conciseStamp(delta),
        player,
        importance: Math.abs(delta) * 100 + (item.timestamp ?? 0) / 1_000_000_000_000,
      }
    })
    .filter((item): item is SeasonRecapHighlight => item !== null)
}

function buildStatHighlights(players: Player[]): SeasonRecapHighlight[] {
  return players.flatMap((player) => {
    const wins = totalCompetitionWins(player)
    const nominations = nominationCount(player)
    const highlights: SeasonRecapHighlight[] = []

    if (wins > 0) {
      highlights.push({
        id: `wins-${player.id}`,
        eyebrow: 'Competition record',
        title: player.name,
        caption: `${player.name} recorded ${wins} competition ${wins === 1 ? 'win' : 'wins'} during the season.`,
        stamp: `${wins} ${wins === 1 ? 'win' : 'wins'}`,
        player,
        importance: wins * 100 + 20,
      })
    }

    if (nominations > 0) {
      highlights.push({
        id: `nominations-${player.id}`,
        eyebrow: 'Season record',
        title: player.name,
        caption: `${player.name} faced nomination ${nominations} ${nominations === 1 ? 'time' : 'times'} before the final decision.`,
        stamp: `${nominations} ${nominations === 1 ? 'nomination' : 'nominations'}`,
        player,
        importance: nominations * 45,
      })
    }

    return highlights
  })
}

/**
 * Builds truthful recap chapters from events already recorded by the season.
 * Public headlines are preferred; statistical records fill only missing slots.
 * No synthetic incident or pre-authored story is introduced here.
 */
export function buildSeasonRecapHighlights(
  players: Player[],
  publicOpinion?: PublicOpinionState | null,
  limit = 3
): SeasonRecapHighlight[] {
  if (limit <= 0 || players.length === 0) return []

  const playersById = new Map(players.map((player) => [player.id, player]))
  const candidates = [
    ...buildPublicOpinionHighlights(playersById, publicOpinion),
    ...buildStatHighlights(players),
  ].sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))

  const selected: SeasonRecapHighlight[] = []
  const usedIds = new Set<string>()
  const usedCaptions = new Set<string>()

  for (const candidate of candidates) {
    if (selected.length >= limit) break
    if (usedIds.has(candidate.id) || usedCaptions.has(candidate.caption)) continue
    usedIds.add(candidate.id)
    usedCaptions.add(candidate.caption)
    selected.push(candidate)
  }

  return selected
}
