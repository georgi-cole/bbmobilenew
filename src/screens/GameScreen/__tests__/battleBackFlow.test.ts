import { describe, expect, it } from 'vitest'
import {
  isBattleBackReplayEligible,
  shouldUseBattleBackMinigame,
} from '../battleBackFlow'

describe('battle back flow helpers', () => {
  it('offers a replay prompt only when the human actually competed, lost, and retries remain', () => {
    expect(isBattleBackReplayEligible('p2', 'p0', ['p0', 'p1', 'p2'], 0, 3)).toBe(true)
    expect(isBattleBackReplayEligible('p0', 'p0', ['p0', 'p1', 'p2'], 0, 3)).toBe(false)
    expect(isBattleBackReplayEligible('p2', null, ['p0', 'p1', 'p2'], 0, 3)).toBe(false)
    expect(isBattleBackReplayEligible('p2', 'spectator', ['p0', 'p1', 'p2'], 0, 3)).toBe(false)
    expect(isBattleBackReplayEligible('stale-winner', 'p0', ['p0', 'p1', 'p2'], 0, 3)).toBe(false)
    expect(isBattleBackReplayEligible('p2', 'p0', ['p0', 'p1', 'p2'], 3, 3)).toBe(false)
    expect(isBattleBackReplayEligible(undefined, 'p0', ['p0', 'p1', 'p2'], 0, 3)).toBe(false)
  })

  it('uses the playable minigame only when the human is an eligible battle back candidate', () => {
    expect(shouldUseBattleBackMinigame('p0', ['p0', 'p1', 'p2'])).toBe(true)
    expect(shouldUseBattleBackMinigame('p0', ['p1', 'p2'])).toBe(false)
    expect(shouldUseBattleBackMinigame(null, ['p0', 'p1', 'p2'])).toBe(false)
  })
})
