import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlassBridgeAudio } from '../../../src/hooks/useGlassBridgeAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';
import { SOUND_REGISTRY } from '../../../src/services/sound/sounds';

describe('useGlassBridgeAudio', () => {
  beforeEach(() => {
    vi.spyOn(SoundManager, 'playMusic').mockResolvedValue();
    vi.spyOn(SoundManager, 'stopMusic').mockImplementation(() => {});
    vi.spyOn(SoundManager, 'play').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts background music when the minigame becomes active and stops it when inactive', () => {
    const { rerender, unmount } = renderHook(
      ({ shouldPlayMusic }) => useGlassBridgeAudio(shouldPlayMusic),
      { initialProps: { shouldPlayMusic: false } },
    );

    expect(SoundManager.playMusic).not.toHaveBeenCalled();

    rerender({ shouldPlayMusic: true });

    expect(SoundManager.playMusic).toHaveBeenCalledWith('music:gb_main');

    rerender({ shouldPlayMusic: false });

    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);

    unmount();

    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);
  });

  it('exposes callbacks for Glass Bridge step, death, winner, and turn sounds', () => {
    const { result } = renderHook(() => useGlassBridgeAudio(true));

    act(() => {
      result.current.playSafeStep();
      result.current.playDeath();
      result.current.playWinner();
      result.current.playNewTurn();
    });

    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_safe_step');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_death');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_winner');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:gb_new_turn');
  });

  it('registers all Glass Bridge sound keys', () => {
    expect(SOUND_REGISTRY['music:gb_main']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:gb_safe_step']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:gb_death']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:gb_winner']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:gb_new_turn']).toBeDefined();
  });
});
