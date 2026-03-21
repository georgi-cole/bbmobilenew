import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWildcardWesternAudio } from '../../../src/hooks/useWildcardWesternAudio';
import { SoundManager } from '../../../src/services/sound/SoundManager';
import { SOUND_REGISTRY, SOUNDS_BASE } from '../../../src/services/sound/sounds';

describe('useWildcardWesternAudio', () => {
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
      ({ shouldPlayMusic }) => useWildcardWesternAudio(shouldPlayMusic),
      { initialProps: { shouldPlayMusic: false } },
    );

    expect(SoundManager.playMusic).not.toHaveBeenCalled();

    rerender({ shouldPlayMusic: true });

    expect(SoundManager.playMusic).toHaveBeenCalledWith('music:wildcard_western_main');

    rerender({ shouldPlayMusic: false });

    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);

    unmount();

    // stopMusic already called by the effect cleanup; should not be called again
    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);
  });

  it('stops music on unmount while still active', () => {
    const { unmount } = renderHook(() => useWildcardWesternAudio(true));

    expect(SoundManager.playMusic).toHaveBeenCalledWith('music:wildcard_western_main');

    unmount();

    expect(SoundManager.stopMusic).toHaveBeenCalledTimes(1);
  });

  it('exposes callbacks for all Wildcard Western sound effects', () => {
    const { result } = renderHook(() => useWildcardWesternAudio(true));

    act(() => {
      result.current.playSelect();
      result.current.playDraw();
      result.current.playEliminated();
      result.current.playWinner();
      result.current.playContinue();
      result.current.playNewRound();
    });

    expect(SoundManager.play).toHaveBeenCalledWith('ui:wildcard_select');
    expect(SoundManager.play).toHaveBeenCalledWith('ui:wildcard_draw');
    expect(SoundManager.play).toHaveBeenCalledWith('player:wildcard_eliminated');
    expect(SoundManager.play).toHaveBeenCalledWith('minigame:wildcard_winner');
    expect(SoundManager.play).toHaveBeenCalledWith('ui:wildcard_continue');
    expect(SoundManager.play).toHaveBeenCalledWith('ui:western_new_round');
  });

  it('registers all Wildcard Western sound keys in SOUND_REGISTRY', () => {
    expect(SOUND_REGISTRY['music:wildcard_western_main']).toBeDefined();
    expect(SOUND_REGISTRY['ui:wildcard_select']).toBeDefined();
    expect(SOUND_REGISTRY['ui:wildcard_draw']).toBeDefined();
    expect(SOUND_REGISTRY['player:wildcard_eliminated']).toBeDefined();
    expect(SOUND_REGISTRY['minigame:wildcard_winner']).toBeDefined();
    expect(SOUND_REGISTRY['ui:wildcard_continue']).toBeDefined();
    expect(SOUND_REGISTRY['ui:western_new_round']).toBeDefined();
  });

  it('sound registry src paths use SOUNDS_BASE and point into the wildcard western subfolder', () => {
    const wwKeys = [
      'music:wildcard_western_main',
      'ui:wildcard_select',
      'ui:wildcard_draw',
      'player:wildcard_eliminated',
      'minigame:wildcard_winner',
      'ui:wildcard_continue',
      'ui:western_new_round',
    ] as const;
    for (const key of wwKeys) {
      const entry = SOUND_REGISTRY[key];
      expect(entry.src.startsWith(SOUNDS_BASE), `${key} src should start with SOUNDS_BASE`).toBe(true);
      expect(entry.src.includes('wildcard western/'), `${key} src should reference the wildcard western subfolder`).toBe(true);
    }
  });

  it('background music entry has loop=true', () => {
    expect(SOUND_REGISTRY['music:wildcard_western_main'].loop).toBe(true);
  });
});
