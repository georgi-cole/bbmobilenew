import { describe, expect, it } from 'vitest'
import { simulateRealitySeason, validateRealitySeasonBatch } from '../realitySeasonSimulation'

describe('full-season Reality simulation', () => {
  it('replays the same season exactly from the same seed', () => {
    const first = simulateRealitySeason(90210, { days: 8, castSize: 8 })
    const replay = simulateRealitySeason(90210, { days: 8, castSize: 8 })

    expect(first.replayDigest).toBe(replay.replayDigest)
    expect(first.resolvedInteractions).toBeGreaterThan(0)
    expect(first.evictions).toBeGreaterThan(0)
    expect(first.invalidSelections).toBe(0)
    expect(first.humanAutonomyViolations).toBe(0)
    expect(first.memoryOverflows).toBe(0)
    expect(first.eventOverflow).toBe(0)
  })

  it('stress-checks multiple complete seeded seasons without leaks or deadlocks', () => {
    const report = validateRealitySeasonBatch([11, 29, 47, 83, 131, 197], { days: 8, castSize: 8 })

    expect(report.seasons).toBe(6)
    expect(report.replayDivergences).toBe(0)
    expect(report.invalidSelections).toBe(0)
    expect(report.humanAutonomyViolations).toBe(0)
    expect(report.deadlockDays).toBe(0)
    expect(report.memoryOverflows).toBe(0)
    expect(report.eventOverflows).toBe(0)
  })
})
