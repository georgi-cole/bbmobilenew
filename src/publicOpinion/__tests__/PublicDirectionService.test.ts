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
})
