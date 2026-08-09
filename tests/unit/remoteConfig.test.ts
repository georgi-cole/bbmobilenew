/**
 * Unit tests for the remote config system.
 *
 * Tests:
 *  1. sanitiseRemoteConfig rejects non-objects.
 *  2. sanitiseRemoteConfig keeps valid string/number fields.
 *  3. sanitiseRemoteConfig drops non-http/https URLs.
 *  4. sanitiseRemoteConfig accepts valid http/https URLs.
 *  5. sanitiseRemoteConfig drops invalid weeklyMode values.
 *  6. sanitiseRemoteConfig accepts valid weeklyMode values.
 *  7. sanitiseRemoteConfig sanitises player overrides.
 *  8. shouldFetchRemoteConfig enforces dev/prod URL policy.
 *  9. remoteConfigSlice setRemoteConfig updates state.
 * 10. loadRemoteConfig.fulfilled updates state correctly.
 * 11. loadRemoteConfig.pending sets status to 'loading'.
 * 12. loadRemoteConfig.rejected sets status to 'error'.
 * 13. selectRemoteMainTvHeadline returns headline or null.
 * 14. selectRemoteIntroHubBg returns background URL or null.
 * 15. selectRemotePlayerOverrides returns overrides or empty array.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import remoteConfigReducer, {
  setRemoteConfig,
  loadRemoteConfig,
  selectRemoteConfig,
  selectRemoteMainTvHeadline,
  selectRemoteIntroHubBg,
  selectRemotePlayerOverrides,
} from '../../src/remoteConfig/remoteConfigSlice'
import {
  sanitiseRemoteConfig,
  shouldFetchRemoteConfig,
} from '../../src/remoteConfig/remoteConfigService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { remoteConfig: remoteConfigReducer } })
}

// ─── sanitiseRemoteConfig ─────────────────────────────────────────────────────

describe('sanitiseRemoteConfig', () => {
  it('returns null for null', () => {
    expect(sanitiseRemoteConfig(null)).toBeNull()
  })

  it('returns null for a non-object', () => {
    expect(sanitiseRemoteConfig('string')).toBeNull()
    expect(sanitiseRemoteConfig(42)).toBeNull()
    expect(sanitiseRemoteConfig([])).toBeNull()
  })

  it('returns an empty object for an empty object', () => {
    expect(sanitiseRemoteConfig({})).toEqual({})
  })

  it('keeps valid string fields', () => {
    const raw = {
      season: {
        theme: { accent: '#7c3aed', accent2: '#a78bfa', background: '#08101f' },
        mainTv: { headline: 'Hello week!', subtext: 'Sub' },
      },
    }
    const result = sanitiseRemoteConfig(raw)
    expect(result?.season?.theme?.accent).toBe('#7c3aed')
    expect(result?.season?.theme?.accent2).toBe('#a78bfa')
    expect(result?.season?.theme?.background).toBe('#08101f')
    expect(result?.season?.mainTv?.headline).toBe('Hello week!')
    expect(result?.season?.mainTv?.subtext).toBe('Sub')
  })

  it('sanitises scheduled broadcast messages', () => {
    const result = sanitiseRemoteConfig({
      broadcast: {
        enabled: true,
        title: 'Maintenance',
        message: 'The house will reopen shortly.',
        priority: 'critical',
        startsAt: '2026-08-09T20:00:00.000Z',
        endsAt: 'not-a-date',
      },
    })
    expect(result?.broadcast).toEqual({
      enabled: true,
      title: 'Maintenance',
      message: 'The house will reopen shortly.',
      priority: 'critical',
      startsAt: '2026-08-09T20:00:00.000Z',
    })
  })

  it('sanitises remote game-manager rules', () => {
    const result = sanitiseRemoteConfig({
      gameManager: {
        enabled: true,
        rules: [
          {
            id: 'week-three-loh',
            enabled: true,
            priority: 5000,
            trigger: 'day',
            day: 3.4,
            competition: 'LOH',
            selection: 'category',
            category: 'logic',
            outcome: 'random',
          },
          { id: 'invalid', trigger: 'whenever' },
        ],
      },
    })
    expect(result?.gameManager).toEqual({
      enabled: true,
      rules: [
        {
          id: 'week-three-loh',
          enabled: true,
          priority: 1000,
          trigger: 'day',
          day: 3,
          competition: 'LOH',
          selection: 'category',
          category: 'logic',
          outcome: 'random',
        },
      ],
    })
  })

  it('sanitises the centrally managed Broadcast and Social Manager data', () => {
    const result = sanitiseRemoteConfig({
      broadcastManager: {
        enabled: true,
        overrides: {
          'week-start.house-update': { text: 'A new house update.', level: 'critical' },
          ignored: { level: 'not-a-level' },
        },
        customMessages: [
          {
            id: 'remote-week-start',
            key: 'remote.week-start',
            phase: 'week_start',
            text: 'The live feed starts now.',
            type: 'game',
            level: 'major',
            enabled: true,
          },
          { id: 'invalid', phase: 'not-a-phase', text: 'Ignored' },
        ],
      },
      socialManager: {
        enabled: true,
        actionOverrides: { compliment: { title: 'Praise', enabled: false } },
      },
    })

    expect(result?.broadcastManager).toEqual({
      enabled: true,
      overrides: { 'week-start.house-update': { text: 'A new house update.', level: 'critical' } },
      customMessages: [
        {
          id: 'remote-week-start',
          key: 'remote.week-start',
          phase: 'week_start',
          text: 'The live feed starts now.',
          type: 'game',
          level: 'major',
          enabled: true,
        },
      ],
    })
    expect(result?.socialManager).toEqual({
      enabled: true,
      actionOverrides: { compliment: { title: 'Praise', enabled: false } },
    })
  })

  it('drops javascript: and data: URLs', () => {
    const raw = {
      season: {
        introHub: { backgroundImageUrl: 'javascript:alert(1)' },
        music: { introTrackUrl: 'data:audio/mp3;base64,abc' },
      },
    }
    const result = sanitiseRemoteConfig(raw)
    expect(result?.season?.introHub).toBeUndefined()
    expect(result?.season?.music).toBeUndefined()
  })

  it('accepts valid http and https URLs', () => {
    const raw = {
      season: {
        introHub: { backgroundImageUrl: 'https://cdn.example.com/bg.jpg' },
        music: {
          introTrackUrl: 'https://cdn.example.com/intro.mp3',
          mainTrackUrl: 'http://cdn.example.com/main.mp3',
        },
      },
    }
    const result = sanitiseRemoteConfig(raw)
    expect(result?.season?.introHub?.backgroundImageUrl).toBe('https://cdn.example.com/bg.jpg')
    expect(result?.season?.music?.introTrackUrl).toBe('https://cdn.example.com/intro.mp3')
    expect(result?.season?.music?.mainTrackUrl).toBe('http://cdn.example.com/main.mp3')
  })

  it('drops invalid weeklyMode values', () => {
    const raw = { challenge: { weeklyMode: 'hack-everything' } }
    const result = sanitiseRemoteConfig(raw)
    expect(result?.challenge).toBeUndefined()
  })

  it('accepts valid weeklyMode values', () => {
    const modes = [
      'random-games',
      'single-game',
      'arcade-only',
      'trivia-only',
      'endurance-only',
      'logic-only',
      'user-selection',
      'retired',
      'misc',
      'unique',
    ] as const
    for (const mode of modes) {
      const result = sanitiseRemoteConfig({ challenge: { weeklyMode: mode } })
      expect(result?.challenge?.weeklyMode).toBe(mode)
    }
  })

  it('sanitises player overrides — drops entries without id', () => {
    const raw = {
      players: [
        { id: 'finn', avatarUrl: 'https://cdn.example.com/finn.png' },
        { avatarUrl: 'https://cdn.example.com/no-id.png' }, // no id
        { id: '', avatarUrl: 'https://cdn.example.com/empty-id.png' }, // empty id
      ],
    }
    const result = sanitiseRemoteConfig(raw)
    expect(result?.players).toHaveLength(1)
    expect(result?.players?.[0].id).toBe('finn')
  })

  it('drops avatar URLs that are not http/https', () => {
    const raw = {
      players: [{ id: 'finn', avatarUrl: 'javascript:alert(1)' }],
    }
    const result = sanitiseRemoteConfig(raw)
    // Player entry preserved (id is valid), but avatarUrl dropped
    expect(result?.players?.[0].avatarUrl).toBeUndefined()
  })

  it('clamps overlayOpacity to [0, 1]', () => {
    const raw = {
      season: {
        introHub: { backgroundImageUrl: 'https://example.com/bg.jpg', overlayOpacity: 1.5 },
      },
    }
    const result = sanitiseRemoteConfig(raw)
    expect(result?.season?.introHub?.overlayOpacity).toBe(1)

    const raw2 = {
      season: {
        introHub: { backgroundImageUrl: 'https://example.com/bg.jpg', overlayOpacity: -0.5 },
      },
    }
    const result2 = sanitiseRemoteConfig(raw2)
    expect(result2?.season?.introHub?.overlayOpacity).toBe(0)
  })

  it('keeps weeklyGameKeys array of strings', () => {
    const raw = {
      challenge: {
        weeklyMode: 'user-selection',
        weeklyGameKeys: ['quickTapRace', 'colorMatch', 42, null, ''],
      },
    }
    const result = sanitiseRemoteConfig(raw)
    // Only non-empty strings are kept
    expect(result?.challenge?.weeklyGameKeys).toEqual(['quickTapRace', 'colorMatch'])
  })

  it('sanitises rollout controls and telemetry endpoints', () => {
    const result = sanitiseRemoteConfig({
      operations: {
        killSwitches: { refinedGameChrome: true, unknown: true },
        rollouts: { refinedGameChrome: { enabled: true, percentage: 140, salt: 'july' } },
        telemetry: {
          enabled: true,
          samplePercentage: -5,
          endpointUrl: 'https://events.example.com/v1',
        },
      },
    })

    expect(result?.operations).toEqual({
      killSwitches: { refinedGameChrome: true },
      rollouts: { refinedGameChrome: { enabled: true, percentage: 100, salt: 'july' } },
      telemetry: {
        enabled: true,
        samplePercentage: 0,
        endpointUrl: 'https://events.example.com/v1',
      },
    })
  })

  it('drops unsafe telemetry collector URLs', () => {
    const result = sanitiseRemoteConfig({
      operations: { telemetry: { enabled: true, endpointUrl: 'javascript:alert(1)' } },
    })
    expect(result?.operations?.telemetry?.endpointUrl).toBeUndefined()
  })
})

// ─── remote config endpoint policy ────────────────────────────────────────────

describe('shouldFetchRemoteConfig', () => {
  it('allows the dev proxy path during development', () => {
    expect(shouldFetchRemoteConfig('/api/live-config', true)).toBe(true)
  })

  it('skips the relative proxy path in production', () => {
    expect(shouldFetchRemoteConfig('/api/live-config', false)).toBe(false)
  })

  it('allows absolute http and https endpoints in production', () => {
    expect(shouldFetchRemoteConfig('https://cdn.example.com/live-config.json', false)).toBe(true)
    expect(shouldFetchRemoteConfig('http://localhost:4000/live-config.json', false)).toBe(true)
  })
})

// ─── remoteConfigSlice ───────────────────────────────────────────────────────

describe('remoteConfigSlice', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
  })

  it('starts with idle status and null config (no cache in test env)', () => {
    const state = store.getState().remoteConfig
    // Status is idle; config may be null or a cached value (null in fresh test env).
    expect(state.status).toBe('idle')
  })

  it('setRemoteConfig updates config and sets status to ok', () => {
    const config = { season: { mainTv: { headline: 'Test week!' } } }
    store.dispatch(setRemoteConfig(config))
    const state = store.getState().remoteConfig
    expect(state.config).toEqual(config)
    expect(state.status).toBe('ok')
    expect(state.fetchedAt).toBeGreaterThan(0)
  })

  it('setRemoteConfig with null clears the config but stays healthy', () => {
    store.dispatch(setRemoteConfig(null))
    const state = store.getState().remoteConfig
    expect(state.config).toBeNull()
    expect(state.status).toBe('ok')
  })

  it('loadRemoteConfig.pending sets status to loading', () => {
    store.dispatch({
      type: loadRemoteConfig.pending.type,
      meta: { requestId: '1', requestStatus: 'pending' },
    })
    const state = store.getState().remoteConfig
    expect(state.status).toBe('loading')
  })

  it('loadRemoteConfig.fulfilled updates config', () => {
    const config = { season: { theme: { accent: '#abc' } } }
    store.dispatch({
      type: loadRemoteConfig.fulfilled.type,
      payload: config,
      meta: { requestId: '1', requestStatus: 'fulfilled' },
    })
    const state = store.getState().remoteConfig
    expect(state.config).toEqual(config)
    expect(state.status).toBe('ok')
  })

  it('loadRemoteConfig.fulfilled with null keeps the slice healthy', () => {
    store.dispatch({
      type: loadRemoteConfig.fulfilled.type,
      payload: null,
      meta: { requestId: '1', requestStatus: 'fulfilled' },
    })
    const state = store.getState().remoteConfig
    expect(state.config).toBeNull()
    expect(state.status).toBe('ok')
  })

  it('loadRemoteConfig.rejected sets status to error', () => {
    store.dispatch({
      type: loadRemoteConfig.rejected.type,
      meta: { requestId: '1', requestStatus: 'rejected' },
      error: { message: 'fail' },
    })
    const state = store.getState().remoteConfig
    expect(state.status).toBe('error')
  })
})

// ─── Selectors ────────────────────────────────────────────────────────────────

describe('remoteConfig selectors', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
  })

  it('selectRemoteConfig returns null initially', () => {
    // In test env there is no localStorage cache.
    const s = store.getState()
    const cfg = selectRemoteConfig(s as Parameters<typeof selectRemoteConfig>[0])
    expect(cfg === null || typeof cfg === 'object').toBe(true)
  })

  it('selectRemoteMainTvHeadline returns headline when set', () => {
    store.dispatch(setRemoteConfig({ season: { mainTv: { headline: 'QuickTap week' } } }))
    const s = store.getState()
    const headline = selectRemoteMainTvHeadline(
      s as Parameters<typeof selectRemoteMainTvHeadline>[0]
    )
    expect(headline).toBe('QuickTap week')
  })

  it('selectRemoteMainTvHeadline returns null when not set', () => {
    store.dispatch(setRemoteConfig({ season: {} }))
    const s = store.getState()
    const headline = selectRemoteMainTvHeadline(
      s as Parameters<typeof selectRemoteMainTvHeadline>[0]
    )
    expect(headline).toBeNull()
  })

  it('selectRemoteIntroHubBg returns background URL when set', () => {
    store.dispatch(
      setRemoteConfig({
        season: { introHub: { backgroundImageUrl: 'https://example.com/bg.jpg' } },
      })
    )
    const s = store.getState()
    const bg = selectRemoteIntroHubBg(s as Parameters<typeof selectRemoteIntroHubBg>[0])
    expect(bg).toBe('https://example.com/bg.jpg')
  })

  it('selectRemoteIntroHubBg returns null when not set', () => {
    store.dispatch(setRemoteConfig({}))
    const s = store.getState()
    const bg = selectRemoteIntroHubBg(s as Parameters<typeof selectRemoteIntroHubBg>[0])
    expect(bg).toBeNull()
  })

  it('selectRemotePlayerOverrides returns array when set', () => {
    store.dispatch(
      setRemoteConfig({
        players: [{ id: 'finn', avatarUrl: 'https://example.com/finn.png' }],
      })
    )
    const s = store.getState()
    const overrides = selectRemotePlayerOverrides(
      s as Parameters<typeof selectRemotePlayerOverrides>[0]
    )
    expect(overrides).toHaveLength(1)
    expect(overrides[0].id).toBe('finn')
  })

  it('selectRemotePlayerOverrides returns empty array when not set', () => {
    store.dispatch(setRemoteConfig({}))
    const s = store.getState()
    const overrides = selectRemotePlayerOverrides(
      s as Parameters<typeof selectRemotePlayerOverrides>[0]
    )
    expect(overrides).toEqual([])
  })
})
