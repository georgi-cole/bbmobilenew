import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRiskWheelAudio } from '../../../src/hooks/useRiskWheelAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';
import { SOUND_REGISTRY, SOUNDS_BASE } from '../../../src/services/sound/sounds';

describe('useRiskWheelAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'playMusic').mockResolvedValue();
    vi.spyOn(SoundManager, 'stopMusic').mockImplementation(() => {});
    vi.spyOn(SoundManager, 'play').mockResolvedValue();
    vi.spyOn(SoundManager, 'stop').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts background music on mount and stops music/spin audio on unmount', () => {
    const { unmount } = renderHook(() => useRiskWheelAudio());

    expect(SoundManager.playMusic).toHaveBeenCalledWith('music:risk_wheel_loop');

    unmount();

    expect(SoundManager.stop).toHaveBeenCalledWith('minigame:wheelofluck');
    expect(SoundManager.stopMusic).toHaveBeenCalled();
  });

  it('exposes callbacks for all Risk Wheel sound effects', () => {
    const { result } = renderHook(() => useRiskWheelAudio());

    act(() => {
      result.current.startWheelSound();
      result.current.stopWheelSound();
      result.current.playGoodRewardSound();
      result.current.playBadRewardSound();
      result.current.play666Sound();
      result.current.playBankruptOrSkipSound();
      result.current.playScoreboardRevealSound();
      result.current.playWinnerRevealSound();
      result.current.playStopAndBankSound();
      result.current.playClickSound();
    });

    expect(SoundManager.play).toHaveBeenCalledWith('minigame:wheelofluck');
    expect(SoundManager.stop).toHaveBeenCalledWith('minigame:wheelofluck');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_good');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_bad');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_666');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_bankrupt_or_skip');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_scoreboard');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_winner');
    expect(SoundManager.play).toHaveBeenCalledWith('ui:risk_wheel_stop_and_bank');
    expect(SoundManager.play).toHaveBeenCalledWith('ui:risk_wheel_click');
  });

  it('registers all Risk Wheel sound keys in SOUND_REGISTRY', () => {
    expect(SOUND_REGISTRY['music:risk_wheel_loop']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:wheelofluck']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_good']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_bad']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_666']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_bankrupt_or_skip']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_scoreboard']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_winner']).toBeDefined();
    expect(SOUND_REGISTRY['ui:risk_wheel_stop_and_bank']).toBeDefined();
    expect(SOUND_REGISTRY['ui:risk_wheel_click']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:all_3_seconds_timer']).toBeDefined();
  });

  it('sound registry src paths use SOUNDS_BASE and point into the Risk_wheel subfolder', () => {
    const rwKeys = [
      'music:risk_wheel_loop',
      'minigame:wheelofluck',
      'minigame:risk_wheel_good',
      'minigame:risk_wheel_bad',
      'minigame:risk_wheel_666',
      'minigame:risk_wheel_bankrupt_or_skip',
      'minigame:risk_wheel_scoreboard',
      'minigame:risk_wheel_winner',
      'ui:risk_wheel_stop_and_bank',
      'ui:risk_wheel_click',
      'minigame:all_3_seconds_timer',
    ] as const;
    for (const key of rwKeys) {
      const entry = SOUND_REGISTRY[key];
      expect(entry.src.startsWith(SOUNDS_BASE), `${key} src should start with SOUNDS_BASE`).toBe(true);
      expect(entry.src.includes('Risk_wheel/'), `${key} src should reference the Risk_wheel subfolder`).toBe(true);
    }
  });

  it('background music entry has loop=true and wheel spin entry has loop=true', () => {
    expect(SOUND_REGISTRY['music:risk_wheel_loop'].loop).toBe(true);
    expect(SOUND_REGISTRY['minigame:wheelofluck'].loop).toBe(true);
  });
});
