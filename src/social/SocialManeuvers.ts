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
import { socialConfig } from './socialConfig';
import { normalizeAffinity } from './affinityUtils';
import { normalizeActionCost, normalizeActionCosts, normalizeActionYields } from './smExecNormalize';
import { initEnergyBank, SocialEnergyBank } from './SocialEnergyBank';
import { computeOutcomeDelta, evaluateOutcome, OUTCOME_THRESHOLDS } from './SocialPolicy';
import { recordSocialAction, updateRelationship, applyInfluenceDelta, applyInfoDelta } from './socialSlice';
import { ALLIANCE_TAG, BETRAYAL_TAG, hasAllianceBetween } from './socialAlliance';
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
  relationships: SocialState['relationships'];
  sessionLogs: unknown[];
};

interface StateForManeuvers {
  social: PartialSocialState;
}

let _store: StoreAPI | null = null;
const FIRST_POSITIVE_MIN_DELTA = 1;
const FIRST_POSITIVE_MAX_DELTA = 5;
const REPEATED_POSITIVE_MIN_DELTA = 1;
const REPEATED_POSITIVE_MAX_DELTA = 3;
const REPEATED_BACKFIRE_DELTA = -5;
const REPETITION_BACKFIRE_THRESHOLD = 2;
const REPETITION_BACKFIRE_CHANCE = 0.5;
const ALLIANCE_REJECTION_DELTA = -6;
const ALLIANCE_GASLIGHT_DELTA = -10;
const ALLIANCE_BETRAYAL_DELTA = -8;
const ALLIANCE_GASLIGHT_AFFINITY_THRESHOLD = 0;

function countPriorRepeatedActions(
  logs: SocialActionLogEntry[],
  actorId: string,
  targetId: string,
  actionId: string,
): number {
  return logs.filter(
    (entry) =>
      entry.actorId === actorId &&
      entry.targetId === targetId &&
      entry.actionId === actionId,
  ).length;
}

function isRepeatSensitiveAction(
  action: SocialActionDefinition,
  delta: number,
  yields: { influence: number; info: number },
): boolean {
  if (action.targetMode === 'none' || action.needsTargets === false) {
    return false;
  }

  return delta > 0 || yields.influence > 0 || yields.info > 0;
}

function randomIntegerInclusive(min: number, max: number, random: () => number): number {
  const normalized = Math.max(0, Math.min(0.999999999, random()));
  return min + Math.floor(normalized * (max - min + 1));
}

/**
 * Friendly actions feel strongest the first time, soften on the second use,
 * and become risky from the third use onward.  Keeping this in one helper
 * makes every positive interaction follow the same rule instead of special
 * casing Compliment in the UI.
 */
export function computeRepeatedPositiveDelta(
  priorRepeats: number,
  random: () => number = Math.random,
): { delta: number; didBackfire: boolean } {
  if (priorRepeats <= 0) {
    return {
      delta: randomIntegerInclusive(FIRST_POSITIVE_MIN_DELTA, FIRST_POSITIVE_MAX_DELTA, random),
      didBackfire: false,
    };
  }

  if (priorRepeats === 1) {
    return {
      delta: randomIntegerInclusive(
        REPEATED_POSITIVE_MIN_DELTA,
        REPEATED_POSITIVE_MAX_DELTA,
        random,
      ),
      didBackfire: false,
    };
  }

  if (random() < REPETITION_BACKFIRE_CHANCE) {
    return { delta: REPEATED_BACKFIRE_DELTA, didBackfire: true };
  }

  return {
    delta: randomIntegerInclusive(
      REPEATED_POSITIVE_MIN_DELTA,
      REPEATED_POSITIVE_MAX_DELTA,
      random,
    ),
    didBackfire: false,
  };
}

function scoreToLabel(score: number): 'Bad' | 'Unmoved' | 'Good' | 'Great' {
  if (score <= OUTCOME_THRESHOLDS.bad) return 'Bad';
  if (score < OUTCOME_THRESHOLDS.unmoved) return 'Unmoved';
  if (score < OUTCOME_THRESHOLDS.good) return 'Good';
  return 'Great';
}

function clampResourceAdjustment(delta: number, availableBalance: number): number {
  return delta < 0 ? -Math.min(Math.abs(delta), availableBalance) : delta;
}

function getAllianceAcceptChance(affinity: number, priorRepeats: number): number {
  const normalizedAffinity = normalizeAffinity(affinity);
  const baseChance =
    normalizedAffinity >= socialConfig.relationshipThresholds.allyThreshold
      ? 0.9
      : 0.5 + normalizedAffinity * 0.45;
  return Math.max(0.08, Math.min(0.96, baseChance - priorRepeats * 0.12));
}

