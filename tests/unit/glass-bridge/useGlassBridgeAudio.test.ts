import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlassBridgeAudio } from '../../../src/hooks/useGlassBridgeAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';
import { SOUND_REGISTRY, SOUNDS_BASE } from '../../../src/services/sound/sounds';

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

  it('sound registry src paths use SOUNDS_BASE for production-safe URL resolution', () => {
    // SOUNDS_BASE is derived from import.meta.env.BASE_URL; in the test
    // environment BASE_URL defaults to '/', so SOUNDS_BASE = '/assets/sounds/'.
    // In production (GitHub Pages) BASE_URL = '/bbmobilenew/', so paths would
    // be '/bbmobilenew/assets/sounds/...'.  Either way every src must start
    // with SOUNDS_BASE to avoid 404s.
    const gbKeys = [
      'music:gb_main',
      'minigame:gb_safe_step',
      'minigame:gb_death',
      'minigame:gb_winner',
      'minigame:gb_new_turn',
    ] as const;
    for (const key of gbKeys) {
      expect(SOUND_REGISTRY[key].src.startsWith(SOUNDS_BASE)).toBe(true);
    }
    // Also verify a sample of global sound keys use the same base
    expect(SOUND_REGISTRY['ui:navigate'].src.startsWith(SOUNDS_BASE)).toBe(true);
    expect(SOUND_REGISTRY['tv:event'].src.startsWith(SOUNDS_BASE)).toBe(true);
    expect(SOUND_REGISTRY['ui:confirm'].src.startsWith(SOUNDS_BASE)).toBe(true);
  });
});
