import { beforeEach, describe, expect, it } from 'vitest'
import { SOCIAL_INITIAL_STATE } from '../constants'
import { createIncomingInteraction } from '../incomingInteractionFactory'
import { getEffectiveSocialMode, getInteractionSocialMode } from '../socialMode'
import {
  DEFAULT_SOCIAL_RUNTIME_CONFIG,
  getIncomingInteractionResponsePolicy,
  getSocialRuntimeConfig,
  sanitiseSocialRuntimeOverride,
  setRemoteSocialRuntimeConfig,
} from '../socialRuntimeConfig'
import { migrateSocialState } from '../socialStateMigration'
import { normalizeActionCosts } from '../smExecNormalize'
import { SOCIAL_ACTIONS } from '../socialActions'
import { computeOutcomeScore } from '../SocialPolicy'
import type { SocialState } from '../types'

function action(id: string) {
  const found = SOCIAL_ACTIONS.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing social action ${id}`)
  return found
}

describe('Social premium hardening', () => {
  beforeEach(() => {
    setRemoteSocialRuntimeConfig(null)
  })

  it('requires entitlement or admin access and activates a new purchase immediately', () => {
    expect(
      getEffectiveSocialMode({
        settings: { gameUX: { dramaMode: true } },
        vip: { isActive: false, entitlements: { dramaMode: false } },
      })
    ).toBe('normal')

    expect(
      getEffectiveSocialMode({
        game: { dramaSocialMode: false },
        settings: { gameUX: { dramaMode: true } },
        vip: { entitlements: { dramaMode: true } },
      })
    ).toBe('drama')

    expect(
      getEffectiveSocialMode({
        game: { dramaSocialMode: false },
        settings: {
          gameUX: { dramaMode: true, dramaModeAdminOverride: true },
        },
        vip: { isActive: false, entitlements: { dramaMode: false } },
      })
    ).toBe('drama')

    expect(
      getEffectiveSocialMode({
        game: { dramaSocialMode: true },
        settings: { gameUX: { dramaMode: false } },
        vip: { entitlements: { dramaMode: true } },
      })
    ).toBe('normal')
  })

  it('keeps an incoming interaction on the ruleset under which it was authored', () => {
    const interaction = createIncomingInteraction({
      id: 'authored-drama',
      fromId: 'finn',
      type: 'check_in',
      text: 'We should talk.',
      week: 2,
      phase: 'social_1',
      mode: 'drama',
    })

    expect(
      getInteractionSocialMode(interaction, {
        game: { dramaSocialMode: false },
        settings: { gameUX: { dramaMode: false } },
      })
    ).toBe('drama')
    expect(interaction.payload?.rulesetVersion).toBe(1)
    expect(interaction.payload?.modeAtCreation).toBe('drama')
  })

  it('keeps congratulations optional while preserving explicit read-only updates', () => {
    const required = createIncomingInteraction({
      id: 'required',
      fromId: 'finn',
      type: 'deal_offer',
      text: 'Deal?',
      week: 1,
      phase: 'social_1',
      mode: 'normal',
    })
    const congratulations = createIncomingInteraction({
      id: 'congratulations',
      fromId: 'finn',
      type: 'compliment',
      text: 'Good job.',
      week: 1,
      phase: 'loh_results',
      mode: 'normal',
      payload: { scenarioKey: 'hoh_congratulations' },
    })
    const readOnly = createIncomingInteraction({
      id: 'read-only',
      fromId: 'finn',
      type: 'other',
      text: 'The house moved on.',
      week: 1,
      phase: 'week_start',
      mode: 'normal',
      responsePolicy: 'readOnly',
    })

    expect(getIncomingInteractionResponsePolicy(required)).toBe('required')
    expect(required.requiresResponse).toBe(true)
    expect(getIncomingInteractionResponsePolicy(congratulations)).toBe('optional')
    expect(congratulations.requiresResponse).toBe(false)
    expect(getIncomingInteractionResponsePolicy(readOnly)).toBe('readOnly')
    expect(readOnly.requiresResponse).toBe(false)
    expect(readOnly.expiresAtWeek).toBe(1)
    expect(
      getIncomingInteractionResponsePolicy({
        type: 'check_in',
        requiresResponse: true,
        payload: {},
      })
    ).toBe('required')
  })

  it('sanitises remotely editable Social data and preserves bundled invariants', () => {
    const override = sanitiseSocialRuntimeOverride({
      schemaVersion: 1,
      revision: 'test-remote',
      economy: {
        normal: { weeklyEnergy: 7, energyCap: 8, carryOver: true },
        drama: { weeklyEnergy: 12, energyCap: 36, carryOver: false },
      },
      content: {
        scenarioLines: {
          generic_check_in: ['A remotely managed but validated line.'],
        },
      },
      executableRule: 'never accepted',
    })
    setRemoteSocialRuntimeConfig(override)
    const runtime = getSocialRuntimeConfig()

    expect(runtime.revision).toBe('test-remote')
    expect(runtime.economy.normal.weeklyEnergy).toBe(7)
    expect(runtime.economy.normal.carryOver).toBe(false)
    expect(runtime.economy.drama.weeklyEnergy).toBe(12)
    expect(runtime.economy.drama.carryOver).toBe(true)
    expect(runtime.content.scenarioLines.generic_check_in).toEqual([
      'A remotely managed but validated line.',
    ])
    expect(runtime.schemaVersion).toBe(DEFAULT_SOCIAL_RUNTIME_CONFIG.schemaVersion)
  })

  it('migrates old saves, preserves gameplay history, and repairs invalid resources', () => {
    const legacy = {
      ...SOCIAL_INITIAL_STATE,
      socialStateVersion: undefined,
      actionHistory: undefined,
      energyBank: { user: 999, finn: -4 },
      influenceBank: { user: Number.NaN },
      infoBank: { user: Number.POSITIVE_INFINITY },
      sessionLogs: [
        {
          actionId: 'compliment',
          actorId: 'user',
          targetId: 'finn',
          cost: 1,
          delta: 5,
          outcome: 'success' as const,
          newEnergy: 4,
          timestamp: 100,
          source: 'manual' as const,
        },
      ],
    } as SocialState

    const migrated = migrateSocialState(legacy)
    expect(migrated.socialStateVersion).toBe(2)
    expect(migrated.energyBank.user).toBe(30)
    expect(migrated.energyBank.finn).toBe(0)
    expect(migrated.influenceBank.user).toBe(0)
    expect(migrated.infoBank.user).toBe(0)
    expect(migrated.actionHistory).toHaveLength(1)
    expect(migrated.sessionLogs).toHaveLength(1)
  })

  it('keeps Normal action costs Energy-only and Drama multi-resource', () => {
    const shareIntel = action('share_intel')
    expect(normalizeActionCosts(shareIntel, 1, false)).toEqual({
      energy: 1,
      influence: 0,
      info: 0,
    })
    expect(normalizeActionCosts(shareIntel, 1, true).info).toBeGreaterThan(0)
  })

  it('normalises display-scale affinity before applying outcome bias', () => {
    const score = computeOutcomeScore(
      'compliment',
      'user',
      'finn',
      'preview',
      { user: { finn: { affinity: 50, tags: [] } } },
      'success'
    )
    expect(score).toBeCloseTo(0.2, 5)
  })
})
