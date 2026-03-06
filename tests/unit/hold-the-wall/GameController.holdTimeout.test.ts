/**
 * Unit tests: HoldTheWallGameController — 2-second initial-hold timeout rule.
 *
 * Verifies that:
 *  1. PLAYER_ELIMINATED is emitted with reason 'no_initial_hold' when the
 *     player does not call onPlayerHoldStart() within the deadline.
 *  2. PLAYER_ELIMINATED is NOT emitted when the player calls onPlayerHoldStart()
 *     before the deadline.
 *  3. endRound() cancels a pending timer — no event fires after endRound.
 *  4. emitEffectStart / emitEffectStop fire EFFECT_START / EFFECT_STOP with
 *     the correct payloads.
 *  5. Multiple effect subscriptions each receive the event.
 *  6. Unsubscribe prevents further callbacks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HoldTheWallGameController,
  INITIAL_HOLD_DEADLINE_MS,
} from '../../../src/games/hold-the-wall/GameController';

describe('HoldTheWallGameController — 2-second initial-hold rule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits PLAYER_ELIMINATED with reason no_initial_hold after the deadline if player never held', () => {
    const ctrl = new HoldTheWallGameController('game-1');
    const listener = vi.fn();
    ctrl.on('PLAYER_ELIMINATED', listener);

    ctrl.startRound('human-id');

    // Deadline not yet reached
    vi.advanceTimersByTime(INITIAL_HOLD_DEADLINE_MS - 1);
    expect(listener).not.toHaveBeenCalled();

    // Exactly at the deadline
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      gameId: 'game-1',
      playerId: 'human-id',
      reason: 'no_initial_hold',
    });

    ctrl.destroy();
  });

  it('does NOT emit PLAYER_ELIMINATED when player holds before the deadline', () => {
    const ctrl = new HoldTheWallGameController('game-2');
    const listener = vi.fn();
    ctrl.on('PLAYER_ELIMINATED', listener);

    ctrl.startRound('human-id');

    // Player holds at 1 500 ms — well within the 2 000 ms window
    vi.advanceTimersByTime(1500);
    ctrl.onPlayerHoldStart();

    // Advance past the original deadline
    vi.advanceTimersByTime(1000);
    expect(listener).not.toHaveBeenCalled();

    ctrl.destroy();
  });

  it('does NOT emit PLAYER_ELIMINATED when player holds exactly at t=0', () => {
    const ctrl = new HoldTheWallGameController('game-3');
    const listener = vi.fn();
    ctrl.on('PLAYER_ELIMINATED', listener);

    ctrl.startRound('human-id');
    ctrl.onPlayerHoldStart(); // immediate hold

    vi.advanceTimersByTime(INITIAL_HOLD_DEADLINE_MS + 100);
    expect(listener).not.toHaveBeenCalled();

    ctrl.destroy();
  });

  it('endRound() cancels the pending timer — no event fires afterward', () => {
    const ctrl = new HoldTheWallGameController('game-4');
    const listener = vi.fn();
    ctrl.on('PLAYER_ELIMINATED', listener);

    ctrl.startRound('human-id');
    vi.advanceTimersByTime(500);
    ctrl.endRound(); // cancel before deadline

    vi.advanceTimersByTime(INITIAL_HOLD_DEADLINE_MS * 2);
    expect(listener).not.toHaveBeenCalled();

    ctrl.destroy();
  });

  it('destroy() cancels the pending timer — no event fires after destroy', () => {
    const ctrl = new HoldTheWallGameController('game-5');
    const listener = vi.fn();
    ctrl.on('PLAYER_ELIMINATED', listener);

    ctrl.startRound('human-id');
    vi.advanceTimersByTime(1000);
    ctrl.destroy();

    vi.advanceTimersByTime(INITIAL_HOLD_DEADLINE_MS * 2);
    expect(listener).not.toHaveBeenCalled();
  });

  it('supports a custom deadline override', () => {
    const ctrl = new HoldTheWallGameController('game-6');
    const listener = vi.fn();
    ctrl.on('PLAYER_ELIMINATED', listener);

    ctrl.startRound('human-id', 500); // 500 ms custom deadline

    vi.advanceTimersByTime(499);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledOnce();

    ctrl.destroy();
  });

  it('re-starting a round resets the timer for the new round', () => {
    const ctrl = new HoldTheWallGameController('game-7');
    const listener = vi.fn();
    ctrl.on('PLAYER_ELIMINATED', listener);

    ctrl.startRound('human-id');
    vi.advanceTimersByTime(1000); // halfway through first round (t=1000)
    ctrl.startRound('human-id'); // restart — deadline resets to t=1000+2000=3000

    // Advance to t=2999 — one ms before new deadline, must not fire
    vi.advanceTimersByTime(1999);
    expect(listener).not.toHaveBeenCalled();

    // Advance by 1 ms to reach t=3000 — timer fires now
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledOnce();

    ctrl.destroy();
  });
});

describe('HoldTheWallGameController — effect events', () => {
  it('emits EFFECT_START with correct payload', () => {
    const ctrl = new HoldTheWallGameController('game-e1');
    const listener = vi.fn();
    ctrl.on('EFFECT_START', listener);

    ctrl.emitEffectStart('rain', { intensity: 2 });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      gameId: 'game-e1',
      effectType: 'rain',
      params: { intensity: 2 },
    });

    ctrl.destroy();
  });

  it('emits EFFECT_START with empty params when none provided', () => {
    const ctrl = new HoldTheWallGameController('game-e2');
    const listener = vi.fn();
    ctrl.on('EFFECT_START', listener);

    ctrl.emitEffectStart('vibrate');

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ params: {} }),
    );

    ctrl.destroy();
  });

  it('emits EFFECT_STOP with correct payload', () => {
    const ctrl = new HoldTheWallGameController('game-e3');
    const listener = vi.fn();
    ctrl.on('EFFECT_STOP', listener);

    ctrl.emitEffectStop('wind');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      gameId: 'game-e3',
      effectType: 'wind',
    });

    ctrl.destroy();
  });

  it('notifies multiple subscribers', () => {
    const ctrl = new HoldTheWallGameController('game-e4');
    const l1 = vi.fn();
    const l2 = vi.fn();
    ctrl.on('EFFECT_START', l1);
    ctrl.on('EFFECT_START', l2);

    ctrl.emitEffectStart('paint');

    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();

    ctrl.destroy();
  });

  it('unsubscribe prevents further callbacks', () => {
    const ctrl = new HoldTheWallGameController('game-e5');
    const listener = vi.fn();
    const unsub = ctrl.on('EFFECT_START', listener);

    ctrl.emitEffectStart('fakeCall');
    expect(listener).toHaveBeenCalledOnce();

    unsub();
    ctrl.emitEffectStart('fakeCall');
    expect(listener).toHaveBeenCalledOnce(); // still only once

    ctrl.destroy();
  });
});
