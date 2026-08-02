import { describe, expect, it } from 'vitest'
import { chooseClassicTwinHintPortraits } from '../../../src/minigames/castleRescue/castleRescueGallery'

describe('Find Your Twin classic memory-wall hint', () => {
  it('always separates Lia from her mirrored counterpart with another portrait', () => {
    const portraits = chooseClassicTwinHintPortraits([5, 0, 9, 3])

    expect(portraits).toHaveLength(4)
    expect(portraits[0]).toEqual({
      name: 'LIA',
      file: 'Lia_avatar.webp',
      mirrored: false,
    })
    expect(portraits[2]).toEqual({
      name: 'ALI',
      file: 'Lia_avatar.webp',
      mirrored: true,
    })
  })

  it('uses two distinct non-Lia portraits from the seeded room selection', () => {
    const portraits = chooseClassicTwinHintPortraits([0, 8, 8, 12])

    expect([portraits[1].name, portraits[3].name]).toEqual(['RAE', 'FINN'])
    expect(new Set([portraits[1].file, portraits[3].file]).size).toBe(2)
  })
})
