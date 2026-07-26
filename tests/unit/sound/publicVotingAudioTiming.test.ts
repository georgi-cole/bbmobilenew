import { describe, expect, it } from 'vitest'
import { calculatePublicVotingEliminationIntervalMs } from '../../../src/services/sound/publicVotingAudioTiming'

describe('calculatePublicVotingEliminationIntervalMs', () => {
  it('spreads every elimination evenly across the complete music duration', () => {
    expect(calculatePublicVotingEliminationIntervalMs(30_000, 6, 4_800)).toBe(6_000)
  })

  it('adapts automatically when the candidate count changes', () => {
    expect(calculatePublicVotingEliminationIntervalMs(44_000, 12, 4_800)).toBe(4_000)
    expect(calculatePublicVotingEliminationIntervalMs(44_000, 5, 4_800)).toBe(11_000)
  })

  it('uses the existing cadence when metadata is unavailable or invalid', () => {
    expect(calculatePublicVotingEliminationIntervalMs(null, 8, 4_800)).toBe(4_800)
    expect(calculatePublicVotingEliminationIntervalMs(Number.NaN, 8, 4_800)).toBe(4_800)
    expect(calculatePublicVotingEliminationIntervalMs(900, 8, 4_800)).toBe(4_800)
    expect(calculatePublicVotingEliminationIntervalMs(30_000, 1, 4_800)).toBe(4_800)
  })
})
