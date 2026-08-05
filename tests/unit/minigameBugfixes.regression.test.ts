import { describe, expect, it } from 'vitest'
import {
  PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH,
  getPressurePlankGaugeSafeZoneBounds,
  getPressurePlankStabilityDamagePerSecond,
} from '../../src/components/PressurePlank/pressurePlankLogic'
import { normalizeTiltDelta } from '../../src/components/TiltLabyrinthComp/TiltLabyrinthComp'

describe('minigame bug-fix regressions', () => {
  it('renders the minimum Pressure Plank safe zone on the same scale as its damage bounds', () => {
    const bounds = getPressurePlankGaugeSafeZoneBounds(
      PRESSURE_PLANK_SAFE_ZONE_MIN_HALF_WIDTH,
      100,
    )
    expect(bounds.leftPercent).toBe(49)
    expect(bounds.widthPercent).toBe(2)
    expect(getPressurePlankStabilityDamagePerSecond(2, 2, 92)).toBe(0)
    expect(getPressurePlankStabilityDamagePerSecond(3, 2, 92)).toBeGreaterThan(0)
  })

  it('keeps a neutral orientation reading neutral and applies a dead zone', () => {
    expect(normalizeTiltDelta(0)).toBe(0)
    expect(normalizeTiltDelta(1)).toBe(0)
    expect(normalizeTiltDelta(-1)).toBe(0)
    expect(normalizeTiltDelta(15)).toBeGreaterThan(0)
    expect(normalizeTiltDelta(-15)).toBeLessThan(0)
  })
})
