import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuickTapRaceAudio } from '../../../src/hooks/useQuickTapRaceAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';

describe('useQuickTapRaceAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'play').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not request or release minigame music directly', () => {
    const requestSpy = vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
    const releaseSpy = vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});

    const { rerender, unmount } = renderHook(
      ({ isPlaying }) => useQuickTapRaceAudio(isPlaying),
      { initialProps: { isPlaying: false } },
    );

    rerender({ isPlaying: true });
    rerender({ isPlaying: false });
    unmount();

    expect(requestSpy).not.toHaveBeenCalled();
    expect(releaseSpy).not.toHaveBeenCalled();
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
