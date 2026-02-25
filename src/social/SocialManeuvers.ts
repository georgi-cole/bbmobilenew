/**
 * SocialManeuvers — core API for executing social actions during a phase.
 *
 * Public API:
 *   initManeuvers(store)                                  — wire Redux store (called from SocialEngine.init)
 *   getActionById(id)                                     → SocialActionDefinition | undefined
 *   getAvailableActions(actorId, state?)                  → SocialActionDefinition[]
 *   computeActionCost(actorId, action, targetId, state?)  → number
 *   executeAction(actorId, targetId, actionId, options?)  → ExecuteActionResult
 *
 * Debug: window.__socialManeuvers exposes the full public API in browsers.
 */

import { SOCIAL_ACTIONS } from './socialActions';
import type { SocialActionDefinition } from './socialActions';
import { normalizeActionCost, normalizeActionCosts, normalizeActionYields } from './smExecNormalize';
import { initEnergyBank, SocialEnergyBank } from './SocialEnergyBank';
import { computeOutcomeDelta, evaluateOutcome } from './SocialPolicy';
import { recordSocialAction, updateRelationship, applyInfluenceDelta, applyInfoDelta } from './socialSlice';
import type { SocialActionLogEntry, SocialState } from './types';

// ── Internal store reference ──────────────────────────────────────────────

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

/**
 * Partial SocialState snapshot accepted by getAvailableActions and
 * computeActionCost. Only the fields actively read by those functions are
 * required — lastReport and influenceWeights are not needed here.
 * influenceBank and infoBank are optional to allow snapshots that pre-date
 * multi-resource support (absent banks are treated as empty / all zeros).
 */
type PartialSocialState = {
  energyBank: Record<string, number>;
  influenceBank?: Record<string, number>;
  infoBank?: Record<string, number>;
  relationships: Record<string, unknown>;
  sessionLogs: unknown[];
};

interface StateForManeuvers {
  social: PartialSocialState;
}

let _store: StoreAPI | null = null;

/**
 * Wire the Redux store for SocialManeuvers (and SocialEnergyBank internally).
 * Should be called once at bootstrap, typically from SocialEngine.init().
 */
export function initManeuvers(store: StoreAPI): void {
  _store = store;
  initEnergyBank(store);
}

// ── Action lookup ─────────────────────────────────────────────────────────

/** Return the action definition for the given id, or undefined if not found. */
export function getActionById(id: string): SocialActionDefinition | undefined {
  return SOCIAL_ACTIONS.find((a) => a.id === id);
}

// ── Availability & cost ───────────────────────────────────────────────────

/**
 * Check whether an actor can afford a set of multi-resource costs.
 * Reads from the provided state snapshot, or falls back to the Redux store.
 * Returns false when the store is not initialised and no state is provided.
 */
export function canAfford(
  actorId: string,
  costs: { energy: number; influence: number; info: number },
  state?: StateForManeuvers,
): boolean {
  let energy: number;
  let influence: number;
  let info: number;

  if (state) {
    energy = state.social.energyBank[actorId] ?? 0;
    influence = state.social.influenceBank?.[actorId] ?? 0;
    info = state.social.infoBank?.[actorId] ?? 0;
  } else {
    const s = _store?.getState() as { social: SocialState } | null;
    energy = s?.social.energyBank[actorId] ?? 0;
    influence = s?.social.influenceBank?.[actorId] ?? 0;
    info = s?.social.infoBank?.[actorId] ?? 0;
  }

  return energy >= costs.energy && influence >= costs.influence && info >= costs.info;
}

/**
 * Return all actions the actor can currently afford (all resources checked).
 * Reads from the provided state snapshot, or falls back to the Redux store.
 */
export function getAvailableActions(
  actorId: string,
  state?: StateForManeuvers,
): SocialActionDefinition[] {
  return SOCIAL_ACTIONS.filter((a) => canAfford(actorId, normalizeActionCosts(a), state));
}

/**
 * Compute the energy cost for an actor to perform an action against a target.
 * Trait modifiers are stubbed for future expansion.
 */
export function computeActionCost(
  _actorId: string,
  action: SocialActionDefinition,
  _targetId: string,
  _state?: StateForManeuvers,
): number {
  return normalizeActionCost(action);
}

// ── Execution ─────────────────────────────────────────────────────────────

export interface ExecuteActionOptions {
  /** Override the outcome instead of defaulting to 'success'. */
  outcome?: 'success' | 'failure';
  /**
   * When true, the action is simulated but no state changes are dispatched.
   * Returns the outcome result without mutating energy, relationships, or logs.
   */
  previewOnly?: boolean;
  /**
   * Origin of the action for activity routing.
   * Set to 'manual' for human-player actions and 'system' for AI/background actions.
   * Defaults to 'system' when omitted so un-tagged callers are treated conservatively.
   */
  source?: 'manual' | 'system';
}

export interface ExecuteActionResult {
  /** False when the actor lacks energy or the action is unknown. */
  success: boolean;
  /** Affinity delta applied to the source→target relationship. */
  delta: number;
  /** Actor's energy after the action (unchanged on failure). */
  newEnergy: number;
  /** Human-readable summary of the outcome for UI display. */
  summary: string;
  /** Normalised outcome score in [-1, +1] from the SocialPolicy evaluator. */
  score: number;
  /** Human-readable outcome label (e.g. 'Good', 'Bad'). */
  label: string;
}

