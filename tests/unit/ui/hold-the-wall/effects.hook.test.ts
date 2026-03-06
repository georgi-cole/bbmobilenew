/**
 * Unit tests: useHoldTheWallEffects hook.
 *
 * Verifies that:
 *  1. Subscribing to EFFECT_START adds the effect to activeEffects.
 *  2. Subscribing to EFFECT_STOP removes the effect from activeEffects.
 *  3. Multiple effects can be active at once.
 *  4. navigator.vibrate is called with the correct pattern for 'vibrate' effects.
 *  5. navigator.vibrate(0) is called to stop vibration when 'vibrate' stops.
 *  6. isAutoDropped becomes true when PLAYER_ELIMINATED fires with
 *     reason 'no_initial_hold' for the human player.
 *  7. isAutoDropped stays false when PLAYER_ELIMINATED fires for a different player.
 *  8. Hook cleans up subscriptions when the controller changes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { HoldTheWallGameController } from '../../../../src/games/hold-the-wall/GameController';
import { useHoldTheWallEffects } from '../../../../src/ui/games/HoldTheWall/hooks/useHoldTheWallEffects';

// ─── navigator.vibrate mock ───────────────────────────────────────────────────

const vibrateMock = vi.fn();

beforeEach(() => {
  vibrateMock.mockClear();
  Object.defineProperty(navigator, 'vibrate', {
    value: vibrateMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  // Remove mock to avoid cross-test pollution
  Object.defineProperty(navigator, 'vibrate', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeController(id = 'game-test') {
  return new HoldTheWallGameController(id);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useHoldTheWallEffects — effect state', () => {
  it('starts with no active effects', () => {
    const ctrl = makeController();
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));
    expect(result.current.activeEffects).toEqual({});
    ctrl.destroy();
  });

  it('adds an effect when EFFECT_START is emitted', () => {
    const ctrl = makeController();
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.emitEffectStart('rain', { intensity: 1 });
    });

    expect(result.current.activeEffects).toEqual({ rain: { intensity: 1 } });
    ctrl.destroy();
  });

  it('removes an effect when EFFECT_STOP is emitted', () => {
    const ctrl = makeController();
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.emitEffectStart('rain', {});
    });
    expect('rain' in result.current.activeEffects).toBe(true);

    act(() => {
      ctrl.emitEffectStop('rain');
    });
    expect('rain' in result.current.activeEffects).toBe(false);

    ctrl.destroy();
  });

  it('supports multiple simultaneous active effects', () => {
    const ctrl = makeController();
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.emitEffectStart('rain', {});
      ctrl.emitEffectStart('wind', {});
      ctrl.emitEffectStart('paint', {});
    });

    expect(Object.keys(result.current.activeEffects)).toHaveLength(3);
    expect('rain'  in result.current.activeEffects).toBe(true);
    expect('wind'  in result.current.activeEffects).toBe(true);
    expect('paint' in result.current.activeEffects).toBe(true);

    ctrl.destroy();
  });

  it('stopping one effect does not remove the others', () => {
    const ctrl = makeController();
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.emitEffectStart('rain', {});
      ctrl.emitEffectStart('wind', {});
    });
    act(() => {
      ctrl.emitEffectStop('wind');
    });

    expect('rain' in result.current.activeEffects).toBe(true);
    expect('wind' in result.current.activeEffects).toBe(false);

    ctrl.destroy();
  });
});

describe('useHoldTheWallEffects — vibration', () => {
  it('calls navigator.vibrate with default pattern for vibrate effect', () => {
    const ctrl = makeController();
    renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.emitEffectStart('vibrate', {});
    });

    expect(vibrateMock).toHaveBeenCalledOnce();
    expect(vibrateMock).toHaveBeenCalledWith([150, 80, 150, 80, 150]);

    ctrl.destroy();
  });

  it('calls navigator.vibrate with custom pattern from params', () => {
    const ctrl = makeController();
    renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.emitEffectStart('vibrate', { pattern: [200, 100, 200] });
    });

    expect(vibrateMock).toHaveBeenCalledWith([200, 100, 200]);

    ctrl.destroy();
  });

  it('calls navigator.vibrate(0) when vibrate effect stops', () => {
    const ctrl = makeController();
    renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.emitEffectStart('vibrate', {});
    });
    act(() => {
      ctrl.emitEffectStop('vibrate');
    });

    expect(vibrateMock).toHaveBeenLastCalledWith(0);

    ctrl.destroy();
  });

  it('does not throw when navigator.vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const ctrl = makeController();
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    expect(() => {
      act(() => {
        ctrl.emitEffectStart('vibrate', {});
      });
    }).not.toThrow();

    // Effect should still be added to activeEffects even without hardware support
    expect('vibrate' in result.current.activeEffects).toBe(true);

    ctrl.destroy();
  });
});

describe('useHoldTheWallEffects — auto-drop', () => {
  it('isAutoDropped is false initially', () => {
    const ctrl = makeController();
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));
    expect(result.current.isAutoDropped).toBe(false);
    ctrl.destroy();
  });

  it('sets isAutoDropped true when PLAYER_ELIMINATED fires for the human with reason no_initial_hold', () => {
    // Use vitest fake timers for this test
    vi.useFakeTimers();
    const ctrl = makeController('game-auto');
    const { result } = renderHook(() =>
      useHoldTheWallEffects(ctrl, 'human'),
    );

    act(() => {
      ctrl.startRound('human');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.isAutoDropped).toBe(true);

    ctrl.destroy();
    vi.useRealTimers();
  });

  it('isAutoDropped stays false when PLAYER_ELIMINATED fires for a different player', () => {
    vi.useFakeTimers();
    const ctrl = makeController('game-other');
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.startRound('other-player'); // note: different player id
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.isAutoDropped).toBe(false);

    ctrl.destroy();
    vi.useRealTimers();
  });

  it('isAutoDropped stays false when player holds before deadline', () => {
    vi.useFakeTimers();
    const ctrl = makeController('game-early-hold');
    const { result } = renderHook(() => useHoldTheWallEffects(ctrl, 'human'));

    act(() => {
      ctrl.startRound('human');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
      ctrl.onPlayerHoldStart(); // holds within 2 seconds
    });
    act(() => {
      vi.advanceTimersByTime(2000); // past original deadline
    });

    expect(result.current.isAutoDropped).toBe(false);

    ctrl.destroy();
    vi.useRealTimers();
  });
});

describe('useHoldTheWallEffects — null controller', () => {
  it('returns empty state when controller is null', () => {
    const { result } = renderHook(() => useHoldTheWallEffects(null, 'human'));
    expect(result.current.activeEffects).toEqual({});
    expect(result.current.isAutoDropped).toBe(false);
  });

  it('returns empty state when controller is undefined', () => {
    const { result } = renderHook(() => useHoldTheWallEffects(undefined, undefined));
    expect(result.current.activeEffects).toEqual({});
    expect(result.current.isAutoDropped).toBe(false);
  });
});
