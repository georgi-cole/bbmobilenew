import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHouseOfCardsAudio } from '../../../src/hooks/useHouseOfCardsAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';

describe('useHouseOfCardsAudio', () => {
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
      ({ isPlaying }) => useHouseOfCardsAudio(isPlaying),
      { initialProps: { isPlaying: false } },
    );

    rerender({ isPlaying: true });
    rerender({ isPlaying: false });
    unmount();

    expect(requestSpy).not.toHaveBeenCalled();
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('exposes callbacks for flip, match, mismatch, peek, and completion sounds', () => {
    const { result } = renderHook(() => useHouseOfCardsAudio(true));

    act(() => {
      result.current.playFlip();
      result.current.playMatch();
      result.current.playMismatch();
      result.current.playPeek();
      result.current.playComplete();
    });

    expect(SoundManager.play).toHaveBeenCalledWith('minigame:quicktap_tap');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:quicktap_booster');
    expect(SoundManager.play).toHaveBeenCalledWith('ui:error');
    expect(SoundManager.play).toHaveBeenCalledWith('tv:event');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:risk_wheel_winner');
  });
});
