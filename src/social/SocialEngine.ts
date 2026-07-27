/**
 * SocialEngine — lightweight port of the BBMobile social engine.
 *
 * Lifecycle:
 *   SocialEngine.init(store)        — called once at app bootstrap
 *   SocialEngine.startPhase(name)   — called when entering social_1 / social_2
 *   SocialEngine.endPhase(name)     — called when leaving a social phase
 */

import type { SocialPhaseReport } from './types';
import { socialConfig } from './socialConfig';
import { engineReady, engineComplete, setLastReport } from './socialSlice';
import { initInfluence, update as influenceUpdate } from './SocialInfluence';
import { initManeuvers } from './SocialManeuvers';
import { socialAIDriver } from './socialAIDriver';
import { dispatchSocialSummary } from './SocialSummaryBridge';
import { getEffectiveSocialMode } from './socialMode';
import { getSocialModeConfig } from './socialRuntimeConfig';

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface GameSlice {
  game: {
    players: Array<{ id: string; status: string; isUser?: boolean }>;
    seed: number;
    week: number;
    dramaSocialMode?: boolean;
  };
  social?: { energyBank?: Record<string, number> };
  settings?: {
    gameUX?: { dramaMode?: boolean };
  };
  vip?: {
    isActive?: boolean;
    entitlements?: { dramaMode?: boolean };
  };
}

let _store: StoreAPI | null = null;
const _budgets = new Map<string, number>();
let _activePhase: string | null = null;
let _lastReport: SocialPhaseReport | null = null;

/** Provide the Redux store API so the engine can dispatch actions and read state. */
function init(store: StoreAPI): void {
  socialAIDriver.stop();
  _activePhase = null;
  _budgets.clear();
  _lastReport = null;
  _store = store;
  initInfluence(store);
  initManeuvers(store);
  socialAIDriver.setStore(store);
}

/** Compute per-player energy budgets and dispatch `social/engineReady`. */
function startPhase(phaseName: string): void {
  if (!_store) return;
  if (_activePhase === phaseName) return;

  const state = _store.getState() as GameSlice;
  const players = state.game?.players ?? [];
  const mode = getEffectiveSocialMode(state);
  const modeConfig = getSocialModeConfig(mode);
  const seed = state.game?.seed ?? 0;
  const carriedEnergy = state.social?.energyBank ?? {};
  const grantsWeeklyBatch = phaseName === 'social_1';

  _budgets.clear();
  _activePhase = phaseName;

  const { targetSpendPctRange, minActionsPerPlayer, maxActionsPerPlayer } = socialConfig;
  const aiPlayers = players.filter(
    (player) => !player.isUser && player.status !== 'evicted' && player.status !== 'jury',
  );

  // Deterministic budget computation using a standard linear-congruential PRNG.
  let rng = seed >>> 0;
  for (const player of aiPlayers) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const pct =
      targetSpendPctRange[0] +
      (rng / 0xffffffff) * (targetSpendPctRange[1] - targetSpendPctRange[0]);
    const actions =
      minActionsPerPlayer + Math.round(pct * (maxActionsPerPlayer - minActionsPerPlayer));
    const phaseBudget = Math.round(modeConfig.weeklyEnergy * pct + actions);
    const carried = Math.max(0, carriedEnergy[player.id] ?? 0);
    const next = !grantsWeeklyBatch
      ? carried
      : modeConfig.carryOver
        ? Math.min(modeConfig.energyCap, carried + phaseBudget)
        : Math.min(modeConfig.energyCap, phaseBudget);
    _budgets.set(player.id, next);
  }

  const budgets: Record<string, number> = {};
  _budgets.forEach((value, key) => {
    budgets[key] = value;
  });

  const humanPlayer = players.find(
    (player) => player.isUser && player.status !== 'evicted' && player.status !== 'jury',
  );
  if (humanPlayer) {
    const carried = Math.max(0, carriedEnergy[humanPlayer.id] ?? 0);
    const humanBudget = !grantsWeeklyBatch
      ? carried
      : modeConfig.carryOver
        ? Math.min(modeConfig.energyCap, carried + modeConfig.weeklyEnergy)
        : modeConfig.weeklyEnergy;
    _budgets.set(humanPlayer.id, humanBudget);
    budgets[humanPlayer.id] = humanBudget;
  }

  _store.dispatch(engineReady({ budgets }));

  const hasAIBudgets = aiPlayers.some((player) => (budgets[player.id] ?? 0) > 0);
  if (hasAIBudgets) {
    socialAIDriver.start();
  }
}

/**
 * Finalize the social phase: stop the AI driver, compute decision weights,
 * persist one report and route its summary to the Diary Room.
 */
function endPhase(phaseName: string): void {
  if (!_store) return;

  socialAIDriver.stop();

  const state = _store.getState() as GameSlice;
  const week = state.game?.week ?? 0;
  const players = state.game?.players ?? [];
  const activePlayers = players
    .filter((player) => player.status !== 'evicted' && player.status !== 'jury')
    .map((player) => player.id);

  const aiParticipants = players
    .filter(
      (player) =>
        !player.isUser &&
        player.status !== 'evicted' &&
        player.status !== 'jury' &&
        _budgets.has(player.id),
    )
    .map((player) => player.id);
  for (const actorId of aiParticipants) {
    const eligibleTargets = activePlayers.filter((id) => id !== actorId);
    influenceUpdate(actorId, 'nomination', eligibleTargets);
  }

  const report: SocialPhaseReport = {
    id: `${phaseName}_w${week}_${Date.now()}`,
    week,
    summary: `Social phase ${phaseName} completed. ${aiParticipants.length} AI players participated.`,
    players: activePlayers,
    timestamp: Date.now(),
  };

  _lastReport = report;
  _activePhase = null;
  _budgets.clear();

  _store.dispatch(engineComplete());
  _store.dispatch(setLastReport(report));
  dispatchSocialSummary(_store, report.summary, week);
}

/** Returns a snapshot of current per-player energy budgets. */
function getBudgets(): Record<string, number> {
  const result: Record<string, number> = {};
  _budgets.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/** True while a social phase is active. */
function isPhaseActive(): boolean {
  return _activePhase !== null;
}

/** Returns the report produced at the end of the most recent social phase. */
function getLastReport(): SocialPhaseReport | null {
  return _lastReport;
}

export const SocialEngine = {
  init,
  startPhase,
  endPhase,
  getBudgets,
  isPhaseActive,
  getLastReport,
};
