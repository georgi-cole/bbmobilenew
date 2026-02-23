/**
 * SocialEngine — lightweight port of the BBMobile social engine.
 *
 * Lifecycle:
 *   SocialEngine.init(store)        — called once at app bootstrap
 *   SocialEngine.startPhase(name)   — called when entering social_1 / social_2
 *   SocialEngine.endPhase(name)     — called when leaving a social phase
 *
 * Debug helpers (available in DevTools console when window.store is set):
 *   SocialEngine.getBudgets()
 *   SocialEngine.getLastReport()
 *   SocialEngine.isPhaseActive()
 */

import type { SocialPhaseReport } from './types';
import { socialConfig } from './socialConfig';
import { DEFAULT_ENERGY } from './constants';
import { engineReady, engineComplete, setLastReport } from './socialSlice';
import { initInfluence, update as influenceUpdate } from './SocialInfluence';
import { initManeuvers } from './SocialManeuvers';

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface GameSlice {
  game: {
    players: Array<{ id: string; status: string; isUser?: boolean }>;
    seed: number;
    week: number;
  };
}

let _store: StoreAPI | null = null;
const _budgets = new Map<string, number>();
let _activePhase: string | null = null;
let _lastReport: SocialPhaseReport | null = null;

/** Provide the Redux store API so the engine can dispatch actions and read state. */
function init(store: StoreAPI): void {
  _store = store;
  initInfluence(store);
  initManeuvers(store);
}

/**
 * Compute per-player energy budgets for AI players and dispatch `social/engineReady`.
 * Reads `state.game.players` and `state.game.seed`.
 */
function startPhase(phaseName: string): void {
  if (!_store) return;

  const state = _store.getState() as GameSlice;
  const players = state.game?.players ?? [];
  const seed = state.game?.seed ?? 0;

  _budgets.clear();
  _activePhase = phaseName;

  const { targetSpendPctRange, minActionsPerPlayer, maxActionsPerPlayer } = socialConfig;

  // Only compute budgets for non-evicted, non-jury AI players
  const aiPlayers = players.filter(
    (p) => !p.isUser && p.status !== 'evicted' && p.status !== 'jury',
  );

  // Deterministic budget computation using a standard linear-congruential PRNG
  // (Numerical Recipes LCG: multiplier 1664525, increment 1013904223) seeded by
  // the game seed, matching BBMobile's approach for reproducibility.
  let rng = seed >>> 0;
  for (const player of aiPlayers) {
    rng = ((rng * 1664525 + 1013904223) >>> 0);
    const pct =
      targetSpendPctRange[0] +
      (rng / 0xffffffff) * (targetSpendPctRange[1] - targetSpendPctRange[0]);
    const actions =
      minActionsPerPlayer + Math.round(pct * (maxActionsPerPlayer - minActionsPerPlayer));
    _budgets.set(player.id, Math.round(DEFAULT_ENERGY * pct + actions));
  }

  const budgets: Record<string, number> = {};
  _budgets.forEach((v, k) => {
    budgets[k] = v;
  });

  // Give the human player the default energy budget so they can participate.
  const humanPlayer = players.find(
    (p) => p.isUser && p.status !== 'evicted' && p.status !== 'jury',
  );
  if (humanPlayer) {
    _budgets.set(humanPlayer.id, DEFAULT_ENERGY);
    budgets[humanPlayer.id] = DEFAULT_ENERGY;
  }

  _store.dispatch(engineReady({ budgets }));
}

/**
 * Finalize the social phase: generate a `SocialPhaseReport`, compute
 * per-player influence weights, dispatch `social/engineComplete`, and
 * persist the report via `social/setLastReport`.
 */
function endPhase(phaseName: string): void {
  if (!_store) return;

  const state = _store.getState() as GameSlice;
  const week = state.game?.week ?? 0;
  const players = state.game?.players ?? [];
  const activePlayers = players
    .filter((p) => p.status !== 'evicted' && p.status !== 'jury')
    .map((p) => p.id);

  // Compute influence weights for each AI participant before clearing budgets
  const aiParticipants = Array.from(_budgets.keys());
  for (const actorId of aiParticipants) {
    const eligibleTargets = activePlayers.filter((id) => id !== actorId);
    influenceUpdate(actorId, 'nomination', eligibleTargets);
  }

  const report: SocialPhaseReport = {
    id: `${phaseName}_w${week}_${Date.now()}`,
    week,
    summary: `Social phase ${phaseName} completed. ${_budgets.size} AI players participated.`,
    players: activePlayers,
    timestamp: Date.now(),
  };

  _lastReport = report;
  _activePhase = null;
  _budgets.clear();

  _store.dispatch(engineComplete());
  _store.dispatch(setLastReport(report));
}

/** Returns a snapshot of current per-player energy budgets. */
function getBudgets(): Record<string, number> {
  const result: Record<string, number> = {};
  _budgets.forEach((v, k) => {
    result[k] = v;
  });
  return result;
}

/** True while a social phase is active (between startPhase and endPhase). */
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
