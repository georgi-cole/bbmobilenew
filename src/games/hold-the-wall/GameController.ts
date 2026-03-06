/**
 * HoldTheWall — GameController
 *
 * Server-authoritative controller for the Hold the Wall endurance competition.
 * Manages:
 *  1. Distraction effect events (EFFECT_START / EFFECT_STOP) that production
 *     can trigger for a running game session.
 *  2. The 2-second initial-hold rule: if the human player does not initiate
 *     their hold within INITIAL_HOLD_DEADLINE_MS of ACTIVE_ROUND start, they
 *     are automatically eliminated (PLAYER_ELIMINATED emitted with reason
 *     'no_initial_hold').
 *
 * Transport-agnostic: uses an in-process event bus so the same API works in
 * tests (and in a real Socket.IO environment by forwarding the bus events over
 * the game's realtime channel).
 */

// ─── Effect types ─────────────────────────────────────────────────────────────

/** All supported distraction effect identifiers. */
export type EffectType = 'vibrate' | 'rain' | 'wind' | 'paint' | 'fakeCall' | 'sound';

// ─── Event payloads ───────────────────────────────────────────────────────────

export interface EffectStartPayload {
  gameId: string;
  effectType: EffectType;
  /** Optional configuration for the effect (intensity, duration, etc.). */
  params: Record<string, unknown>;
}

export interface EffectStopPayload {
  gameId: string;
  effectType: EffectType;
}

export interface PlayerEliminatedPayload {
  gameId: string;
  playerId: string;
  /** 'no_initial_hold' when caused by the 2-second auto-drop rule. */
  reason: 'no_initial_hold' | string;
}

// ─── Event map ────────────────────────────────────────────────────────────────

export interface HoldTheWallEventMap {
  EFFECT_START: EffectStartPayload;
  EFFECT_STOP: EffectStopPayload;
  PLAYER_ELIMINATED: PlayerEliminatedPayload;
}

export type HoldTheWallEventType = keyof HoldTheWallEventMap;

type Listener<T> = (event: T) => void;

// ─── Duration (ms) the player has to initiate a hold ─────────────────────────

/** Duration (ms) of the initial-hold window. Players who do not press hold
 *  within this window after ACTIVE_ROUND start are auto-eliminated. */
export const INITIAL_HOLD_DEADLINE_MS = 2000;

// ─── Internal event bus ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class EventBus<EventMap extends Record<string, any>> {
  private listeners: {
    [K in keyof EventMap]?: Array<Listener<EventMap[K]>>;
  } = {};

  on<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): () => void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type]!.push(listener);
    return () => this.off(type, listener);
  }

  off<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type]!.filter((l) => l !== listener);
  }

  emit<K extends keyof EventMap>(type: K, event: EventMap[K]): void {
    const handlers = this.listeners[type];
    if (!handlers) return;
    for (const handler of [...handlers]) {
      handler(event);
    }
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * Server-authoritative GameController for a single Hold the Wall session.
 *
 * Usage:
 *   const ctrl = new HoldTheWallGameController('game-123');
 *   // Subscribe to events
 *   ctrl.on('PLAYER_ELIMINATED', (p) => dispatch(dropPlayer(p.playerId)));
 *   ctrl.on('EFFECT_START', (p) => showEffect(p.effectType));
 *   // Start the round (begins 2-s timer)
 *   ctrl.startRound('human-player-id');
 *   // When human presses hold
 *   ctrl.onPlayerHoldStart();
 *   // Production triggers effects
 *   ctrl.emitEffectStart('rain', { intensity: 'heavy' });
 *   ctrl.emitEffectStop('rain');
 *   // Cleanup
 *   ctrl.destroy();
 */
export class HoldTheWallGameController {
  readonly gameId: string;

  private bus = new EventBus<HoldTheWallEventMap>();

  /** Timer that fires if the human hasn't pressed hold by the deadline. */
  private initialHoldTimer: ReturnType<typeof setTimeout> | null = null;

  /** True once the human player has pressed hold at least once. */
  private hasInitialHold = false;

  /** True while a round is in progress. */
  private roundActive = false;

  constructor(gameId: string) {
    this.gameId = gameId;
  }

  // ─── Subscription API ─────────────────────────────────────────────────────

  /**
   * Subscribe to a controller event.
   * @returns Unsubscribe function — call it to remove the listener.
   */
  on<K extends HoldTheWallEventType>(
    type: K,
    listener: Listener<HoldTheWallEventMap[K]>,
  ): () => void {
    return this.bus.on(type, listener);
  }

  // ─── Effect emission ──────────────────────────────────────────────────────

  /**
   * Emit EFFECT_START — production (ops) calls this to start a distraction
   * effect for the current game session.
   *
   * @param effectType — One of 'vibrate' | 'rain' | 'wind' | 'paint' | 'fakeCall' | 'sound'
   * @param params     — Optional effect-specific configuration.
   */
  emitEffectStart(effectType: EffectType, params: Record<string, unknown> = {}): void {
    this.bus.emit('EFFECT_START', {
      gameId: this.gameId,
      effectType,
      params,
    });
  }

  /**
   * Emit EFFECT_STOP — stops a running distraction effect.
   *
   * @param effectType — The effect type to stop.
   */
  emitEffectStop(effectType: EffectType): void {
    this.bus.emit('EFFECT_STOP', {
      gameId: this.gameId,
      effectType,
    });
  }

  // ─── 2-second hold enforcement ────────────────────────────────────────────

  /**
   * Call at ACTIVE_ROUND start (immediately when the competition begins).
   *
   * Starts the 2-second timer. If `onPlayerHoldStart` is not called within
   * `deadlineMs`, emits PLAYER_ELIMINATED with reason 'no_initial_hold'.
   *
   * @param humanPlayerId — ID of the human player who must press hold.
   * @param deadlineMs    — Override deadline (default: INITIAL_HOLD_DEADLINE_MS = 2000 ms).
   */
  startRound(humanPlayerId: string, deadlineMs = INITIAL_HOLD_DEADLINE_MS): void {
    this.hasInitialHold = false;
    this.roundActive = true;
    this._clearInitialHoldTimer();

    this.initialHoldTimer = setTimeout(() => {
      if (!this.hasInitialHold && this.roundActive) {
        this.bus.emit('PLAYER_ELIMINATED', {
          gameId: this.gameId,
          playerId: humanPlayerId,
          reason: 'no_initial_hold',
        });
      }
    }, deadlineMs);
  }

  /**
   * Call when the human player first presses (initiates) their hold action.
   * This cancels the 2-second auto-drop timer so the player is not eliminated.
   */
  onPlayerHoldStart(): void {
    this.hasInitialHold = true;
    this._clearInitialHoldTimer();
  }

  /**
   * Call to end the current round (on game complete or component unmount).
   * Cancels any pending auto-drop timer.
   */
  endRound(): void {
    this.roundActive = false;
    this._clearInitialHoldTimer();
  }

  /** Release all resources. Call on component unmount. */
  destroy(): void {
    this.endRound();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _clearInitialHoldTimer(): void {
    if (this.initialHoldTimer !== null) {
      clearTimeout(this.initialHoldTimer);
      this.initialHoldTimer = null;
    }
  }
}
