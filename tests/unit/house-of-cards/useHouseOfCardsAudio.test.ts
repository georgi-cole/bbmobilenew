import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHouseOfCardsAudio } from '../../../src/hooks/useHouseOfCardsAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';

describe('useHouseOfCardsAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'requestBgm').mockImplementation(() => {});
    vi.spyOn(SoundManager, 'releaseBgm').mockImplementation(() => {});
    vi.spyOn(SoundManager, 'play').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the House of Cards music loop while active and releases minigame ownership when inactive', () => {
    const { rerender, unmount } = renderHook(
      ({ isPlaying }) => useHouseOfCardsAudio(isPlaying),
      { initialProps: { isPlaying: false } },
    );

    expect(SoundManager.requestBgm).not.toHaveBeenCalled();

    rerender({ isPlaying: true });

    expect(SoundManager.requestBgm).toHaveBeenCalledWith('music:quicktap_main', 'minigame');

    rerender({ isPlaying: false });

    expect(SoundManager.releaseBgm).toHaveBeenCalledTimes(1);
    expect(SoundManager.releaseBgm).toHaveBeenLastCalledWith('minigame');

    unmount();

    expect(SoundManager.releaseBgm).toHaveBeenCalledTimes(1);
  });

  it('releases minigame music on unmount while active', () => {
    const { unmount } = renderHook(() => useHouseOfCardsAudio(true));

    expect(SoundManager.requestBgm).toHaveBeenCalledWith('music:quicktap_main', 'minigame');

    unmount();

    expect(SoundManager.releaseBgm).toHaveBeenCalledTimes(1);
    expect(SoundManager.releaseBgm).toHaveBeenLastCalledWith('minigame');
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
