import type { VoteTally } from '../../components/AnimatedVoteResultsModal/AnimatedVoteResultsModal'
import type { Announcement } from '../../components/ui/TvAnnouncementOverlay/TvAnnouncementOverlay'
import type { Player } from '../../types'

type DemocraciaStanding = VoteTally & {
  votePercent: number
}

function roundPercent(value: number) {
  return Math.round(value)
}

export function buildDemocraciaVoteTallies(
  players: Player[],
  candidateIds: string[],
  votesByVoterId: Record<string, string>,
): DemocraciaStanding[] {
  const counts = Object.fromEntries(candidateIds.map((id) => [id, 0]))
  for (const targetId of Object.values(votesByVoterId)) {
    if (targetId in counts) counts[targetId] += 1
  }
  const totalVotes = Object.values(counts).reduce((sum, value) => sum + value, 0)

  return candidateIds
    .map((id, index) => {
      const nominee = players.find((player) => player.id === id)
      if (!nominee) return null
      const voteCount = counts[id] ?? 0
      return {
        nominee,
        voteCount,
        votePercent: totalVotes > 0 ? roundPercent((voteCount / totalVotes) * 100) : 0,
        index,
      }
    })
    .filter((entry): entry is DemocraciaStanding & { index: number } => entry !== null)
    .sort((a, b) => b.voteCount - a.voteCount || a.index - b.index)
    .map(({ index: _index, ...standing }) => standing)
}

export function getDemocraciaTopCandidateIds(tallies: VoteTally[]) {
  const maxVotes = tallies.reduce((max, tally) => Math.max(max, tally.voteCount), -1)
  return tallies
    .filter((tally) => tally.voteCount === maxVotes)
    .map((tally) => tally.nominee.id)
}

function formatStandingsLine(
  tallies: DemocraciaStanding[],
  targetIds: string[],
  joiner = ' and ',
) {
  return tallies
    .filter((tally) => targetIds.includes(tally.nominee.id))
    .map((tally) => `${tally.nominee.name} (${tally.votePercent}%)`)
    .join(joiner)
}

export function buildDemocraciaBallotageAnnouncement(options: {
  tallies: DemocraciaStanding[]
  tiedCandidateIds: string[]
}): Announcement {
  const standings = formatStandingsLine(options.tallies, options.tiedCandidateIds)
  return {
    key: 'democracia_ballotage',
    title: 'Ballotage!',
    subtitle: `${standings} are tied for the lead. All other houseguests must vote again in secret.`,
    isLive: true,
    autoDismissMs: 4500,
  }
}

export function buildDemocraciaWinnerAnnouncement(options: {
  tallies: DemocraciaStanding[]
  winnerId: string
  publicBreaker?: boolean
  decidedByChance?: boolean
}): Announcement | null {
  const winner = options.tallies.find((tally) => tally.nominee.id === options.winnerId)
  if (!winner) return null

  let subtitle = `${winner.nominee.name} is elected Leader of the House with ${winner.votePercent}% of the vote.`
  if (options.publicBreaker) {
    subtitle = `${winner.nominee.name} wins the public tie-break with ${winner.votePercent}% approval and is crowned Leader of the House.`
  } else if (options.decidedByChance) {
    subtitle = `${winner.nominee.name} wins the random draw after a deadlocked vote and is crowned Leader of the House.`
  }

  return {
    key: 'democracia_results',
    title: 'Democracia Result',
    subtitle,
    isLive: true,
    autoDismissMs: 4500,
  }
}

export function buildDemocraciaCoLohAnnouncement(options: {
  tallies: DemocraciaStanding[]
  tiedCandidateIds: string[]
}): Announcement {
  const standings = formatStandingsLine(options.tallies, options.tiedCandidateIds)
  return {
    key: 'democracia_co_loh',
    title: 'Historic Tie!',
    subtitle: `${standings} remain tied after the ballotage and will both reign as co-Leaders of the House.`,
    isLive: true,
    autoDismissMs: 5000,
  }
}

export function buildDemocraciaPublicBreakerAnnouncement(options: {
  tiedCandidates: Array<{
    nominee: Player
    approval: number
  }>
}): Announcement {
  return {
    key: 'democracia_public_breaker',
    title: 'Public Approval Tie-Break',
    subtitle: options.tiedCandidates
      .map((candidate) => `${candidate.nominee.name} ${candidate.approval}%`)
      .join(' • '),
    isLive: true,
    autoDismissMs: 4500,
  }
}
