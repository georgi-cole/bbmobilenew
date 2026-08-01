import type { GameState, VoxPopuliState } from '../../types'
import type { SeasonArchive } from '../../store/seasonArchive'
import type { PlayerPublicProfile } from '../../publicOpinion/types'
import { mulberry32 } from '../../store/rng'

export const VOX_POPULI_DEFAULT_SEASON = 4
export const VOX_POPULI_RETRY_CHANCE = 0.1
const VOX_POPULI_SCHEDULE_SALT = 0x56_4f_58_50
const VOX_POPULI_VOTE_SALT = 0x50_55_42_4c
const VOX_POPULI_PREVIEW_SALT = 0x50_52_45_56

type VoxGame = Pick<GameState, 'voxPopuli'>

export function createInitialVoxPopuliState(scheduledSeason: number | null): VoxPopuliState {
  return {
    scheduledSeason,
    status: scheduledSeason == null ? 'inactive' : 'scheduled',
    activatedSeason: null,
    activatedWeek: null,
    nominationBallots: {},
    nominationVoteCounts: {},
    nominationDaysByPlayerId: {},
    safetySaveCounts: {},
    lastReplacementNomineeIds: [],
    immunityWinnerId: null,
    autoNomineeId: null,
    awaitingPublicVote: false,
    publicVoteContext: null,
    publicVotePercentages: null,
    audiencePreviewWeek: null,
    audiencePreviewNomineeIds: [],
    audiencePreviewPercentages: null,
    finaleStage: null,
    finalistIds: [],
    winnerId: null,
    finalThreePacingSeen: [],
  }
}

export function isVoxPopuliActive(game: VoxGame): boolean {
  return game.voxPopuli?.status === 'active'
}

export function isVoxPopuliTwistLocked(game: VoxGame): boolean {
  return game.voxPopuli?.status === 'scheduled' || game.voxPopuli?.status === 'active'
}

export function shouldScheduleVoxPopuliSeason(options: {
  season: number
  seasonArchives: readonly SeasonArchive[]
  seed: number
  seasonOverride?: number | null
  cupidScheduled?: boolean
}): boolean {
  const { season, seasonArchives, seed, seasonOverride = null, cupidScheduled = false } = options
  if (cupidScheduled) return false
  if (seasonOverride != null) return seasonOverride === season
  if (season === VOX_POPULI_DEFAULT_SEASON) return true
  if (season < VOX_POPULI_DEFAULT_SEASON + 2) return false

  const previousSeason = seasonArchives.find((archive) => archive.seasonIndex === season - 1)
  if (previousSeason?.voxPopuliActivated === true) return false

  const scheduleRng = mulberry32(
    (seed ^ Math.imul(season, 0x9e3779b1) ^ VOX_POPULI_SCHEDULE_SALT) >>> 0
  )
  return scheduleRng() < VOX_POPULI_RETRY_CHANCE
}

export interface VoxNominationResolution {
  nomineeIds: string[]
  voteCounts: Record<string, number>
  cutoffVotes: number
}

/**
 * Adds the automatic last-place nominee, then fills the block from secret
 * housemate ballots. Everyone tied on the final qualifying total is nominated.
 */
export function resolveVoxNominations(options: {
  activeIds: string[]
  immunityWinnerId: string | null
  autoNomineeId: string | null
  ballots: Record<string, string[]>
  ballotNomineeCount: number
  seed: number
}): VoxNominationResolution {
  const { activeIds, immunityWinnerId, autoNomineeId, ballots, ballotNomineeCount, seed } = options
  const activeSet = new Set(activeIds)
  const voteCounts: Record<string, number> = Object.fromEntries(activeIds.map((id) => [id, 0]))

  Object.entries(ballots).forEach(([voterId, targets]) => {
    if (!activeSet.has(voterId)) return
    new Set(targets).forEach((targetId) => {
      if (
        targetId !== voterId &&
        targetId !== immunityWinnerId &&
        targetId !== autoNomineeId &&
        activeSet.has(targetId)
      ) {
        voteCounts[targetId] = (voteCounts[targetId] ?? 0) + 1
      }
    })
  })

  const nominees =
    autoNomineeId && activeSet.has(autoNomineeId) && autoNomineeId !== immunityWinnerId
      ? [autoNomineeId]
      : []
  const nomineeSet = new Set(nominees)
  // The last-place nominee is additive: it never consumes one of the ballot's
  // two qualifying places.
  const remainingSlots = Math.max(0, ballotNomineeCount)
  const tieRng = mulberry32((seed ^ 0x4e_4f_4d_53) >>> 0)
  const tieRanks = Object.fromEntries(activeIds.map((id) => [id, tieRng()]))
  const ranked = activeIds
    .filter((id) => id !== immunityWinnerId && !nomineeSet.has(id))
    .sort((left, right) => {
      const voteDiff = (voteCounts[right] ?? 0) - (voteCounts[left] ?? 0)
      if (voteDiff !== 0) return voteDiff
      return (tieRanks[right] ?? 0) - (tieRanks[left] ?? 0)
    })

  if (remainingSlots === 0 || ranked.length === 0) {
    return { nomineeIds: nominees, voteCounts, cutoffVotes: 0 }
  }

  const cutoffIndex = Math.min(remainingSlots, ranked.length) - 1
  const cutoffVotes = voteCounts[ranked[cutoffIndex]] ?? 0
  ranked
    .filter((id) => (voteCounts[id] ?? 0) >= cutoffVotes)
    .forEach((id) => {
      nomineeSet.add(id)
      nominees.push(id)
    })

  return { nomineeIds: nominees, voteCounts, cutoffVotes }
}

