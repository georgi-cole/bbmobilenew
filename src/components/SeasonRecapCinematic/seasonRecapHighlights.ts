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
  storyType: 'audience-love' | 'audience-shock' | 'competition' | 'survival'
}

function totalCompetitionWins(player: Player): number {
  return (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)
}

function nominationCount(player: Player): number {
  return player.stats?.timesNominated ?? 0
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
      const positive = delta >= 0

      return {
        id: `public-${item.id}`,
        eyebrow: positive ? 'The audience leaned in' : 'The mood in the house shifted',
        title: positive
          ? `${player.name} became part of the season.`
          : `${player.name} changed the conversation.`,
        caption: item.text.trim(),
        stamp: positive ? 'A crowd-favorite moment' : 'A moment nobody ignored',
        player,
        storyType: positive ? 'audience-love' : 'audience-shock',
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
        eyebrow: 'When the pressure rose',
        title: `${player.name} kept finding another gear.`,
        caption: 'Again and again, the biggest moments seemed to bring out their best game.',
        stamp: 'The competitor story',
        player,
        storyType: 'competition',
        importance: wins * 100 + 20,
      })
    }

    if (nominations > 0) {
      highlights.push({
        id: `nominations-${player.id}`,
        eyebrow: 'The block never finished the story',
        title: `${player.name} refused to disappear.`,
        caption:
          'Every time the season pushed them toward the door, they found a reason to stay in the story.',
        stamp: 'The survival story',
        player,
        storyType: 'survival',
        importance: nominations * 45,
      })
    }

    return highlights
  })
}

/**
 * Selects a small editorial montage from recorded season material. Raw deltas,
 * vote values, and stat counts are intentionally kept out of viewer-facing copy.
 */
export function buildSeasonRecapHighlights(
  players: Player[],
  publicOpinion?: PublicOpinionState | null,
  limit = 2
): SeasonRecapHighlight[] {
  if (limit <= 0 || players.length === 0) return []

  const playersById = new Map(players.map((player) => [player.id, player]))
  const candidates = [
    ...buildPublicOpinionHighlights(playersById, publicOpinion),
    ...buildStatHighlights(players),
  ].sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))

  const selected: SeasonRecapHighlight[] = []
  const usedPlayerIds = new Set<string>()
  const usedStoryTypes = new Set<SeasonRecapHighlight['storyType']>()

  for (const candidate of candidates) {
    if (selected.length >= limit) break
    if (usedPlayerIds.has(candidate.player.id) || usedStoryTypes.has(candidate.storyType)) continue
    usedPlayerIds.add(candidate.player.id)
    usedStoryTypes.add(candidate.storyType)
    selected.push(candidate)
  }

  return selected
}
