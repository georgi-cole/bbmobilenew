import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRiskWheelAudio } from '../../../src/hooks/useRiskWheelAudio'
import { SoundManager } from '../../../src/services/sound/SoundManager'
import { SOUND_REGISTRY } from '../../../src/services/sound/sounds'

describe('useRiskWheelAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'play').mockResolvedValue()
    vi.spyOn(SoundManager, 'stop').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not directly start or stop background music', () => {
    const requestSpy = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {})
    const releaseSpy = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {})

    const { rerender, unmount } = renderHook(
      ({ shouldPlayMusic }) => useRiskWheelAudio(shouldPlayMusic),
      { initialProps: { shouldPlayMusic: false } }
    )

    rerender({ shouldPlayMusic: true })
    unmount()

    expect(requestSpy).not.toHaveBeenCalled()
    expect(releaseSpy).not.toHaveBeenCalled()
  })

  it('exposes callbacks for all Risk Wheel sound effects', () => {
    const { result } = renderHook(() => useRiskWheelAudio(true))

    act(() => {
      result.current.startWheelSound()
      result.current.stopWheelSound()
      result.current.playGoodRewardSound()
      result.current.playBadRewardSound()
      result.current.play666Sound()
      result.current.playBankruptOrSkipSound()
      result.current.playScoreboardRevealSound()
      result.current.playWinnerRevealSound()
      result.current.playStopAndBankSound()
      result.current.playClickSound()
    })

    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_spin')
    expect(SoundManager.stop).toHaveBeenCalledWith('minigame:risk_wheel_spin')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_good')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_bad')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_666')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_bankrupt_or_skip')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_scoreboard')
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_winner')
    expect(SoundManager.play).toHaveBeenCalledWith('ui:risk_wheel_stop_and_bank')
    expect(SoundManager.play).toHaveBeenCalledWith('ui:risk_wheel_click')
  })

  it('registers all Risk Wheel sound keys in SOUND_REGISTRY', () => {
    expect(SOUND_REGISTRY['music:risk_wheel_loop']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_spin']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_spin']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_good']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_bad']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_666']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_bankrupt_or_skip']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_scoreboard']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:risk_wheel_winner']).toBeDefined()
    expect(SOUND_REGISTRY['ui:risk_wheel_stop_and_bank']).toBeDefined()
    expect(SOUND_REGISTRY['ui:risk_wheel_click']).toBeDefined()
    expect(SOUND_REGISTRY['minigame:all_3_seconds_timer']).toBeDefined()
  })

  it('routes Risk Wheel music through assets/music and cues through assets/sounds', () => {
    expect(SOUND_REGISTRY['music:risk_wheel_loop'].src).toContain('/assets/music/')

    const effectKeys = [
      'minigame:risk_wheel_spin',
      'minigame:risk_wheel_spin',
      'minigame:risk_wheel_good',
      'minigame:risk_wheel_bad',
      'minigame:risk_wheel_666',
      'minigame:risk_wheel_bankrupt_or_skip',
      'minigame:risk_wheel_scoreboard',
      'minigame:risk_wheel_winner',
      'ui:risk_wheel_stop_and_bank',
      'ui:risk_wheel_click',
      'minigame:all_3_seconds_timer',
    ] as const
    for (const key of effectKeys) {
      expect(SOUND_REGISTRY[key].src, `${key} should use the short-sound root`).toContain(
        '/assets/sounds/'
      )
    }
  })

  it('background music and wheel spin entries both loop', () => {
    expect(SOUND_REGISTRY['music:risk_wheel_loop'].loop).toBe(true)
    expect(SOUND_REGISTRY['minigame:risk_wheel_spin'].loop).toBe(true)
    expect(SOUND_REGISTRY['minigame:risk_wheel_spin'].loop).toBe(true)
  })
})
