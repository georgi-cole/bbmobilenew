import { describe, expect, it } from 'vitest'
import { getBroadcastTemplate } from '../src/broadcasting/broadcastTemplateCatalog'
import {
  isLegacySeasonWelcomeEvent,
  isServiceConfigurationEvent,
  isVisibleInMainLog,
  isVisibleOnTv,
} from '../src/services/activityService'

describe('service broadcast routing', () => {
  it('marks Public Mode rules log-only at the broadcast source', () => {
    expect(getBroadcastTemplate('season.public-mode-rule')?.forceOnTv).toBe(false)
    expect(getBroadcastTemplate('survival.rules')?.forceOnTv).toBe(false)
  })

  it('keeps the Public Mode rules status in the log but off the faux TV', () => {
    const event = {
      text: '[Rules] Public mode: ON',
      type: 'game',
      meta: { broadcastTemplateId: 'season.public-mode-rule' },
    }

    expect(isServiceConfigurationEvent(event)).toBe(true)
    expect(isVisibleOnTv(event)).toBe(false)
    expect(isVisibleInMainLog(event)).toBe(true)
  })

  it('treats the Surveyeval rules line as log-only even if its copy changes', () => {
    const event = {
      text: 'Runtime rules configured.',
      type: 'game',
      meta: { broadcastTemplateId: 'survival.rules' },
    }

    expect(isVisibleOnTv(event)).toBe(false)
    expect(isVisibleInMainLog(event)).toBe(true)
  })

  it('catches future bracketed service configuration lines without hiding normal game events', () => {
    expect(isVisibleOnTv({ text: '[System] Autosave ready', type: 'game' })).toBe(false)
    expect(isVisibleOnTv({ text: 'The first LOH competition is ready.', type: 'game' })).toBe(true)
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