/**
 * Finds the highest-ranked eligible backup nominees from the original secret
 * ballot. A replacement is only requested until the live block returns to two.
 */
export function resolveVoxReplacementNominees(options: {
  activeIds: string[]
  currentNomineeIds: string[]
  protectedIds: string[]
  immunityWinnerId: string | null
  nominationVoteCounts: Record<string, number>
  requiredNomineeCount?: number
  seed: number
}): string[] {
  const {
    activeIds,
    currentNomineeIds,
    protectedIds,
    immunityWinnerId,
    nominationVoteCounts,
    requiredNomineeCount = 2,
  } = options
  const required = Math.max(0, requiredNomineeCount - currentNomineeIds.length)
  if (required === 0) return []

  const blocked = new Set([...currentNomineeIds, ...protectedIds])
  if (immunityWinnerId) blocked.add(immunityWinnerId)
  const ranked = activeIds
    .filter((id) => !blocked.has(id))
    .sort((left, right) => {
      const voteDiff = (nominationVoteCounts[right] ?? 0) - (nominationVoteCounts[left] ?? 0)
      if (voteDiff !== 0) return voteDiff
      return left.localeCompare(right)
    })
  if (ranked.length === 0) return []

  // As with the original nomination cutoff, everyone tied at the qualifying
  // backup rank joins the block. This may restore the block above its minimum.
  const cutoffIndex = Math.min(required, ranked.length) - 1
  const cutoffVotes = nominationVoteCounts[ranked[cutoffIndex]] ?? 0
  return ranked.filter((id) => (nominationVoteCounts[id] ?? 0) >= cutoffVotes)
}

export interface VoxAudienceVoteResult {
  percentages: Record<string, number>
  rankedIds: string[]
}

function roundedPercentages(entries: Array<{ id: string; weight: number }>): Record<string, number> {
  const total = entries.reduce((sum, entry) => sum + Math.max(0.001, entry.weight), 0)
  const percentages: Record<string, number> = {}
  let assigned = 0
  entries.forEach((entry, index) => {
    const share =
      index === entries.length - 1
        ? Math.max(0, Number((100 - assigned).toFixed(1)))
        : Number(((Math.max(0.001, entry.weight) / total) * 100).toFixed(1))
    percentages[entry.id] = share
    assigned = Number((assigned + share).toFixed(1))
  })
  return percentages
}

/**
 * Builds an earlier audience snapshot from the same opinion record as the
 * eventual result. A decisive lead cannot unrealistically reverse, while a
 * close final result may have looked much more volatile earlier in the night.
 */
export function resolveVoxAudiencePreview(options: {
  finalPercentages: Record<string, number>
  nomineeIds: string[]
  seed: number
  week: number
}): Record<string, number> {
  const { finalPercentages, nomineeIds, seed, week } = options
  if (nomineeIds.length === 0) return {}
  const rng = mulberry32(
    (seed ^ Math.imul(week, 0x85ebca6b) ^ VOX_POPULI_PREVIEW_SALT) >>> 0
  )

  if (nomineeIds.length === 2) {
    const [leftId, rightId] = nomineeIds
    const leaderId =
      (finalPercentages[leftId] ?? 0) >= (finalPercentages[rightId] ?? 0) ? leftId : rightId
    const otherId = leaderId === leftId ? rightId : leftId
    const finalLeaderShare = finalPercentages[leaderId] ?? 50
    const decisiveFinal = Math.abs(finalLeaderShare - 50) > 5
    const minimumLeaderShare = decisiveFinal ? 50.5 : 20
    const maximumLeaderShare = decisiveFinal ? 92 : 80
    const previewLeaderShare = Number(
      Math.min(
        maximumLeaderShare,
        Math.max(minimumLeaderShare, finalLeaderShare + (rng() - 0.5) * 58)
      ).toFixed(1)
    )
    return {
      [leaderId]: previewLeaderShare,
      [otherId]: Number((100 - previewLeaderShare).toFixed(1)),
    }
  }

  return roundedPercentages(
    nomineeIds.map((id) => ({
      id,
      weight: Math.max(0.1, finalPercentages[id] ?? 0) * (0.72 + rng() * 0.56),
    }))
  )
}

/**
 * Keeps a later official count narratively compatible with a paid snapshot.
 * Close races may flip; a clear snapshot can collapse toward a tie, but cannot
 * turn into an implausible landslide in the opposite direction.
 */