function getAllianceBetrayalChance(affinity: number): number {
  const normalizedAffinity = normalizeAffinity(affinity);
  if (normalizedAffinity < -0.15) return 0.35;
  if (normalizedAffinity < 0.2) return 0.16;
  return 0.04;
}

function getAllianceFailureDelta(gaslightOccurred: boolean): number {
  return gaslightOccurred ? ALLIANCE_GASLIGHT_DELTA : ALLIANCE_REJECTION_DELTA;
}

function getOutcomeVerb({
  betrayalOccurred,
  gaslightOccurred,
  didBackfire,
  outcome,
}: {
  betrayalOccurred: boolean;
  gaslightOccurred: boolean;
  didBackfire: boolean;
  outcome: 'success' | 'failure';
}): string {
  if (betrayalOccurred) return 'was accepted, but they may be playing both sides';
  if (gaslightOccurred) return 'made things worse';
  if (didBackfire) return 'backfired';
  if (outcome === 'failure') return 'failed';
  return 'succeeded';
}

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
  targetId?: string,
): SocialActionDefinition[] {
  const socialState = state?.social ?? (_store?.getState() as { social: SocialState } | null)?.social;
  return SOCIAL_ACTIONS.filter((action) => {
    if (!canAfford(actorId, normalizeActionCosts(action), state)) {
      return false;
    }
    if (
      targetId &&
      action.id === 'proposeAlliance' &&
      socialState &&
      hasAllianceBetween(socialState.relationships, actorId, targetId)
    ) {
      return false;
    }
    return true;
  });
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
  /**
   * Optional contextual subject for primaryPlusSubject actions.
   * Represents the person being talked *about* (as opposed to targetId, which is
   * the person being talked *to*).
   * When provided and the action succeeds, a lightweight tag is applied to the
   * primary target → subject relationship to reflect the conversation.
   */
  subjectId?: string;
  /** Optional RNG override for deterministic simulations and tests. */
  random?: () => number;
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
  const state = _store.getState() as { social: SocialState };

  if (actionId === 'proposeAlliance' && hasAllianceBetween(state.social.relationships, actorId, targetId)) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'Already allied',
      score: 0,
      label: 'Unmoved',
    };
  }

  if (!canAfford(actorId, costs)) {
    return { success: false, delta: 0, newEnergy: currentEnergy, summary: 'Insufficient resources', score: 0, label: 'Unmoved' };
  }

  const scaledYields = normalizeActionYields(action);
  const random = options?.random ?? Math.random;
  const priorRepeats = countPriorRepeatedActions(state.social.sessionLogs, actorId, targetId, actionId);
  const existingAffinity = state.social.relationships[actorId]?.[targetId]?.affinity ?? 0;
  let outcome = options?.outcome ?? 'success';
  let betrayalOccurred = false;
  let gaslightOccurred = false;
  if (actionId === 'proposeAlliance' && !options?.outcome) {
    const acceptChance = getAllianceAcceptChance(existingAffinity, priorRepeats);
    const accepted = random() < acceptChance;
    if (!accepted) {
      outcome = 'failure';
      gaslightOccurred =
        existingAffinity < ALLIANCE_GASLIGHT_AFFINITY_THRESHOLD && priorRepeats > 0;
    } else {
      betrayalOccurred = random() < getAllianceBetrayalChance(existingAffinity);
    }
  }
  const baseDelta =
    actionId === 'proposeAlliance' && outcome === 'failure'
      ? getAllianceFailureDelta(gaslightOccurred)
      : computeOutcomeDelta(actionId, actorId, targetId, outcome);
  const repeatSensitive =
    outcome === 'success' && isRepeatSensitiveAction(action, baseDelta, scaledYields);
  const repeatedPositive = repeatSensitive && baseDelta > 0
    ? computeRepeatedPositiveDelta(priorRepeats, random)
    : {
        delta: baseDelta,
        didBackfire:
          repeatSensitive &&
          priorRepeats >= REPETITION_BACKFIRE_THRESHOLD &&
          random() < REPETITION_BACKFIRE_CHANCE,
      };
  const didBackfire = repeatedPositive.didBackfire;
  const delta = repeatedPositive.delta;

  // Evaluate outcome score and label using the SocialPolicy evaluator.
  const mode = options?.previewOnly ? 'preview' : 'execute';
  const outcomeResult = evaluateOutcome({
    actionId,
    actorId,
    targetIds: targetId,
    mode,
    outcome,
    relationships: state.social.relationships,
  });
  const finalScore = didBackfire ? -Math.abs(outcomeResult.score) : outcomeResult.score;
  const finalLabel = didBackfire ? scoreToLabel(finalScore) : outcomeResult.label;

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
      score: finalScore,
      label: finalLabel,
    };
  }

  // Deduct all resources
  const newEnergy = SocialEnergyBank.add(actorId, -costs.energy);
  const currentInfluence = state.social.influenceBank[actorId] ?? 0;
  const influenceSpend = Math.min(costs.influence, currentInfluence);
  const postSpendInfluenceBalance = currentInfluence - influenceSpend;
  if (influenceSpend > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -influenceSpend }));
  }
  const currentInfo = state.social.infoBank[actorId] ?? 0;
  const infoSpend = Math.min(costs.info, currentInfo);
  const postSpendInfoBalance = currentInfo - infoSpend;
  if (infoSpend > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -infoSpend }));
  }

  // Apply yields (successful actions grant yields; repeated beneficial actions may backfire)
  const intendedYields = {
    influence: didBackfire ? -scaledYields.influence : scaledYields.influence,
    info: didBackfire ? -scaledYields.info : scaledYields.info,
  };
  const appliedYields = { influence: 0, info: 0 };
  if (outcome === 'success') {
    if (intendedYields.influence !== 0) {
      const appliedInfluenceDelta = clampResourceAdjustment(
        intendedYields.influence,
        postSpendInfluenceBalance,
      );
      if (appliedInfluenceDelta !== 0) {
        _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: appliedInfluenceDelta }));
      }
      appliedYields.influence = appliedInfluenceDelta;
    }
    if (intendedYields.info !== 0) {
      const appliedInfoDelta = clampResourceAdjustment(
        intendedYields.info,
        postSpendInfoBalance,
      );
      if (appliedInfoDelta !== 0) {
        _store.dispatch(applyInfoDelta({ playerId: actorId, delta: appliedInfoDelta }));
      }
      appliedYields.info = appliedInfoDelta;
    }
  }

  // Read balances after all mutations
  const stateAfter = _store.getState() as { social: SocialState };
  const balancesAfter = {
    energy: stateAfter.social.energyBank[actorId] ?? 0,
    influence: stateAfter.social.influenceBank[actorId] ?? 0,
    info: stateAfter.social.infoBank[actorId] ?? 0,
  };

  const subjectId = options?.subjectId;

  const entry: SocialActionLogEntry = {
    actionId,
    actorId,
    targetId,
    ...(subjectId ? { subjectId } : {}),
    cost: costs.energy,
    costs,
    delta,
    outcome,
    newEnergy,
    balancesAfter,
    timestamp: Date.now(),
    score: finalScore,
    label: finalLabel,
    source: options?.source ?? 'system',
  };
  if (outcome === 'success' && (appliedYields.influence !== 0 || appliedYields.info !== 0)) {
    entry.yieldsApplied = {
      ...(appliedYields.influence !== 0 ? { influence: appliedYields.influence } : {}),
      ...(appliedYields.info !== 0 ? { info: appliedYields.info } : {}),
    };
  }

  const relationshipTags =
    outcome === 'success' &&
    action.outcomeTag &&
    !(actionId === 'proposeAlliance' && betrayalOccurred)
      ? [action.outcomeTag]
      : undefined;

  _store.dispatch(
    updateRelationship({
      source: actorId,
      target: targetId,
      delta,
      tags: relationshipTags,
      actionSource: options?.source ?? 'system',
    }),
  );

  if (actionId === 'proposeAlliance' && outcome === 'success') {
    if (betrayalOccurred) {
      _store.dispatch(
        updateRelationship({
          source: targetId,
          target: actorId,
          delta: ALLIANCE_BETRAYAL_DELTA,
          tags: [BETRAYAL_TAG],
          actionSource: options?.source ?? 'system',
        }),
      );
    } else {
      _store.dispatch(
        updateRelationship({
          source: targetId,
          target: actorId,
          delta,
          tags: [ALLIANCE_TAG],
          actionSource: 'system',
        }),
      );
    }
  }

  // For primaryPlusSubject actions: apply a lightweight contextual tag from the
  // primary target toward the subject (e.g. LOH now sees the subject as a "target").
  if (
    outcome === 'success' &&
    action.targetMode === 'primaryPlusSubject' &&
    subjectId &&
    subjectId !== targetId &&
    relationshipTags
  ) {
    _store.dispatch(
      updateRelationship({
        source: targetId,
        target: subjectId,
        delta: 0,
        tags: relationshipTags,
        actionSource: options?.source ?? 'system',
      }),
    );
  }

  _store.dispatch(recordSocialAction({ entry }));

  const verb = getOutcomeVerb({ betrayalOccurred, gaslightOccurred, didBackfire, outcome });
  const sign = delta > 0 ? '+' : '';
  const summary =
    delta !== 0
      ? `${action.title} ${verb} (${sign}${delta} affinity)`
      : `${action.title} ${verb}`;

  return { success: true, delta, newEnergy, summary, score: finalScore, label: finalLabel };
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
