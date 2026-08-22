import { afterEach, describe, expect, it } from 'vitest'
import {
  buildEffectiveSocialActions,
  getActionAffinityEffects,
  getDefaultRealityEffects,
  isActionAllowedForRealityPreset,
  getRuntimeSocialActionById,
  sanitiseSocialActionOverrides,
  setRuntimeSocialActionOverrides,
} from '../socialActionManager'
import { adaptLegacyActionContract } from '../reality/actionContract'
import { computeOutcomeDelta } from '../SocialPolicy'

afterEach(() => setRuntimeSocialActionOverrides({}))

describe('Social Manager action overrides', () => {
  it('sanitises known actions and rejects unknown actions and relationship dimensions', () => {
    const result = sanitiseSocialActionOverrides({
      compliment: {
        title: '  Build Trust  ',
        baseCost: { energy: 2, influence: 3 },
        realityEffects: {
          accepted: { warmth: 11, madeUpDimension: 99 },
        },
      },
      invented_action: { title: 'Nope' },
    })

    expect(result).toEqual({
      compliment: {
        title: 'Build Trust',
        baseCost: { energy: 2, influence: 3 },
        realityEffects: { accepted: { warmth: 11 } },
      },
    })
  })

  it('builds effective definitions without mutating bundled defaults', () => {
    const [original] = buildEffectiveSocialActions()
    const [effective] = buildEffectiveSocialActions({
      compliment: {
        title: 'Warm Compliment',
        affinityEffects: { success: 12, failure: -1 },
      },
    })

    expect(original.title).toBe('Compliment')
    expect(effective.title).toBe('Warm Compliment')
    expect(getActionAffinityEffects(effective)).toEqual({ success: 12, failure: -1 })
  })

  it('makes enabled and disabled overrides authoritative at runtime', () => {
    setRuntimeSocialActionOverrides({
      compliment: { enabled: false },
      whisper: { title: 'Quiet Deal' },
    })

    expect(getRuntimeSocialActionById('compliment')).toBeUndefined()
    expect(getRuntimeSocialActionById('compliment', { includeDisabled: true })?.enabled).toBe(false)
    expect(getRuntimeSocialActionById('whisper')?.title).toBe('Quiet Deal')
  })

  it('feeds per-action affinity effects into live outcome resolution', () => {
    setRuntimeSocialActionOverrides({
      compliment: { affinityEffects: { success: 17, failure: -4 } },
    })

    expect(computeOutcomeDelta('compliment', 'actor', 'target', 'success')).toBe(17)
    expect(computeOutcomeDelta('compliment', 'actor', 'target', 'failure')).toBe(-4)
  })

  it('supports per-action Reality intensity subtype connections', () => {
    const action = buildEffectiveSocialActions({
      compliment: { allowedRealityPresets: ['adult'] },
    }).find((candidate) => candidate.id === 'compliment')!

    expect(isActionAllowedForRealityPreset(action, 'tv')).toBe(false)
    expect(isActionAllowedForRealityPreset(action, 'adult')).toBe(true)
  })

  it('projects contract connections and multidimensional effects into Reality execution data', () => {
    const action = buildEffectiveSocialActions({
      flirt: {
        realityAllowedGameModes: ['SURVIVAL'],
        realityPurposes: ['ROMANCE', 'PERFORM'],
        realityVisibility: 'HOUSE_PUBLIC',
        realityCooldownPhases: 5,
        responseSetId: 'custom_romance_response',
        realityEffects: {
          accepted: { attraction: 20, trust: 7 },
          rejected: { suspicion: 6 },
        },
      },
    }).find((candidate) => candidate.id === 'flirt')!

    const contract = adaptLegacyActionContract(action)
    const effects = getDefaultRealityEffects(action)

    expect(contract.allowedGameModes).toEqual(['SURVIVAL'])
    expect(contract.purposes).toEqual(['ROMANCE', 'PERFORM'])
    expect(contract.visibility).toBe('HOUSE_PUBLIC')
    expect(contract.cooldownPhases).toBe(5)
    expect(contract.responseSetId).toBe('custom_romance_response')
    expect(effects.accepted).toMatchObject({ attraction: 20, trust: 7 })
    expect(effects.rejected).toMatchObject({ suspicion: 6 })
  })
})
