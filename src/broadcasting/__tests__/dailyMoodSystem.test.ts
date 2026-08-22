import { describe, expect, it } from 'vitest'
import type { Player } from '../../types'
import { getDailyAtmosphere, getDailyMoodCopy } from '../dailyMoodSystem'

const players: Player[] = [
  { id: 'user', name: 'You', avatar: '', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', avatar: '', status: 'active' },
  { id: 'kai', name: 'Kai', avatar: '', status: 'active' },
]

describe('daily mood system', () => {
  it('rotates through distinct day-start and day-end weather on consecutive days', () => {
    const starts = [1, 2, 3].map((week) => getDailyAtmosphere('game-a', week, 'week_start'))
    const ends = [1, 2, 3].map((week) => getDailyAtmosphere('game-a', week, 'week_end'))
    expect(new Set(starts).size).toBe(3)
    expect(new Set(ends).size).toBe(3)
  })

  it('uses manager copy and resolves the closest living housemate', () => {
    const copy = getDailyMoodCopy({
      atmosphere: 'rainy',
      phase: 'week_start',
      week: 2,
      players,
      relationships: {
        user: {
          lia: { affinity: 70, tags: [] },
          kai: { affinity: 10, tags: [] },
        },
      },
      overrides: {
        'week.day-start-mood.rainy': { text: 'A warm drink from {friend} is waiting.' },
      },
    })
    expect(copy).toBe('A warm drink from Lia is waiting.')
  })

  it('honours a disabled mood source in the Broadcast Manager', () => {
    expect(
      getDailyMoodCopy({
        atmosphere: 'starry',
        phase: 'week_end',
        week: 1,
        players,
        overrides: { 'week.day-end-mood.starry': { disabled: true } },
      })
    ).toBeNull()
  })
})
