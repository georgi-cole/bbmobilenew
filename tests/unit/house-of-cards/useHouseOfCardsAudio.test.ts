import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHouseOfCardsAudio } from '../../../src/hooks/useHouseOfCardsAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';

describe('useHouseOfCardsAudio', () => {
  let currentMusicKey: string | null;

  beforeEach(() => {
    currentMusicKey = null;
    vi.spyOn(SoundManager, 'playMusic').mockImplementation(async (key: string) => {
      currentMusicKey = key;
    });
    vi.spyOn(SoundManager, 'stopMusic').mockImplementation(() => {
      currentMusicKey = null;
    });
    vi.spyOn(SoundManager, 'play').mockResolvedValue();
    vi.spyOn(SoundManager, 'currentMusicKey', 'get').mockImplementation(() => currentMusicKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the House of Cards music loop and restores the previous track when inactive', () => {
    currentMusicKey = 'music:hoh_comp_general';

    const { rerender, unmount } = renderHook(
      ({ isPlaying }) => useHouseOfCardsAudio(isPlaying),
      { initialProps: { isPlaying: false } },
    );

    expect(SoundManager.playMusic).not.toHaveBeenCalled();

    rerender({ isPlaying: true });

    expect(SoundManager.playMusic).toHaveBeenCalledWith('music:quicktap_main');

    rerender({ isPlaying: false });

    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);
    expect(SoundManager.playMusic).toHaveBeenLastCalledWith('music:hoh_comp_general');

    unmount();

    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);
  });

  it('stops music on unmount while active and restores the previous track once', () => {
    currentMusicKey = 'music:hoh_comp_general';

    const { unmount } = renderHook(() => useHouseOfCardsAudio(true));

    expect(SoundManager.playMusic).toHaveBeenCalledWith('music:quicktap_main');

    unmount();

    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);
    expect(SoundManager.playMusic).toHaveBeenLastCalledWith('music:hoh_comp_general');
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
