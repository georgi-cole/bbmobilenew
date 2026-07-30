import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlassBridgeAudio } from '../../../src/hooks/useGlassBridgeAudio'
import { SoundManager } from '../../../src/services/sound/SoundManager'
import { SOUND_REGISTRY } from '../../../src/services/sound/sounds'

describe('useGlassBridgeAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'play').mockResolvedValue()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not directly request background music any more', () => {
    const requestSpy = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {})
    const releaseSpy = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {})

    const { rerender, unmount } = renderHook(
      ({ shouldPlayMusic }) => useGlassBridgeAudio(shouldPlayMusic),
      { initialProps: { shouldPlayMusic: false } }
    )

    rerender({ shouldPlayMusic: true })
    rerender({ shouldPlayMusic: false })
    unmount()

    expect(requestSpy).not.toHaveBeenCalled()
    expect(releaseSpy).not.toHaveBeenCalled()
  })

  it('exposes callbacks for Glass Bridge step, death, winner, and turn sounds', () => {
    const { result } = renderHook(() => useGlassBridgeAudio(true))

    act(() => {
      result.current.playSafeStep()
      result.current.playDeath()
      result.current.playWinner()
      result.current.playNewTurn()
    })

    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_safe_step')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_death')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_winner')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_new_turn')
  })

  it('registers all Glass Bridge sound keys', () => {
    expect(SOUND_REGISTRY['music:gb_main']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:gb_safe_step']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:gb_death']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:gb_winner']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:gb_new_turn']).toBeDefined()
  })

  it('routes background music through assets/music and effects through assets/sounds', () => {
    expect(SOUND_REGISTRY['music:gb_main'].src).toContain('/assets/music/')

    const effectKeys = [
      'minigame:gb_safe_step',
      'minigame:gb_death',
      'minigame:gb_winner',
      'minigame:gb_new_turn',
      'ui:navigate',
      'tv:event',
      'ui:confirm',
    ] as const
    for (const key of effectKeys) {
      expect(SOUND_REGISTRY[key].src, `${key} should use the short-sound root`).toContain(
        '/assets/sounds/'
      )
    }
  })
})
