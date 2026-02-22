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
 * Debug: window.__socialManeuvers exposes { getActionById, executeAction } in browsers.
 */

import { SOCIAL_ACTIONS } from './socialActions';
import type { SocialActionDefinition } from './socialActions';
import { normalizeActionCosts } from './smExecNormalize';
import { initEnergyBank, SocialEnergyBank } from './SocialEnergyBank';
import { computeOutcomeDelta } from './SocialPolicy';
import { recordSocialAction, updateRelationship } from './socialSlice';
import type { SocialState } from './types';

// ── Internal store reference ──────────────────────────────────────────────

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

type PartialSocialState = Pick<SocialState, 'energyBank' | 'relationships' | 'sessionLogs'>;

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
 * Return all actions the actor can currently afford.
 * Reads energy from the provided state snapshot, or falls back to the Redux
 * store when no state is supplied.
 */
export function getAvailableActions(
  actorId: string,
  state?: StateForManeuvers,
): SocialActionDefinition[] {
  let energy: number;
  if (state) {
    energy = state.social.energyBank[actorId] ?? 0;
  } else {
    energy = SocialEnergyBank.get(actorId);
  }
  return SOCIAL_ACTIONS.filter((a) => normalizeActionCosts(a) <= energy);
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
  return normalizeActionCosts(action);
}

// ── Execution ─────────────────────────────────────────────────────────────

export interface ExecuteActionOptions {
  /** Override the outcome instead of defaulting to 'success'. */
  outcome?: 'success' | 'failure';
}

export interface ExecuteActionResult {
  /** False when the actor lacks energy or the action is unknown. */
  success: boolean;
  /** Affinity delta applied to the source→target relationship. */
  delta: number;
  /** Actor's energy after the action (unchanged on failure). */
  newEnergy: number;
}

/**
 * Execute a social action synchronously.
 *
 * Steps:
 *  1. Validate the action exists and the actor has enough energy.
 *  2. Deduct energy via SocialEnergyBank.
 *  3. Compute affinity delta via SocialPolicy.computeOutcomeDelta.
 *  4. Dispatch updateRelationship to persist the affinity change.
 *  5. Dispatch recordSocialAction to append an entry to sessionLogs.
 *  6. Return { success, delta, newEnergy }.
 *
 * Returns { success: false } without mutating state if validation fails.
 */
export function executeAction(
  actorId: string,
  targetId: string,
  actionId: string,
  options?: ExecuteActionOptions,
): ExecuteActionResult {
  const action = getActionById(actionId);
  if (!action) {
    return { success: false, delta: 0, newEnergy: SocialEnergyBank.get(actorId) };
  }

  const cost = computeActionCost(actorId, action, targetId);
  const currentEnergy = SocialEnergyBank.get(actorId);

  if (currentEnergy < cost) {
    return { success: false, delta: 0, newEnergy: currentEnergy };
  }

  const outcome = options?.outcome ?? 'success';
  const delta = computeOutcomeDelta(actionId, actorId, targetId, outcome);
  const newEnergy = SocialEnergyBank.add(actorId, -cost);

  if (_store) {
    _store.dispatch(
      updateRelationship({
        source: actorId,
        target: targetId,
        delta,
        tags: action.outcomeTag ? [action.outcomeTag] : undefined,
      }),
    );
    _store.dispatch(
      recordSocialAction({
        entry: {
          actionId,
          actorId,
          targetId,
          cost,
          delta,
          outcome,
          newEnergy,
          timestamp: Date.now(),
        },
      }),
    );
  }

  return { success: true, delta, newEnergy };
}

// ── Named export for convenience ──────────────────────────────────────────

export const SocialManeuvers = {
  getActionById,
  getAvailableActions,
  computeActionCost,
  executeAction,
};

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__socialManeuvers'] = {
    getActionById,
    executeAction,
  };
}
