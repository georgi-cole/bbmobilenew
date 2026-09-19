import { describe, expect, it } from 'vitest'
import { SCENARIO_VARIANT_POOLS } from '../interactionVariantBank'
import { getHumanFacingActionScenario } from '../socialAIDriver'

describe('AI background incoming content', () => {
  it('routes background AI actions into contextual scenario banks', () => {
    for (const actionId of [
      'proposeAlliance',
      'whisper',
      'confront',
      'ask_use_safety',
      'nominate',
      'group_chat',
    ]) {
      const scenarioKey = getHumanFacingActionScenario(actionId)
      expect(scenarioKey).not.toMatch(/^background_/)
      expect(SCENARIO_VARIANT_POOLS[scenarioKey]?.length).toBeGreaterThan(0)
    }
  })

  it('gives unknown background actions a rich check-in scene instead of generic fallback text', () => {
    expect(getHumanFacingActionScenario('unknown_action')).toBe('generic_check_in')
  })
})
