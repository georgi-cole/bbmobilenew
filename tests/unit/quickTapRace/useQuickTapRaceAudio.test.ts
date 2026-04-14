import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuickTapRaceAudio } from '../../../src/hooks/useQuickTapRaceAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';

describe('useQuickTapRaceAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
    vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});
    vi.spyOn(SoundManager, 'play').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests minigame music only while the race is playing', () => {
    const { rerender, unmount } = renderHook(
      ({ isPlaying }) => useQuickTapRaceAudio(isPlaying),
      { initialProps: { isPlaying: false } },
    );

    expect(SoundManager.requestBgm).not.toHaveBeenCalled();

    rerender({ isPlaying: true });

    expect(SoundManager.requestBgm).toHaveBeenCalledWith('music:quicktap_main', 'minigame');

    rerender({ isPlaying: false });

    expect(SoundManager.releaseBgm).toHaveBeenCalledWith('minigame');

    unmount();

    expect(SoundManager.releaseBgm).toHaveBeenCalledTimes(1);
  });

  it('exposes callbacks for tap, booster, and half-tap sounds', () => {
    const { result } = renderHook(() => useQuickTapRaceAudio(true));

    act(() => {
      result.current.playTap();
      result.current.playBooster();
      result.current.playHalfTap();
    });

    expect(SoundManager.play).toHaveBeenCalledWith('minigame:quicktap_tap');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:quicktap_booster');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:quicktap_half_tap');
  });
});
