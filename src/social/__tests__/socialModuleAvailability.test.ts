import { describe, expect, it } from 'vitest'
import {
  getBlockedSocialModuleAnnouncementMessage,
  getIncomingSocialModuleAvailability,
  getSocialModuleAvailability,
  SOCIAL_MODULE_BLOCKED_DURING_LIVE_VOTE_MESSAGE,
  SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE,
} from '../socialModuleAvailability'

describe('socialModuleAvailability', () => {
  const activeHuman = [{ id: 'user', isUser: true, status: 'active' as const }]

  it('returns null announcement text when social modules can open', () => {
    const availability = getSocialModuleAvailability({
      phase: 'social_1',
      players: activeHuman,
    })

    expect(getBlockedSocialModuleAnnouncementMessage(availability)).toBeNull()
  })

  it('returns the out-of-house announcement for evicted or jury players', () => {
    const evictedAvailability = getSocialModuleAvailability({
      phase: 'week_start',
      players: [{ id: 'user', isUser: true, status: 'evicted' }],
    })
    const juryAvailability = getIncomingSocialModuleAvailability({
      phase: 'week_start',
      players: [{ id: 'user', isUser: true, status: 'jury' }],
    })

    expect(getBlockedSocialModuleAnnouncementMessage(evictedAvailability)).toBe(
      SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE
    )
    expect(getBlockedSocialModuleAnnouncementMessage(juryAvailability)).toBe(
      SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE
    )
  })

  it('returns the out-of-house announcement when no human player exists', () => {
    const availability = getSocialModuleAvailability({
      phase: 'week_start',
      players: [{ id: 'ai-1', isUser: false, status: 'active' }],
    })

    expect(getBlockedSocialModuleAnnouncementMessage(availability)).toBe(
      SOCIAL_MODULE_BLOCKED_OUT_OF_GAME_MESSAGE
    )
  })

  it('blocks outgoing actions but keeps incoming vote pitches available during live voting', () => {
    const outgoing = getSocialModuleAvailability({
      phase: 'live_vote',
      players: activeHuman,
    })
    const incoming = getIncomingSocialModuleAvailability({
      phase: 'live_vote',
      players: activeHuman,
    })

    expect(outgoing.canOpen).toBe(false)
    expect(getBlockedSocialModuleAnnouncementMessage(outgoing)).toBe(
      SOCIAL_MODULE_BLOCKED_DURING_LIVE_VOTE_MESSAGE
    )
    expect(incoming.canOpen).toBe(true)
    expect(getBlockedSocialModuleAnnouncementMessage(incoming)).toBeNull()
  })

  it('keeps both social modules unavailable in Survival mode', () => {
    const game = {
      mode: 'survival' as const,
      phase: 'social_1' as const,
      players: activeHuman,
    }

    expect(getSocialModuleAvailability(game).canOpen).toBe(false)
    expect(getIncomingSocialModuleAvailability(game).canOpen).toBe(false)
  })
})
