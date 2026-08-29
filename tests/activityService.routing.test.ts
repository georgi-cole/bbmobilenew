import { describe, expect, it } from 'vitest'
import {
  isServiceConfigurationEvent,
  isVisibleInMainLog,
  isVisibleOnTv,
} from '../src/services/activityService'

describe('service broadcast routing', () => {
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
