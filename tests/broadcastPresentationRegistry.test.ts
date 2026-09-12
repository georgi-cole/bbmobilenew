import { describe, expect, it } from 'vitest'
import {
  getBroadcastAnnouncementPresentation,
  getBroadcastPresentationRule,
  isBroadcastPlayThroughAnnouncementKey,
  isBroadcastShockAnnouncementKey,
  isRecognizedBroadcastMajorKey,
} from '../src/broadcasting/broadcastPresentationRegistry'

describe('broadcast presentation registry', () => {
  it('preserves the exact explicit-major compatibility boundary', () => {
    expect(isRecognizedBroadcastMajorKey('nomination_ceremony')).toBe(true)
    expect(isRecognizedBroadcastMajorKey('custom_critical')).toBe(true)
    expect(isRecognizedBroadcastMajorKey('depression_shock_chocolates')).toBe(true)

    // These have authored presentation metadata but historically are reached
    // through managed/bespoke flows rather than TvZone's generic major-event path.
    expect(isRecognizedBroadcastMajorKey('vox_final3')).toBe(false)
    expect(isRecognizedBroadcastMajorKey('vox_public_vote')).toBe(false)
    expect(isRecognizedBroadcastMajorKey('depression_shock_end')).toBe(false)
  })

  it('keeps standard announcement card metadata stable', () => {
    expect(getBroadcastAnnouncementPresentation('nomination_ceremony')).toEqual({
      title: 'Nomination Ceremony',
      subtitle: 'Two players are nominated for elimination.',
      isLive: true,
      autoDismissMs: null,
    })
    expect(getBroadcastAnnouncementPresentation('vip_veto')).toEqual({
      title: 'Double Trouble!',
      subtitle: 'The holder may use the power twice this ceremony. 👑',
      isLive: true,
      autoDismissMs: null,
    })
  })

  it('centralizes shock classification without broadening it', () => {
    expect(isBroadcastShockAnnouncementKey('double_eviction')).toBe(true)
    expect(isBroadcastShockAnnouncementKey('battle_back_rules')).toBe(true)
    expect(isBroadcastShockAnnouncementKey('custom_critical')).toBe(true)
    expect(isBroadcastShockAnnouncementKey('nomination_ceremony')).toBe(false)
    expect(isBroadcastShockAnnouncementKey('depression_shock_chocolates')).toBe(false)
  })

  it('centralizes play-through behavior independently from shock classification', () => {
    expect(isBroadcastPlayThroughAnnouncementKey('double_eviction')).toBe(true)
    expect(isBroadcastPlayThroughAnnouncementKey('vox_final3_result')).toBe(true)
    expect(isBroadcastPlayThroughAnnouncementKey('battle_back')).toBe(false)
    expect(isBroadcastPlayThroughAnnouncementKey('custom_critical')).toBe(false)
  })

  it('retains fallback-only compatibility keys without inventing card copy', () => {
    expect(getBroadcastPresentationRule('battle_back_rules')).toEqual({ shock: true })
    expect(getBroadcastAnnouncementPresentation('battle_back_rules')).toBeUndefined()
  })
})