/**
 * Execute a social action synchronously.
 *
 * Steps:
 *  1. Fail fast if the store is not initialised.
 *  2. Validate the action exists and the actor can afford all resources.
 *  3. Deduct energy (SocialEnergyBank), influence and info (applyInfluenceDelta / applyInfoDelta).
 *  4. Compute affinity delta via SocialPolicy.computeOutcomeDelta.
 *  5. Apply any resource yields defined on the action.
 *  6. Dispatch updateRelationship to persist the affinity change.
 *  7. Dispatch recordSocialAction with full cost, balancesAfter and yieldsApplied.
 *  8. Return { success, delta, newEnergy }.
 *
 * Returns { success: false } without mutating state if validation fails.
 */
export function executeAction(
  actorId: string,
  targetId: string,
  actionId: string,
  options?: ExecuteActionOptions,
): ExecuteActionResult {
  if (!_store) {
    return { success: false, delta: 0, newEnergy: 0, summary: 'Store not initialised', score: 0, label: 'Unmoved' };
  }

  const action = getActionById(actionId);
  if (!action) {
    return { success: false, delta: 0, newEnergy: SocialEnergyBank.get(actorId), summary: 'Unknown action', score: 0, label: 'Unmoved' };
  }

  const costs = normalizeActionCosts(action);
  const currentEnergy = SocialEnergyBank.get(actorId);

  if (!canAfford(actorId, costs)) {
    return { success: false, delta: 0, newEnergy: currentEnergy, summary: 'Insufficient resources', score: 0, label: 'Unmoved' };
  }

  const outcome = options?.outcome ?? 'success';
  const delta = computeOutcomeDelta(actionId, actorId, targetId, outcome);

  // Evaluate outcome score and label using the SocialPolicy evaluator.
  const mode = options?.previewOnly ? 'preview' : 'execute';
  const state = _store.getState() as { social: SocialState };
  const outcomeResult = evaluateOutcome({
    actionId,
    actorId,
    targetIds: targetId,
    mode,
    outcome,
    relationships: state.social.relationships,
  });

  // previewOnly: return outcome without mutating state.
  if (options?.previewOnly) {
    const previewSign = delta > 0 ? '+' : '';
    const previewSummary =
      delta !== 0
        ? `${action.title} preview (${previewSign}${delta} affinity)`
        : `${action.title} preview`;
    return {
      success: true,
      delta,
      newEnergy: currentEnergy,
      summary: previewSummary,
      score: outcomeResult.score,
      label: outcomeResult.label,
    };
  }

  // Deduct all resources
  const newEnergy = SocialEnergyBank.add(actorId, -costs.energy);
  const currentInfluence = state.social.influenceBank[actorId] ?? 0;
  const influenceSpend = Math.min(costs.influence, currentInfluence);
  if (influenceSpend > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -influenceSpend }));
  }
  const currentInfo = state.social.infoBank[actorId] ?? 0;
  const infoSpend = Math.min(costs.info, currentInfo);
  if (infoSpend > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -infoSpend }));
  }

  // Apply yields (success only — yields are not granted on failure)
  const scaledYields = normalizeActionYields(action);
  if (outcome === 'success') {
    if (scaledYields.influence > 0) {
      _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: scaledYields.influence }));
    }
    if (scaledYields.info > 0) {
      _store.dispatch(applyInfoDelta({ playerId: actorId, delta: scaledYields.info }));
    }
  }

  // Read balances after all mutations
  const stateAfter = _store.getState() as { social: SocialState };
  const balancesAfter = {
    energy: stateAfter.social.energyBank[actorId] ?? 0,
    influence: stateAfter.social.influenceBank[actorId] ?? 0,
    info: stateAfter.social.infoBank[actorId] ?? 0,
  };

  const entry: SocialActionLogEntry = {
    actionId,
    actorId,
    targetId,
    cost: costs.energy,
    costs,
    delta,
    outcome,
    newEnergy,
    balancesAfter,
    timestamp: Date.now(),
    score: outcomeResult.score,
    label: outcomeResult.label,
    source: options?.source ?? 'system',
  };
  if (outcome === 'success' && (scaledYields.influence > 0 || scaledYields.info > 0)) {
    entry.yieldsApplied = {
      ...(scaledYields.influence > 0 ? { influence: scaledYields.influence } : {}),
      ...(scaledYields.info > 0 ? { info: scaledYields.info } : {}),
    };
  }

  _store.dispatch(
    updateRelationship({
      source: actorId,
      target: targetId,
      delta,
      tags: action.outcomeTag ? [action.outcomeTag] : undefined,
    }),
  );
  _store.dispatch(recordSocialAction({ entry }));

  const verb = outcome === 'failure' ? 'failed' : 'succeeded';
  const sign = delta > 0 ? '+' : '';
  const summary =
    delta !== 0
      ? `${action.title} ${verb} (${sign}${delta} affinity)`
      : `${action.title} ${verb}`;

  return { success: true, delta, newEnergy, summary, score: outcomeResult.score, label: outcomeResult.label };
}

// ── Named export for convenience ──────────────────────────────────────────

export const SocialManeuvers = {
  getActionById,
  getAvailableActions,
  canAfford,
  computeActionCost,
  executeAction,
};

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__socialManeuvers'] = {
    getActionById,
    getAvailableActions,
    canAfford,
    computeActionCost,
    executeAction,
  };
}
