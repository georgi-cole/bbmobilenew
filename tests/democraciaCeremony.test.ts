import { describe, expect, it } from 'vitest'
import type { Player } from '../src/types'
import {
  buildDemocraciaBallotageAnnouncement,
  buildDemocraciaCoLohAnnouncement,
  buildDemocraciaPublicBreakerAnnouncement,
  buildDemocraciaVoteTallies,
  buildDemocraciaWinnerAnnouncement,
} from '../src/screens/GameScreen/democraciaCeremony'

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'active',
  }
}

describe('democracia ceremony helpers', () => {
  it('builds sorted tallies with rounded vote percentages', () => {
    const tallies = buildDemocraciaVoteTallies(
      [makePlayer('p1', 'Blue'), makePlayer('p2', 'Kian'), makePlayer('p3', 'Georgi')],
      ['p1', 'p2', 'p3'],
      { a: 'p1', b: 'p1', c: 'p2' },
    )

    expect(tallies.map((tally) => `${tally.nominee.name}:${tally.voteCount}:${tally.votePercent}`)).toEqual([
      'Blue:2:67',
      'Kian:1:33',
      'Georgi:0:0',
    ])
  })

  it('builds a ballotage announcement with tied percentages', () => {
    const tallies = buildDemocraciaVoteTallies(
      [makePlayer('p1', 'Blue'), makePlayer('p2', 'Kian')],
      ['p1', 'p2'],
      { a: 'p1', b: 'p2' },
    )

    expect(buildDemocraciaBallotageAnnouncement({
      tallies,
      tiedCandidateIds: ['p1', 'p2'],
    }).subtitle).toContain('Blue (50%) and Kian (50%) are tied for the lead')
  })

  it('builds winner, public-breaker, and co-leader announcements', () => {
    const tallies = buildDemocraciaVoteTallies(
      [makePlayer('p1', 'Blue'), makePlayer('p2', 'Kian')],
      ['p1', 'p2'],
      { a: 'p1', b: 'p1', c: 'p2' },
    )

    expect(buildDemocraciaWinnerAnnouncement({
      tallies,
      winnerId: 'p1',
    })?.subtitle).toContain('Blue is elected Leader of the House with 67% of the vote')

    expect(buildDemocraciaCoLohAnnouncement({
      tallies,
      tiedCandidateIds: ['p1', 'p2'],
    }).subtitle).toContain('will both reign as co-Leaders of the House')

    expect(buildDemocraciaPublicBreakerAnnouncement({
      tiedCandidates: [
        { nominee: makePlayer('p1', 'Blue'), approval: 61 },
        { nominee: makePlayer('p2', 'Kian'), approval: 58 },
      ],
    }).subtitle).toBe('Blue 61% • Kian 58%')
  })
})
