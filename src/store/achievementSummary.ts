import type { Phase, Player } from '../types'
import type { PlayerSeasonSummary, SeasonArchive } from './seasonArchive'

export interface AchievementCardStat {
  label: string
  value: string
  icon: string
  tone: 'gold' | 'violet' | 'emerald' | 'rose'
  helper?: string
  wide?: boolean
}

export interface AchievementSection {
  title: string
  icon: string
  tone: 'violet' | 'emerald' | 'rose'
  stats: AchievementCardStat[]
}

export interface AchievementSummary {
  playerName: string
  totals: {
    seasonsPlayed: number
    seasonsWon: number
    publicFavoriteWins: number
    averageDaysSurvived: string
    totalCompWins: number
    timesNominated: number
    survivedNominations: number
    lohWins: number
    posWins: number
    battleBackWins: number
    finalHohWins: number
    juryAppearances: number
    doubleEvictionSurvivals: number
    tripleEvictionSurvivals: number
    rewardsFound: number
  }
  quickStats: Array<{ label: string; value: string; icon: string }>
  featuredStats: AchievementCardStat[]
  sections: AchievementSection[]
  highlightBadges: string[]
  hasHistory: boolean
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function findArchiveUserSummary(
  archive: Pick<SeasonArchive, 'playerSummaries'> | null | undefined,
  userPlayer: Pick<Player, 'id' | 'name'> | null | undefined
): PlayerSeasonSummary | null {
  if (!archive || !Array.isArray(archive.playerSummaries)) return null

  const normalizedUserName = userPlayer?.name?.trim().toLowerCase() ?? ''
  return (
    archive.playerSummaries.find((summary) => {
      if (!summary) return false
      if (userPlayer?.id && summary.playerId === userPlayer.id) return true
      if (summary.playerId === 'user') return true
      return (
        normalizedUserName.length > 0 &&
        summary.displayName?.trim().toLowerCase() === normalizedUserName
      )
    }) ?? null
  )
}

export function buildAchievementSummary(input: {
  userPlayer: Player | null
  seasonArchives: SeasonArchive[]
  day: number
  phase: Phase
}): AchievementSummary {
  const { userPlayer, seasonArchives, day, phase } = input
  const rewardIds = new Set<string>()
  let seasonsPlayed = 0
  let seasonsWon = 0
  let publicFavoriteWins = 0
  let lohWins = 0
  let posWins = 0
  let battleBackWins = 0
  let finalHohWins = 0
  let timesNominated = 0
  let survivedNominations = 0
  let juryAppearances = 0
  let doubleEvictionSurvivals = 0
  let tripleEvictionSurvivals = 0
  let averageDaysTotal = 0
  let averageDaysSamples = 0

  seasonArchives.forEach((archive) => {
    archive.rewardsEarned?.forEach((rewardId) => rewardIds.add(rewardId))

    const summary = findArchiveUserSummary(archive, userPlayer)
    if (!summary) return

    seasonsPlayed += 1
    if (summary.finalPlacement === 1) seasonsWon += 1
    if (summary.wonPublicFavorite) publicFavoriteWins += 1
    lohWins += toNumber(summary.lohWins)
    posWins += toNumber(summary.posWins)
    battleBackWins += toNumber(summary.battleBackWins)
    finalHohWins += summary.wonFinalHoh ? 1 : 0
    timesNominated += toNumber(summary.timesNominated)
    survivedNominations += Math.max(
      toNumber(summary.timesNominated) - (summary.isEvicted ? 1 : 0),
      0
    )
    if (summary.madeJury) juryAppearances += 1
    if (summary.survivedDoubleEviction) doubleEvictionSurvivals += 1
    if (summary.survivedTripleEviction) tripleEvictionSurvivals += 1

    const archivedDaysAlive = toNumber(summary.daysAlive ?? summary.weeksAlive)
    if (archivedDaysAlive > 0) {
      averageDaysTotal += archivedDaysAlive
      averageDaysSamples += 1
    }
  })

  const liveStats = userPlayer?.stats ?? null
  const currentSeasonActive = !!userPlayer && (day > 1 || phase !== 'week_start')
  if (currentSeasonActive) {
    seasonsPlayed += 1
    lohWins += toNumber(liveStats?.lohWins)
    posWins += toNumber(liveStats?.posWins)
    battleBackWins += toNumber(liveStats?.battleBackWins)
    finalHohWins += liveStats?.wonFinalHoh ? 1 : 0
    timesNominated += toNumber(liveStats?.timesNominated)
    survivedNominations += Math.max(
      toNumber(liveStats?.timesNominated) -
        (userPlayer.status === 'evicted' || userPlayer.status === 'jury' ? 1 : 0),
      0
    )
    if (day > 0) {
      averageDaysTotal += day
      averageDaysSamples += 1
    }
  }

  const totalCompWins = lohWins + posWins + battleBackWins
  const averageDaysSurvived =
    averageDaysSamples > 0
      ? `${Math.round((averageDaysTotal / averageDaysSamples) * 10) / 10} days`
      : '—'
  const highlightBadges: string[] = []

  if (seasonsWon > 0) highlightBadges.push(`🏆 Season champ ×${seasonsWon}`)
  if (publicFavoriteWins > 0) highlightBadges.push(`🌟 Public favorite ×${publicFavoriteWins}`)
  if (totalCompWins >= 5) highlightBadges.push(`💪 Comp beast ×${totalCompWins}`)
  if (survivedNominations >= 3) highlightBadges.push(`🛡️ Block survival ×${survivedNominations}`)
  if (rewardIds.size > 0) highlightBadges.push(`🥚 Reward hunter ×${rewardIds.size}`)
  if (doubleEvictionSurvivals > 0 || tripleEvictionSurvivals > 0) {
    highlightBadges.push(
      `⚡ Eviction escape artist ×${doubleEvictionSurvivals + tripleEvictionSurvivals}`
    )
  }

  const rewardsFound = rewardIds.size
  const seasonsPlayedLabel = `${seasonsPlayed} season${seasonsPlayed === 1 ? '' : 's'} entered`
  const competitiveBreakdown = [`${lohWins} LOH`, `${posWins} POS`]
  if (battleBackWins > 0) competitiveBreakdown.push(`${battleBackWins} BB`)

  return {
    playerName: userPlayer?.name || 'You',
    totals: {
      seasonsPlayed,
      seasonsWon,
      publicFavoriteWins,
      averageDaysSurvived,
      totalCompWins,
      timesNominated,
      survivedNominations,
      lohWins,
      posWins,
      battleBackWins,
      finalHohWins,
      juryAppearances,
      doubleEvictionSurvivals,
      tripleEvictionSurvivals,
      rewardsFound,
    },
    quickStats: [
      { label: 'Seasons', value: String(seasonsPlayed), icon: '📚' },
      { label: 'Wins', value: String(seasonsWon), icon: '🏆' },
      { label: 'Rewards', value: String(rewardsFound), icon: '🥚' },
    ],
    featuredStats: [
      {
        label: 'Season wins',
        value: String(seasonsWon),
        helper: seasonsPlayed > 0 ? seasonsPlayedLabel : 'Start your first season',
        icon: '🏆',
        tone: 'gold',
        wide: true,
      },
      {
        label: 'Comp wins',
        value: String(totalCompWins),
        helper: competitiveBreakdown.join(' · '),
        icon: '⚔️',
        tone: 'violet',
      },
      {
        label: 'Avg survive',
        value: averageDaysSurvived,
        helper:
          survivedNominations > 0
            ? `${survivedNominations} block escape${survivedNominations === 1 ? '' : 's'}`
            : 'Build your survival streak',
        icon: '🛡️',
        tone: 'emerald',
      },
    ],
    sections: [
      {
        title: 'Competitive / Wins',
        icon: '⚔️',
        tone: 'violet',
        stats: [
          { label: 'LOH wins', value: String(lohWins), icon: '👑', tone: 'violet' },
          { label: 'POS wins', value: String(posWins), icon: '🔑', tone: 'violet' },
          { label: 'Returns won', value: String(battleBackWins), icon: '🔄', tone: 'violet' },
          { label: 'Final LOHs', value: String(finalHohWins), icon: '🎯', tone: 'violet' },
        ],
      },
      {
        title: 'Recognition / Social',
        icon: '🌟',
        tone: 'rose',
        stats: [
          { label: 'Fan favorite', value: String(publicFavoriteWins), icon: '🌟', tone: 'rose' },
          { label: 'Tribunal runs', value: String(juryAppearances), icon: '⚖️', tone: 'rose' },
          { label: 'Rewards found', value: String(rewardsFound), icon: '🥚', tone: 'rose' },
        ],
      },
      {
        title: 'Surveyeval / Endurance',
        icon: '🛡️',
        tone: 'emerald',
        stats: [
          { label: 'Seasons played', value: String(seasonsPlayed), icon: '📅', tone: 'emerald' },
          { label: 'Nominations', value: String(timesNominated), icon: '🎯', tone: 'emerald' },
          {
            label: 'Block escapes',
            value: String(survivedNominations),
            icon: '🚪',
            tone: 'emerald',
          },
          {
            label: 'Double survives',
            value: String(doubleEvictionSurvivals),
            icon: '⚡',
            tone: 'emerald',
          },
          {
            label: 'Triple survives',
            value: String(tripleEvictionSurvivals),
            icon: '🔥',
            tone: 'emerald',
          },
        ],
      },
    ],
    highlightBadges,
    hasHistory: seasonsPlayed > 0 || totalCompWins > 0 || rewardsFound > 0,
  }
}
