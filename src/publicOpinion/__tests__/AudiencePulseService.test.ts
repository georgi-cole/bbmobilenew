import { describe, expect, it } from 'vitest'
import { computeAudiencePulse } from '../AudiencePulseService'
import { generateDirectionsForCycle } from '../PublicDirectionService'

describe('audience pulse and explicit requests', () => {
  it('reacts to recorded AI social behaviour without hidden random drift', () => {
    const reactions = computeAudiencePulse({
      players: [
        { id: 'lia', status: 'active' },
        { id: 'echo', status: 'active' },
      ],
      week: 2,
      actionHistory: [
        {
          actionId: 'compliment',
          actorId: 'lia',
          targetId: 'echo',
          cost: 1,
          delta: 4,
          outcome: 'success',
          newEnergy: 2,
          timestamp: 1,
          week: 2,
          source: 'system',
        },
        {
          actionId: 'reassure',
          actorId: 'lia',
          targetId: 'echo',
          cost: 1,
          delta: 4,
          outcome: 'success',
          newEnergy: 1,
          timestamp: 2,
          week: 2,
          source: 'system',
        },
        {
          actionId: 'confront',
          actorId: 'echo',
          targetId: 'lia',
          cost: 1,
          delta: -5,
          outcome: 'success',
          newEnergy: 1,
          timestamp: 3,
          week: 2,
          source: 'system',
        },
        {
          actionId: 'startFight',
          actorId: 'echo',
          targetId: 'lia',
          cost: 1,
          delta: -5,
          outcome: 'success',
          newEnergy: 0,
          timestamp: 4,
          week: 2,
          source: 'system',
        },
      ],
    })
    expect(reactions.find((entry) => entry.playerId === 'lia')?.delta).toBeGreaterThan(0)
    expect(reactions.find((entry) => entry.playerId === 'echo')?.delta).toBeLessThan(0)
  })

  it('gives influence-LOH requests a concrete nomination target', () => {
    const players = [
      { id: 'user', name: 'You', avatar: '🧑', status: 'active', isUser: true },
      { id: 'lia', name: 'Lia', avatar: '👩', status: 'active', isUser: false },
      { id: 'echo', name: 'Echo', avatar: '🧑', status: 'active', isUser: false },
      { id: 'rae', name: 'Rae', avatar: '👩', status: 'active', isUser: false },
    ] as const
    const directions = Array.from({ length: 30 }, (_, offset) =>
      generateDirectionsForCycle({
        players: [...players],
        week: offset + 1,
        seed: offset + 11,
        count: 4,
      })
    ).flat()
    const influence = directions.find((direction) => direction.type === 'influence_hoh')
    expect(influence?.targetPlayerId).toBeTruthy()
    expect(influence?.description).toMatch(/nominate (?!your target)/i)
  })
})
