/**
 * socialAIDriver — conservative, budget-aware driver that ticks at a
 * configurable interval and triggers AI social actions.
 *
 * Public API:
 *   setStore(store)   — wire Redux store (called from SocialEngine.init)
 *   start()           — begin ticking; calls SocialPolicy + SocialManeuvers
 *   stop()            — cancel ticking immediately
 *   getStatus()       — returns { running, tickCount, actionsExecuted }
 *
 * Behaviour:
 *   • On start(), iterates non-human active players, chooses actions via
 *     SocialPolicy, executes via SocialManeuvers.executeAction, and repeats
 *     every tickIntervalMs until all AI budgets are exhausted or the safety
 *     MAX_TICKS guard fires.
 *   • Skips 'idle' to avoid zero-cost loops.
 *   • Respects socialConfig.allowOverspend: when false, stops as soon as all
 *     budgets are exhausted.
 *
 * Debug: window.__smAutoDriver exposes { start, stop, getStatus } in browsers.
 */

import { chooseActionFor, chooseTargetsFor } from './SocialPolicy';
import { executeAction, getActionById, canAfford } from './SocialManeuvers';
import { normalizeActionCosts } from './smExecNormalize';
import { socialConfig } from './socialConfig';
import type { RelationshipsMap } from './types';
import type { DramaSocialNetwork, SocialActionLogEntry, SocialMemoryMap } from './types';
import { chooseDramaAIMove, normalizeDramaSocialNetwork } from './dramaModeEngine';

// ── Internal state ────────────────────────────────────────────────────────

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface DriverState {
  game: {
    players: Array<{ id: string; name: string; status: string; isUser?: boolean }>;
    seed: number;
    week: number;
    phase: string;
    lohId?: string | null;
    posWinnerId?: string | null;
    nomineeIds?: string[];
  };
  social: {
    energyBank: Record<string, number>;
    influenceBank: Record<string, number>;
    infoBank: Record<string, number>;
    relationships: RelationshipsMap;
    socialMemory: SocialMemoryMap;
    dramaNetwork: DramaSocialNetwork;
    sessionLogs: SocialActionLogEntry[];
  };
  settings?: { gameUX?: { dramaMode?: boolean } };
}

const MAX_TICKS = () => socialConfig.maxTicksPerPhase;

let _store: StoreAPI | null = null;
let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _tickCount = 0;
let _actionsExecuted = 0;

// ── Public API ────────────────────────────────────────────────────────────

/** Wire the Redux store. Called once from SocialEngine.init(). */
export function setStore(store: StoreAPI): void {
  _store = store;
}

/**
 * Begin the AI action loop.
 * No-ops if the store is not wired, already running, or no AI players have
 * a positive budget.
 */
export function start(): void {
  if (!_store || _running) return;

  const state = _store.getState() as DriverState;
  const aiPlayers = _aiPlayers(state);
  const budgets = state.social?.energyBank ?? {};
  const hasActiveBudgets = aiPlayers.some((p) => (budgets[p.id] ?? 0) > 0);
  if (!hasActiveBudgets) return;

  _running = true;
  _tickCount = 0;
  _actionsExecuted = 0;

  if (socialConfig.verbose) {
    console.debug(
      '[socialAIDriver] started – AI players:',
      aiPlayers.map((p) => p.id),
    );
  }

  _timer = setInterval(_tick, socialConfig.tickIntervalMs);
}

/** Cancel the AI action loop immediately. */
export function stop(): void {
  _running = false;
  _clearTimer();

  if (socialConfig.verbose) {
    console.debug(`[socialAIDriver] stopped – ticks: ${_tickCount}, actions: ${_actionsExecuted}`);
  }
}

/** Return a snapshot of driver status. */
export function getStatus(): { running: boolean; tickCount: number; actionsExecuted: number } {
  return { running: _running, tickCount: _tickCount, actionsExecuted: _actionsExecuted };
}

export const socialAIDriver = { setStore, start, stop, getStatus };

// ── Internal helpers ──────────────────────────────────────────────────────

function _aiPlayers(state: DriverState) {
  return (state.game?.players ?? []).filter(
    (p) => !p.isUser && p.status !== 'evicted' && p.status !== 'jury',
  );
}

function _clearTimer(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
}

function _tick(): void {
  if (!_store || !_running) {
    _clearTimer();
    return;
  }

  _tickCount++;

  const state = _store.getState() as DriverState;
  const players = state.game?.players ?? [];
  const aiPlayers = _aiPlayers(state);
  const budgets = state.social?.energyBank ?? {};

  // Safety guard
  if (_tickCount >= MAX_TICKS()) {
    stop();
    return;
  }

  // Stop if all budgets exhausted (when allowOverspend is false)
  if (!socialConfig.allowOverspend && !aiPlayers.some((p) => (budgets[p.id] ?? 0) > 0)) {
    stop();
    return;
  }

  const context = {
    players,
    relationships: state.social?.relationships ?? {},
    week: state.game?.week ?? 0,
    seed: state.game?.seed ?? 0,
  };

  // One action per AI player per tick (conservative)
  for (const player of aiPlayers) {
    if ((budgets[player.id] ?? 0) <= 0) continue;

    const dramaMove = state.settings?.gameUX?.dramaMode
      ? chooseDramaAIMove({
          actorId: player.id,
          players,
          relationships: state.social?.relationships ?? {},
          memory: state.social?.socialMemory ?? {},
          network: normalizeDramaSocialNetwork(state.social?.dramaNetwork),
          recentActions: state.social?.sessionLogs ?? [],
          week: state.game?.week ?? 0,
          phase: state.game?.phase ?? '',
          seed: state.game?.seed ?? 0,
          tick: _tickCount,
          lohId: state.game?.lohId,
          posWinnerId: state.game?.posWinnerId,
          nomineeIds: state.game?.nomineeIds,
        })
      : null;
    const actionId = dramaMove?.actionId ?? chooseActionFor(player.id, context);
    if (actionId === 'idle') continue;

    // Check full affordability (energy + influence + info) before attempting
    const actionDef = getActionById(actionId);
    if (!actionDef) continue;
    if (!canAfford(player.id, normalizeActionCosts(actionDef))) continue;

    const targets = dramaMove
      ? [dramaMove.targetId, dramaMove.subjectId].filter((id): id is string => Boolean(id))
      : chooseTargetsFor(player.id, actionId, context);
    if (targets.length === 0) continue;

    const [targetId, subjectId] = targets;
    const result = executeAction(player.id, targetId, actionId, {
      source: 'system',
      subjectId,
    });
    if (result.success) {
      _actionsExecuted++;
      if (socialConfig.verbose) {
        console.debug(
          `[socialAIDriver] ${player.id} → ${actionId} on ${targetId} ` +
            `(energy: ${result.newEnergy}, delta: ${result.delta})`,
        );
      }
    }
  }

  // After the tick, re-read budgets and stop if exhausted (when allowOverspend is false)
  if (!socialConfig.allowOverspend) {
    const updatedBudgets = (_store.getState() as DriverState).social?.energyBank ?? {};
    if (!aiPlayers.some((p) => (updatedBudgets[p.id] ?? 0) > 0)) {
      stop();
    }
  }
}

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__smAutoDriver'] = {
    start,
    stop,
    getStatus,
  };
}
