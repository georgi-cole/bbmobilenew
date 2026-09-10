import { describe, expect, it } from 'vitest'
import { selectCinematicQuality } from '../../src/cinematic/config/cinematicQuality'

describe('credits cinematic quality routing', () => {
  it('uses the smooth adaptive renderer for phone-shaped and touch playback', () => {
    expect(
      selectCinematicQuality({
        isPlayer: true,
        cores: 12,
        memory: 16,
        coarsePointer: true,
        compactViewport: false,
      })
    ).toBe('performance')

    expect(
      selectCinematicQuality({
        isPlayer: true,
        cores: 12,
        memory: 16,
        coarsePointer: false,
        compactViewport: true,
      })
    ).toBe('performance')
  })

  it('protects constrained devices even when the viewport is wide', () => {
    expect(
      selectCinematicQuality({
        isPlayer: true,
        cores: 4,
        memory: 4,
        coarsePointer: false,
        compactViewport: false,
      })
    ).toBe('performance')
  })

  it('keeps live WebGL for capable wide-screen playback and offline rendering', () => {
    expect(
      selectCinematicQuality({
        isPlayer: true,
        cores: 8,
        memory: 8,
        coarsePointer: false,
        compactViewport: false,
      })
    ).toBe('balanced')

    expect(
      selectCinematicQuality({
        isPlayer: true,
        cores: 16,
        memory: 16,
        coarsePointer: false,
        compactViewport: false,
      })
    ).toBe('high')

    expect(
      selectCinematicQuality({
        isPlayer: false,
        cores: 2,
        memory: 2,
        coarsePointer: true,
        compactViewport: true,
      })
    ).toBe('high')
  })
})
