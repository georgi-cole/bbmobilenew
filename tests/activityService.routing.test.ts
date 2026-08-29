import { describe, expect, it } from 'vitest'
import { getBroadcastTemplate } from '../src/broadcasting/broadcastTemplateCatalog'
import {
  isLegacySeasonWelcomeEvent,
  isServiceConfigurationEvent,
  isVisibleInMainLog,
  isVisibleOnTv,
} from '../src/services/activityService'

describe('service broadcast routing', () => {
  it('marks only the Public Mode status log-only at the broadcast source', () => {
    expect(getBroadcastTemplate('season.public-mode-rule')?.forceOnTv).toBe(false)
  })

  it('keeps the Public Mode rules status in the log but off the faux TV', () => {
    const event = {
      text: '[Rules] Public mode: OFF',
      type: 'game',
      meta: { broadcastTemplateId: 'season.public-mode-rule' },
    }

    expect(isServiceConfigurationEvent(event)).toBe(true)
    expect(isVisibleOnTv(event)).toBe(false)
    expect(isVisibleInMainLog(event)).toBe(true)
  })

  it('does not classify other bracketed or system-looking messages out of the TV', () => {
    expect(isVisibleOnTv({ text: '[System] Autosave ready', type: 'game' })).toBe(true)
    expect(isVisibleOnTv({ text: '[Rules] A different authored rule', type: 'game' })).toBe(true)
  })

  it('never suppresses ordinary social messages such as final pitches', () => {
    const event = {
      text: 'The nominees make their final pitches before the vote.',
      type: 'social',
      meta: { broadcastTemplateId: 'social.final-pitches' },
    }

    expect(isServiceConfigurationEvent(event)).toBe(false)
    expect(isVisibleOnTv(event)).toBe(true)
    expect(isVisibleInMainLog(event)).toBe(true)
  })
})

describe('season opening replacement routing', () => {
  it('keeps the legacy built-in welcomes off TV so onboarding owns the opening', () => {
    expect(getBroadcastTemplate('season.welcome')?.forceOnTv).toBe(false)
    expect(getBroadcastTemplate('season.welcome-cupid')?.forceOnTv).toBe(false)
  })

  it('suppresses the exact legacy Classic welcome so the staged welcome owns the TV', () => {
    const event = {
      text: 'Welcome to The Big Eye hub! 🏠 Season 7 is about to begin.',
      type: 'game',
    }

    expect(isLegacySeasonWelcomeEvent(event)).toBe(true)
    expect(isVisibleOnTv(event)).toBe(false)
    expect(isVisibleInMainLog(event)).toBe(false)
  })

  it('suppresses the exact legacy Cupid welcome as well', () => {
    const event = {
      text: 'The Big Eye hub is now filled with love! 🏠 Season 14 is about to begin. Get some chocolate and press play.',
      type: 'game',
    }

    expect(isLegacySeasonWelcomeEvent(event)).toBe(true)
    expect(isVisibleOnTv(event)).toBe(false)
  })

  it('does not suppress authored/custom welcome copy', () => {
    const event = {
      text: 'Welcome to the wildest season yet.',
      type: 'game',
    }

    expect(isLegacySeasonWelcomeEvent(event)).toBe(false)
    expect(isVisibleOnTv(event)).toBe(true)
    expect(isVisibleInMainLog(event)).toBe(true)
  })
})
