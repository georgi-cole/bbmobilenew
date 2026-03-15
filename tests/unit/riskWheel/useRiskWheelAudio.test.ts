import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRiskWheelAudio } from '../../../src/hooks/useRiskWheelAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';
import { SOUND_REGISTRY } from '../../../src/services/sound/sounds';

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

  it('exposes callbacks for spin, reward, scoreboard, and winner sounds', () => {
    const { result } = renderHook(() => useRiskWheelAudio());

    act(() => {
      result.current.startWheelSound();
      result.current.stopWheelSound();
      result.current.playGoodRewardSound();
      result.current.playBadRewardSound();
      result.current.playScoreboardRevealSound();
      result.current.playWinnerRevealSound();
    });

    expect(SoundManager.play).toHaveBeenCalledWith('minigame:wheelofluck');
    expect(SoundManager.stop).toHaveBeenCalledWith('minigame:wheelofluck');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_good');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_bad');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_scoreboard');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_winner');
  });

  it('registers all Risk Wheel placeholder sound keys', () => {
    expect(SOUND_REGISTRY['music:risk_wheel_loop']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_good']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_bad']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_scoreboard']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:risk_wheel_winner']).toBeDefined();
  });
});
