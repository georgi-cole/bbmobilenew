import { describe, expect, it } from 'vitest'
import { buildVoxFirstImpressions } from './voxFirstImpression'

describe('Vox Populi first impressions', () => {
  const candidates = Array.from({ length: 14 }, (_, index) => ({
    id: `player-${index + 1}`,
    affinity: 0,
  }))

  it('creates a stable variety even before relationships have formed', () => {
    const first = buildVoxFirstImpressions({
      seed: 42,
      week: 1,
      humanId: 'you',
      candidates,
    })
    const second = buildVoxFirstImpressions({
      seed: 42,
      week: 1,
      humanId: 'you',
      candidates,
    })
    const tones = new Set(Object.values(first).map((entry) => entry.tone))

    expect(first).toEqual(second)
    expect(tones.size).toBeGreaterThanOrEqual(4)
    expect(tones).toContain('warm')
    expect(tones).toContain('wary')
  })

  it('refreshes the simulated read for the second nomination day', () => {
    const dayOne = buildVoxFirstImpressions({ seed: 42, week: 1, humanId: 'you', candidates })
    const dayTwo = buildVoxFirstImpressions({ seed: 42, week: 2, humanId: 'you', candidates })

    expect(dayTwo).not.toEqual(dayOne)
  })
})
