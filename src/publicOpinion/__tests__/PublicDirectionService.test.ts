import { describe, expect, it } from 'vitest'
import type { Player } from '../../types'
import { generateDirectionsForCycle } from '../PublicDirectionService'

function player(id: string, isUser = false): Player {
  return { id, name: id, avatar: '🙂', status: 'active', isUser }
}

describe('generateDirectionsForCycle', () => {
  it('never asks a player to break an alliance that does not exist', () => {
    const players = [player('test', true), player('nova'), player('blue')]
    const directions = Array.from({ length: 20 }, (_, index) =>
      generateDirectionsForCycle({
        players,
        week: index + 1,
        seed: 123,
        count: 2,
        prioritizeHuman: true,
        relationships: {
          test: { nova: { affinity: 1, tags: [] }, blue: { affinity: 4, tags: [] } },
          nova: { test: { affinity: 1, tags: [] }, blue: { affinity: 0, tags: [] } },
          blue: { test: { affinity: 4, tags: [] }, nova: { affinity: 0, tags: [] } },
        },
      })
    ).flat()

    expect(directions.some((direction) => direction.type === 'break_alliance')).toBe(false)
  })

  it('only creates a break-alliance request for a real mutual alliance', () => {
    const directions = Array.from({ length: 25 }, (_, index) =>
      generateDirectionsForCycle({
        players: [player('test', true), player('nova')],
        week: index + 1,
        seed: 4,
        count: 1,
        prioritizeHuman: true,
        relationships: {
          test: { nova: { affinity: 20, tags: ['alliance'] } },
          nova: { test: { affinity: 20, tags: ['alliance'] } },
        },
      })
    ).flat()

    const breakRequest = directions.find((direction) => direction.type === 'break_alliance')
    expect(breakRequest?.relatedPlayerId).toBe('nova')
    expect(breakRequest?.actionHint).toContain('nova')
  })

  it('writes AI requests as audience story beats without exposing the action route', () => {
    const directions = generateDirectionsForCycle({
      players: [player('lux'), player('dex')],
      week: 4,
      seed: 22,
      count: 2,
    })

    expect(directions).toHaveLength(2)
    expect(
      directions.every((direction) =>
        /(?:The public|Viewers|The feeds|The audience)/.test(direction.description)
      )
    ).toBe(true)
    expect(directions.every((direction) => direction.actionHint === undefined)).toBe(true)
    expect(directions.every((direction) => direction.rationale === undefined)).toBe(true)
  })

  it('keeps relationship stories open long enough to develop', () => {
    const relationshipRequest = Array.from({ length: 40 }, (_, index) =>
      generateDirectionsForCycle({
        players: [player('test', true), player('nova')],
        week: 4,
        seed: index + 1,
        count: 1,
        prioritizeHuman: true,
        relationships: {
          test: { nova: { affinity: 0, tags: [] } },
          nova: { test: { affinity: 0, tags: [] } },
        },
      }).find((direction) => direction.type === 'get_closer')
    ).find(Boolean)

    expect(relationshipRequest).toBeDefined()
    expect(relationshipRequest?.expiresAtWeek).toBe(6)
  })

  it('does not issue a second live request to a player already carrying one', () => {
    const directions = generateDirectionsForCycle({
      players: [player('test', true), player('nova')],
      week: 4,
      seed: 8,
      count: 2,
      prioritizeHuman: true,
      excludePlayerIds: ['test'],
      relationships: {
        test: { nova: { affinity: 0, tags: [] } },
        nova: { test: { affinity: 0, tags: [] } },
      },
    })

    expect(directions.every((direction) => direction.playerId !== 'test')).toBe(true)
  })
})
