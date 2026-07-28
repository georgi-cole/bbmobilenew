import { describe, expect, it } from 'vitest'
import { createInitialDramaSocialNetwork } from '../dramaModeEngine'
import { getSocialCredibility } from '../socialCommitments'
import { buildSocialStoryStream } from '../socialStoryStream'
import { getRelationshipContinuityDelta } from '../weekSocialSeed'
import type { SocialActionLogEntry, SocialCommitment } from '../types'

function commitment(status: SocialCommitment['status']): SocialCommitment {
  return {
    id: `promise-${status}`,
    interactionId: `interaction-${status}`,
    kind: 'vote_to_keep',
    promisorId: 'human',
    beneficiaryId: 'lia',
    createdWeek: 2,
    dueWeek: 2,
    status,
  }
}

function action(
  timestamp: number,
  overrides: Partial<SocialActionLogEntry> = {}
): SocialActionLogEntry {
  return {
    actionId: 'compliment',
    actorId: 'lia',
    targetId: 'kai',
    cost: 1,
    delta: 5,
    outcome: 'success',
    newEnergy: 4,
    timestamp,
    week: 2,
    source: 'system',
    ...overrides,
  }
}

describe('Social liveliness restoration', () => {
  it('smooths promise reliability so one result never produces 0% or 100%', () => {
    expect(getSocialCredibility([])).toMatchObject({
      score: 50,
      label: 'Unproven',
      kept: 0,
      broken: 0,
    })
    expect(getSocialCredibility([commitment('broken')])).toMatchObject({
      score: 40,
      label: 'Early read',
      kept: 0,
      broken: 1,
    })
    expect(getSocialCredibility([commitment('kept')])).toMatchObject({
      score: 60,
      label: 'Early read',
      kept: 1,
      broken: 0,
    })
  })

  it('lets remembered treatment settle relationships without unexplained random drift', () => {
    expect(getRelationshipContinuityDelta()).toBe(0)
    expect(
      getRelationshipContinuityDelta({
        gratitude: 8,
        resentment: 0,
        neglect: 0,
        trustMomentum: 4,
        recentEvents: [],
      })
    ).toBeGreaterThan(0)
    expect(
      getRelationshipContinuityDelta({
        gratitude: 0,
        resentment: 7,
        neglect: 5,
        trustMomentum: -4,
        recentEvents: [],
      })
    ).toBeLessThan(0)
  })

  it('compresses one socially active NPC into one engaging house story', () => {
    const stream = buildSocialStoryStream({
      network: createInitialDramaSocialNetwork(),
      actionHistory: [
        action(100, { targetId: 'kai' }),
        action(200, { targetId: 'rae' }),
        action(300, { targetId: 'sol' }),
      ],
      relationships: {
        lia: {
          kai: { affinity: 8, tags: [] },
          rae: { affinity: 8, tags: [] },
          sol: { affinity: 8, tags: [] },
        },
      },
      weekStartRelSnapshot: { lia: { kai: 0, rae: 0, sol: 0 } },
      players: [
        { id: 'human', name: 'You' },
        { id: 'lia', name: 'Lia' },
        { id: 'kai', name: 'Kai' },
        { id: 'rae', name: 'Rae' },
        { id: 'sol', name: 'Sol' },
      ],
      humanId: 'human',
      currentWeek: 2,
    })

    expect(stream).toHaveLength(1)
    expect(stream[0]).toMatchObject({ kind: 'bond' })
    expect(stream[0].title).toMatch(/working the room/i)
    expect(stream[0].text).toMatch(/Kai, Rae, Sol/i)
  })

  it('does not expose an isolated private NPC exchange as omniscient narration', () => {
    const stream = buildSocialStoryStream({
      network: createInitialDramaSocialNetwork(),
      actionHistory: [action(100)],
      relationships: {
        lia: { kai: { affinity: 1, tags: [] } },
        kai: { lia: { affinity: 1, tags: [] } },
      },
      weekStartRelSnapshot: {
        lia: { kai: 0 },
        kai: { lia: 0 },
      },
      players: [
        { id: 'human', name: 'You' },
        { id: 'lia', name: 'Lia' },
        { id: 'kai', name: 'Kai' },
      ],
      humanId: 'human',
      currentWeek: 2,
    })

    expect(stream).toHaveLength(0)
  })
})
