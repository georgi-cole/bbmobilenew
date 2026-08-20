import { describe, expect, it } from 'vitest'
import {
  calculateEvictionVoteRevealIntervalMs,
  calculatePublicVotingEliminationIntervalMs,
  PUBLIC_VOTING_REVEAL_RESERVE_MS,
} from '../../../src/services/sound/publicVotingAudioTiming'

describe('calculateEvictionVoteRevealIntervalMs', () => {
  it('fits percentage steps and the closing result beat to the soundtrack', () => {
    expect(calculateEvictionVoteRevealIntervalMs(14_000, 100, 1_000, 3_000)).toBe(100)
  })

  it('keeps the readable fallback when metadata is unavailable or too short', () => {
    expect(calculateEvictionVoteRevealIntervalMs(null, 100, 1_000, 3_000)).toBe(28)
    expect(calculateEvictionVoteRevealIntervalMs(2_000, 100, 1_000, 3_000)).toBe(28)
  })
})

describe('calculatePublicVotingEliminationIntervalMs', () => {
  it('reserves the closing music phrase for final-two tension and reveal', () => {
    expect(PUBLIC_VOTING_REVEAL_RESERVE_MS).toBe(7_500)
    expect(calculatePublicVotingEliminationIntervalMs(30_000, 6, 4_800)).toBe(4_500)
  })

  it('adapts to candidate count without consuming the reveal reserve', () => {
    expect(calculatePublicVotingEliminationIntervalMs(44_000, 12, 4_800)).toBe(3_318)
    expect(calculatePublicVotingEliminationIntervalMs(44_000, 5, 4_800)).toBe(9_125)
  })

  it('bounds the reserve so short tracks retain a readable elimination cadence', () => {
    expect(calculatePublicVotingEliminationIntervalMs(4_000, 6, 4_800)).toBe(650)
  })

  it('uses the existing cadence when metadata is unavailable or invalid', () => {
    expect(calculatePublicVotingEliminationIntervalMs(null, 8, 4_800)).toBe(4_800)
    expect(calculatePublicVotingEliminationIntervalMs(Number.NaN, 8, 4_800)).toBe(4_800)
    expect(calculatePublicVotingEliminationIntervalMs(900, 8, 4_800)).toBe(4_800)
    expect(calculatePublicVotingEliminationIntervalMs(30_000, 1, 4_800)).toBe(4_800)
  })
})