export function reconcileVoxAudienceResultWithPreview(options: {
  finalPercentages: Record<string, number>
  previewPercentages: Record<string, number> | null | undefined
  nomineeIds: string[]
}): VoxAudienceVoteResult {
  const { finalPercentages, previewPercentages, nomineeIds } = options
  if (!previewPercentages || nomineeIds.length < 2) {
    const rankedIds = [...nomineeIds].sort(
      (left, right) => (finalPercentages[right] ?? 0) - (finalPercentages[left] ?? 0)
    )
    return { percentages: { ...finalPercentages }, rankedIds }
  }

  let percentages = { ...finalPercentages }
  if (nomineeIds.length === 2) {
    const [leftId, rightId] = nomineeIds
    const previewLeaderId =
      (previewPercentages[leftId] ?? 0) >= (previewPercentages[rightId] ?? 0)
        ? leftId
        : rightId
    const otherId = previewLeaderId === leftId ? rightId : leftId
    const previewLead = Math.abs(
      (previewPercentages[previewLeaderId] ?? 50) - (previewPercentages[otherId] ?? 50)
    )
    const finalLeaderShare = finalPercentages[previewLeaderId] ?? 50
    const minimumCompatibleShare = previewLead >= 35 ? 48 : previewLead >= 18 ? 45 : 0
    if (finalLeaderShare < minimumCompatibleShare) {
      percentages = {
        [previewLeaderId]: minimumCompatibleShare,
        [otherId]: 100 - minimumCompatibleShare,
      }
    }
  } else {
    const blended = nomineeIds.map((id) => ({
      id,
      weight: (finalPercentages[id] ?? 0) * 0.78 + (previewPercentages[id] ?? 0) * 0.22,
    }))
    percentages = roundedPercentages(blended)
  }

  const rankedIds = [...nomineeIds].sort((left, right) => {
    const difference = (percentages[right] ?? 0) - (percentages[left] ?? 0)
    return difference !== 0 ? difference : nomineeIds.indexOf(left) - nomineeIds.indexOf(right)
  })
  return { percentages, rankedIds }
}

/**
 * Produces an audience vote to eliminate. As the season builds a longer public
 * record, genuine differences in approval carry more weight. Closely matched
 * nominees can still remain genuinely close even late in the game.
 */
export function resolveVoxAudienceEviction(options: {
  nomineeIds: string[]
  profiles: Record<string, PlayerPublicProfile>
  seed: number
  week: number
}): VoxAudienceVoteResult {
  const { nomineeIds, profiles, seed, week } = options
  if (nomineeIds.length === 0) return { percentages: {}, rankedIds: [] }

  const rng = mulberry32((seed ^ Math.imul(week, 0x9e3779b1) ^ VOX_POPULI_VOTE_SALT) >>> 0)
  const audienceRecords = nomineeIds.map((id) => {
    const profile = profiles[id]
    const approval = profile?.approval ?? 50
    const previousApproval = profile?.previousApproval ?? approval
    const downwardMomentum = Math.max(0, previousApproval - approval)
    const seasonApprovals = profile?.seasonApprovals ?? [approval]
    const seasonAverage =
      seasonApprovals.reduce((sum, value) => sum + value, 0) /
      Math.max(1, seasonApprovals.length)
    // The meter is a broad approval read, not a literal live ballot. Episode
    // edits, concentrated fan campaigns and last-minute reactions add a
    // bounded broadcast-night swing while keeping large sentiment gaps safe.
    const broadcastNightSwing =
      (rng() - 0.5) * (14 + Math.min(6, Math.max(0, week - 2) * 0.55))
    return {
      id,
      evidenceDays: Math.max(week, seasonApprovals.length),
      sentiment:
        (100 - approval) * 0.65 +
        (100 - seasonAverage) * 0.35 +
        downwardMomentum * 0.9 +
        broadcastNightSwing,
    }
  })
  const evidenceDepth = Math.max(...audienceRecords.map((entry) => entry.evidenceDays), 1)
  const temperature = Math.max(12, 29 - evidenceDepth * 1.7)
  const strongestSentiment = Math.max(...audienceRecords.map((entry) => entry.sentiment))
  const weights = audienceRecords.map((entry) => ({
    id: entry.id,
    weight: Math.exp((entry.sentiment - strongestSentiment) / temperature),
  }))
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0)
  const percentages: Record<string, number> = {}
  let assigned = 0
  weights.forEach((entry, index) => {
    const share =
      index === weights.length - 1
        ? Math.max(0, Number((100 - assigned).toFixed(1)))
        : Number(((entry.weight / total) * 100).toFixed(1))
    percentages[entry.id] = share
    assigned = Number((assigned + share).toFixed(1))
  })
  const rankedIds = [...nomineeIds].sort((left, right) => {
    const diff = (percentages[right] ?? 0) - (percentages[left] ?? 0)
    if (diff !== 0) return diff
    return nomineeIds.indexOf(left) - nomineeIds.indexOf(right)
  })
  return { percentages, rankedIds }
}
