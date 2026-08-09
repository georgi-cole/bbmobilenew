import { beforeEach, describe, expect, it } from 'vitest'
import {
  BROADCAST_CONFIG_STORAGE_KEY,
  loadBroadcastConfig,
  saveBroadcastConfig,
} from '../src/broadcasting/broadcastConfigPersistence'

describe('broadcast manager permanent configuration', () => {
  beforeEach(() => localStorage.removeItem(BROADCAST_CONFIG_STORAGE_KEY))

  it('round-trips overrides and custom messages independently from a campaign save', () => {
    expect(saveBroadcastConfig(
      { 'week.day-start': { text: 'A permanent day start.', disabled: false } },
      [{
        id: 'custom-1',
        key: 'social.permanent-message',
        phase: 'week_start',
        text: 'Permanent custom message',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 10,
      }]
    )).toBe(true)

    expect(loadBroadcastConfig()).toMatchObject({
      overrides: { 'week.day-start': { text: 'A permanent day start.' } },
      customMessages: [{ id: 'custom-1', forceOnTv: true, order: 10 }],
    })
  })

  it('migrates old UUID-only messages to readable unique authoring keys', () => {
    localStorage.setItem(BROADCAST_CONFIG_STORAGE_KEY, JSON.stringify({
      version: 2,
      overrides: {},
      customMessages: [
        { id: 'uuid-1', phase: 'social_1', text: 'Alliance warning arrives', type: 'game', level: 'minor', enabled: true },
        { id: 'uuid-2', phase: 'social_1', text: 'Alliance warning arrives', type: 'game', level: 'minor', enabled: true },
      ],
    }))

    expect(loadBroadcastConfig().customMessages.map((message) => message.key)).toEqual([
      'custom.alliance-warning-arrives',
      'custom.alliance-warning-arrives-2',
    ])
  })
})
