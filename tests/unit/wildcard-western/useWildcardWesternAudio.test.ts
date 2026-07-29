import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWildcardWesternAudio } from '../../../src/hooks/useWildcardWesternAudio'
import { SoundManager } from '../../../src/services/sound/SoundManager'
import { SOUND_REGISTRY } from '../../../src/services/sound/sounds'

describe('useWildcardWesternAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'play').mockResolvedValue()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not request or release BGM directly any more', () => {
    const requestSpy = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {})
    const releaseSpy = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {})

    const { rerender, unmount } = renderHook(
      ({ shouldPlayMusic }) => useWildcardWesternAudio(shouldPlayMusic),
      { initialProps: { shouldPlayMusic: false } }
    )

    rerender({ shouldPlayMusic: true })
    rerender({ shouldPlayMusic: false })
    unmount()

    expect(requestSpy).not.toHaveBeenCalled()
    expect(releaseSpy).not.toHaveBeenCalled()
  })

  it('exposes callbacks for all Wildcard Western sound effects', () => {
    const { result } = renderHook(() => useWildcardWesternAudio(true))

    act(() => {
      result.current.playSelect()
      result.current.playDraw()
      result.current.playEliminated()
      result.current.playWinner()
      result.current.playContinue()
      result.current.playNewRound()
    })

    expect(SoundManager.play).toHaveBeenCalledWith('ui:wildcard_select')
    expect(SoundManager.play).toHaveBeenCalledWith('ui:wildcard_draw')
    expect(SoundManager.play).toHaveBeenCalledWith('player:wildcard_eliminated')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:wildcard_winner')
    expect(SoundManager.play).toHaveBeenCalledWith('ui:wildcard_continue')
    expect(SoundManager.play).toHaveBeenCalledWith('ui:western_new_round')
  })

  it('registers all Wildcard Western sound keys in SOUND_REGISTRY', () => {
    expect(SOUND_REGISTRY['music:wildcard_western_main']).toBeDefined()
    expect(SOUND_REGISTRY['ui:wildcard_select']).toBeDefined()
    expect(SOUND_REGISTRY['ui:wildcard_draw']).toBeDefined()
    expect(SOUND_REGISTRY['player:wildcard_eliminated']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:wildcard_winner']).toBeDefined()
    expect(SOUND_REGISTRY['ui:wildcard_continue']).toBeDefined()
    expect(SOUND_REGISTRY['ui:western_new_round']).toBeDefined()
  })

  it('routes Wildcard Western music through assets/music and cues through assets/sounds', () => {
    expect(SOUND_REGISTRY['music:wildcard_western_main'].src).toContain('/assets/music/')

    const effectKeys = [
      'ui:wildcard_select',
      'ui:wildcard_draw',
      'player:wildcard_eliminated',
      'minigame:wildcard_winner',
      'ui:wildcard_continue',
      'ui:western_new_round',
    ] as const
    for (const key of effectKeys) {
      expect(SOUND_REGISTRY[key].src, `${key} should use the short-sound root`).toContain(
        '/assets/sounds/'
      )
    }
  })

  it('background music entry has loop=true', () => {
    expect(SOUND_REGISTRY['music:wildcard_western_main'].loop).toBe(true)
  })
})
