import { describe, expect, it } from 'vitest'
import {
  BATTLE_BACK_ANNOUNCEMENT_SEQUENCE,
  advanceBattleBackAnnouncementStep,
  isBattleBackReplayEligible,
} from '../battleBackFlow'

describe('battle back flow helpers', () => {
  it('defines a three-step suspense sequence before the challenge begins', () => {
    expect(BATTLE_BACK_ANNOUNCEMENT_SEQUENCE.map((step) => step.key)).toEqual([
      'battle_back_shock',
      'battle_back_rules',
      'battle_back_challenge',
    ])
    expect(BATTLE_BACK_ANNOUNCEMENT_SEQUENCE.every((step) => step.autoDismissMs === null)).toBe(true)
  })

  it('advances through each announcement step and then opens the competition', () => {
    expect(advanceBattleBackAnnouncementStep(0)).toEqual({
      nextStep: 1,
      shouldOpenCompetition: false,
    })
    expect(advanceBattleBackAnnouncementStep(1)).toEqual({
      nextStep: 2,
      shouldOpenCompetition: false,
    })
    expect(advanceBattleBackAnnouncementStep(2)).toEqual({
      nextStep: null,
      shouldOpenCompetition: true,
    })
  })

  it('offers a replay prompt whenever there is another possible outcome and retries remain', () => {
    expect(isBattleBackReplayEligible('p2', 3, 0, 3)).toBe(true)
    expect(isBattleBackReplayEligible('p2', 1, 0, 3)).toBe(false)
    expect(isBattleBackReplayEligible('p2', 3, 3, 3)).toBe(false)
    expect(isBattleBackReplayEligible(undefined, 3, 0, 3)).toBe(false)
  })
})
