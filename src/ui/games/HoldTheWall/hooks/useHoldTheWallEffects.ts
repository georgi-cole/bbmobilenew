/**
 * useHoldTheWallEffects — React hook for HoldTheWall distraction effects.
 *
 * Subscribes to EFFECT_START and EFFECT_STOP events from a
 * HoldTheWallGameController and translates them into:
 *  - Active effect state (consumed by EffectsOverlay)
 *  - navigator.vibrate calls (when the 'vibrate' effect is triggered)
 *  - Audio playback hooks (via Howler, when the 'sound' effect is triggered)
 *  - isAutoDropped flag (set when PLAYER_ELIMINATED fires with 'no_initial_hold')
 *
 * The hook respects device/user capability: vibration is only attempted if
 * `navigator.vibrate` is available.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  HoldTheWallGameController,
  EffectType,
  EffectStartPayload,
  EffectStopPayload,
  PlayerEliminatedPayload,
} from '../../../../games/hold-the-wall/GameController';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-effect configuration parameters received from the server. */
export type EffectParams = Record<string, unknown>;

/** Map of currently active effects → their configuration parameters. */
export type ActiveEffects = Partial<Record<EffectType, EffectParams>>;

export interface UseHoldTheWallEffectsResult {
  /** Set of active effects and their params — pass to EffectsOverlay. */
  activeEffects: ActiveEffects;
  /** True once PLAYER_ELIMINATED with reason 'no_initial_hold' fires. */
  isAutoDropped: boolean;
}

// ─── Default vibration pattern ────────────────────────────────────────────────

/**
 * Default vibration pattern (ms): [on, off, on, off, on].
 * Can be overridden via effect params: `{ pattern: [200, 100, 200] }`.
 */
const DEFAULT_VIBRATION_PATTERN = [150, 80, 150, 80, 150];

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to GameController effect events and manage local effect state.
 *
 * @param controller - The HoldTheWallGameController for the current game.
 *                     Pass `null` / `undefined` while the controller is not
 *                     yet ready — the hook will cleanly no-op.
 * @param humanPlayerId - ID of the human player; used to filter PLAYER_ELIMINATED.
 */
export function useHoldTheWallEffects(
  controller: HoldTheWallGameController | null | undefined,
  humanPlayerId: string | null | undefined,
): UseHoldTheWallEffectsResult {
  const [activeEffects, setActiveEffects] = useState<ActiveEffects>({});
  const [isAutoDropped, setIsAutoDropped] = useState(false);

  // ── Effect start ──────────────────────────────────────────────────────────
  const handleEffectStart = useCallback((payload: EffectStartPayload) => {
    const { effectType, params } = payload;

    // Add to active effects map
    setActiveEffects((prev) => ({ ...prev, [effectType]: params }));

    // Side-effects per type
    if (effectType === 'vibrate') {
      const pattern =
        Array.isArray(params?.pattern) ? (params.pattern as number[]) : DEFAULT_VIBRATION_PATTERN;
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    }
  }, []);

  // ── Effect stop ───────────────────────────────────────────────────────────
  const handleEffectStop = useCallback((payload: EffectStopPayload) => {
    const { effectType } = payload;

    setActiveEffects((prev) => {
      const next = { ...prev };
      delete next[effectType];
      return next;
    });

    // Cancel vibration if vibrate effect is stopped
    if (effectType === 'vibrate') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0);
      }
    }
  }, []);

  // ── Player eliminated ─────────────────────────────────────────────────────
  const handlePlayerEliminated = useCallback(
    (payload: PlayerEliminatedPayload) => {
      if (
        payload.reason === 'no_initial_hold' &&
        humanPlayerId != null &&
        payload.playerId === humanPlayerId
      ) {
        setIsAutoDropped(true);
      }
    },
    [humanPlayerId],
  );

  // ── Subscribe / unsubscribe ───────────────────────────────────────────────
  useEffect(() => {
    if (!controller) return;

    const unsubStart = controller.on('EFFECT_START', handleEffectStart);
    const unsubStop = controller.on('EFFECT_STOP', handleEffectStop);
    const unsubElim = controller.on('PLAYER_ELIMINATED', handlePlayerEliminated);

    return () => {
      unsubStart();
      unsubStop();
      unsubElim();
    };
  }, [controller, handleEffectStart, handleEffectStop, handlePlayerEliminated]);

  return { activeEffects, isAutoDropped };
}
