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
import { ALLIANCE_TAG, BETRAYAL_TAG, MIN_ALLIANCE_AFFINITY, hasAllianceBetween } from './socialAlliance';
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

function getAdvancedAllianceAcceptChance(
  proposerAffinity: number,
  recipientTrust: number,
  priorRepeats: number,
  context: { proposerIsLoh: boolean; proposerHasSafety: boolean; recipientIsNominated: boolean },
): number {
  const proposer = normalizeAffinity(proposerAffinity);
  const recipient = normalizeAffinity(recipientTrust);
  const mutual = (proposer + recipient) / 2;
  if (Math.min(proposer, recipient) <= -0.35) return 0.02;
  const relationshipChance = mutual >= socialConfig.relationshipThresholds.allyThreshold
    ? 0.82 + mutual * 0.12
    : 0.08 + Math.max(0, mutual) * 0.85;
  const leverageBonus = (context.proposerIsLoh ? 0.28 : 0)
    + (context.proposerHasSafety ? 0.08 : 0)
    + (context.recipientIsNominated ? 0.14 : 0);
  const hostilityCap = Math.min(proposer, recipient) < -0.1 ? 0.22 : 0.95;
  return Math.max(
    0.02,
    Math.min(hostilityCap, relationshipChance + leverageBonus - priorRepeats * 0.14),
  );
}

function getStandardAllianceAcceptChance(affinity: number, priorRepeats: number): number {
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

function getAdvancedAllianceFailureDelta(
  gaslightOccurred: boolean,
  proposerAffinity: number,
  recipientTrust: number,
): number {
  if (gaslightOccurred) return ALLIANCE_GASLIGHT_DELTA;
  const mutual = (normalizeAffinity(proposerAffinity) + normalizeAffinity(recipientTrust)) / 2;
  if (mutual >= 0.2) return -2;
  if (mutual >= 0) return -4;
  return ALLIANCE_REJECTION_DELTA;
}

function getStandardAllianceFailureDelta(gaslightOccurred: boolean): number {
  return gaslightOccurred ? ALLIANCE_GASLIGHT_DELTA : ALLIANCE_REJECTION_DELTA;
}

function getLohTargetPlan(
  game: {
    players?: Array<{ id: string; name?: string; status: string }>;
    nomineeIds?: string[];
  } | undefined,
  relationships: SocialState['relationships'],
  lohId: string,
): {
  targetId: string;
  targetName: string;
  isBackdoor: boolean;
  currentTargetId: string | null;
  backupTargetId: string | null;
} | null {
  const players = (game?.players ?? []).filter(
    (player) => player.id !== lohId && player.status !== 'evicted' && player.status !== 'jury',
  );
  if (players.length === 0) return null;
  const score = (playerId: string) => relationships[lohId]?.[playerId]?.affinity ?? 0;
  const lowest = (pool: typeof players) =>
    [...pool].sort((left, right) => score(left.id) - score(right.id))[0];
  const nomineeIds = new Set(game?.nomineeIds ?? []);
  const nominees = players.filter((player) => nomineeIds.has(player.id));
  const nonNominees = players.filter((player) => !nomineeIds.has(player.id));
  const nomineeTarget = nominees.length > 0 ? lowest(nominees) : null;
  const backdoorTarget = nonNominees.length > 0 ? lowest(nonNominees) : null;
  const isBackdoor = !!nomineeTarget && !!backdoorTarget &&
    score(backdoorTarget.id) <= score(nomineeTarget.id) - 12;
  const currentTarget = nomineeTarget ?? lowest(players);
  const target = isBackdoor ? backdoorTarget! : currentTarget;
  return {
    targetId: target.id,
    targetName: target.name ?? target.id,
    isBackdoor,
    currentTargetId: currentTarget?.id ?? null,
    backupTargetId: backdoorTarget?.id ?? null,
  };
}

function getContextualActionSummary({
  actionId,
  actorId,
  targetId,
  subjectId,
  recipientTrust,
  game,
  relationships,
}: {
  actionId: string;
  actorId: string;
  targetId: string;
  subjectId?: string;
  recipientTrust: number;
  game?: {
    players?: Array<{ id: string; name?: string; status: string }>;
    nomineeIds?: string[];
    nominationContext?: { autoNomineeId: string | null } | null;
  };
  relationships: SocialState['relationships'];
}): string | null {
  const name = (id: string | undefined) => game?.players?.find((player) => player.id === id)?.name ?? id ?? 'that player';
  if (actionId === 'ask_why_nominated') {
    const lohName = name(targetId);
    if (game?.nominationContext?.autoNomineeId === actorId) {
      return `${lohName} explained that you entered danger automatically after the competition, not as their personal nominee.`;
    }
    if (recipientTrust >= 30) return `${lohName} said they respect you, but your competition potential made you too dangerous to leave comfortable.`;
    if (recipientTrust < 0) return `${lohName} admitted they do not trust your position and wanted to force you to show your hand.`;
    return `${lohName} said they needed options and believed you were connected enough to survive without becoming an immediate enemy.`;
  }
  if (actionId === 'ask_safety_plan') {
    const holderName = name(targetId);
    const holder = game?.players?.find((player) => player.id === targetId);
    if (holder?.status.includes('nominated')) return `${holderName} said they have no real choice: they intend to use Safety on themselves.`;
    if (recipientTrust < 25) return `${holderName} stayed vague and said everyone would learn the decision at the ceremony.`;
    const nominee = (game?.nomineeIds ?? [])
      .map((id) => ({ id, affinity: relationships[targetId]?.[id]?.affinity ?? 0 }))
      .sort((left, right) => right.affinity - left.affinity)[0];
    return nominee
      ? `${holderName} trusted you enough to say they are leaning toward using Safety on ${name(nominee.id)}.`
      : `${holderName} said they are currently leaning toward leaving the nominations unchanged.`;
  }
  if (actionId === 'ask_use_safety') {
    return recipientTrust >= 20
      ? `${name(targetId)} said they would seriously consider using Safety on ${name(subjectId)} but made no promise.`
      : `${name(targetId)} listened to the request about ${name(subjectId)} and refused to reveal the decision.`;
  }
  if (actionId === 'ask_hold_safety') {
    return recipientTrust >= 20
      ? `${name(targetId)} acknowledged the LOH's request to leave nominations unchanged, while keeping the final decision.`
      : `${name(targetId)} rejected the pressure and said the Safety decision belongs to them alone.`;
  }
  return null;
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

/** Return the complete multi-resource price for an action. */
export function computeActionCosts(
  _actorId: string,
  action: SocialActionDefinition,
  _targetId: string,
  _state?: StateForManeuvers,
): { energy: number; influence: number; info: number } {
  return normalizeActionCosts(action);
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
  /** Apply the action to another group member without charging the group cost again. */
  waiveCosts?: boolean;
  /** Override the energy portion of the cost for dynamically priced actions. */
  energyCostOverride?: number;
  /** Override the complete price when a UI batches several targets atomically. */
  costOverride?: { energy: number; influence: number; info: number };
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

  const normalizedCosts = normalizeActionCosts(action);
  const costs = options?.waiveCosts
    ? { energy: 0, influence: 0, info: 0 }
    : options?.costOverride ?? {
        ...normalizedCosts,
        energy: options?.energyCostOverride ?? normalizedCosts.energy,
      };
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

  const scaledYields = options?.waiveCosts
    ? { influence: 0, info: 0 }
    : normalizeActionYields(action);
  const random = options?.random ?? Math.random;
  const priorRepeats = countPriorRepeatedActions(state.social.sessionLogs, actorId, targetId, actionId);
  const existingAffinity = state.social.relationships[actorId]?.[targetId]?.affinity ?? 0;
  const recipientTrust = state.social.relationships[targetId]?.[actorId]?.affinity ?? 0;
  const rootState = _store.getState() as {
    social: SocialState;
    settings?: { gameUX?: { dramaMode?: boolean } };
    game?: {
      week?: number;
      lohId?: string | null;
      posWinnerId?: string | null;
      players?: Array<{ id: string; name?: string; status: string }>;
      nomineeIds?: string[];
      nominationContext?: { autoNomineeId: string | null } | null;
      lohSocialPlan?: {
        week: number;
        lohId: string;
        currentTargetId: string | null;
        backupTargetId: string | null;
        askCountsByPlayerId: Record<string, number>;
      } | null;
    };
  };
  const dramaMode = rootState.settings?.gameUX?.dramaMode === true;
  const freshLohTargetPlan = actionId === 'ask_loh_target'
    ? getLohTargetPlan(rootState.game, state.social.relationships, targetId)
    : null;
  const savedLohPlan = rootState.game?.lohSocialPlan;
  const existingLohPlan = savedLohPlan
    && savedLohPlan.week === rootState.game?.week
    && savedLohPlan.lohId === targetId
    ? savedLohPlan
    : null;
  const lohPlanState = freshLohTargetPlan
    ? existingLohPlan ?? {
        week: rootState.game?.week ?? 0,
        lohId: targetId,
        currentTargetId: freshLohTargetPlan.currentTargetId,
        backupTargetId: freshLohTargetPlan.backupTargetId,
        askCountsByPlayerId: {},
      }
    : null;
  const priorLohAsks = lohPlanState?.askCountsByPlayerId[actorId] ?? 0;
  const lohDisclosureId = lohPlanState
    ? priorLohAsks % 2 === 1 && lohPlanState.currentTargetId
      ? lohPlanState.currentTargetId
      : lohPlanState.backupTargetId ?? lohPlanState.currentTargetId
    : null;
  const lohDisclosurePlayer = rootState.game?.players?.find((player) => player.id === lohDisclosureId);
  // The LOH may share another name as misdirection, but should not casually tell
  // a player that *they* are the current or backup target.
  const lohWillDisclose =
    !!lohDisclosureId &&
    (!dramaMode || lohDisclosureId !== actorId) &&
    recipientTrust >= 0 &&
    priorLohAsks < 2;
  const lohTargetPlan = lohWillDisclose && lohDisclosureId
    ? {
        targetId: lohDisclosureId,
        targetName: lohDisclosurePlayer?.name ?? lohDisclosureId,
        isBackdoor: lohDisclosureId === lohPlanState?.backupTargetId,
      }
    : null;
  let outcome = options?.outcome ?? 'success';
  let betrayalOccurred = false;
  let gaslightOccurred = false;
  if (actionId === 'proposeAlliance' && !options?.outcome) {
    const recipientPlayer = rootState.game?.players?.find((player) => player.id === targetId);
    const acceptChance = dramaMode
      ? getAdvancedAllianceAcceptChance(existingAffinity, recipientTrust, priorRepeats, {
          proposerIsLoh: rootState.game?.lohId === actorId,
          proposerHasSafety: rootState.game?.posWinnerId === actorId,
          recipientIsNominated: recipientPlayer?.status.includes('nominated') ?? false,
        })
      : getStandardAllianceAcceptChance(existingAffinity, priorRepeats);
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
      ? dramaMode
        ? getAdvancedAllianceFailureDelta(gaslightOccurred, existingAffinity, recipientTrust)
        : getStandardAllianceFailureDelta(gaslightOccurred)
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
  const delta = actionId === 'ask_loh_target' && priorLohAsks >= 2
    ? -Math.min(4, priorLohAsks)
    : actionId === 'ask_loh_target' && !lohWillDisclose
      ? 0
      : repeatedPositive.delta;
  const formingAlliance =
    actionId === 'proposeAlliance' && outcome === 'success' && !betrayalOccurred;
  const relationshipDelta = formingAlliance
    ? Math.max(delta, MIN_ALLIANCE_AFFINITY - existingAffinity)
    : actionId === 'proposeAlliance' && outcome === 'success'
      ? delta
      : dramaMode ? delta * 2 : delta;
  const reciprocalAllianceDelta = formingAlliance
    ? Math.max(delta, MIN_ALLIANCE_AFFINITY - recipientTrust)
    : delta;

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
    const previewSign = relationshipDelta > 0 ? '+' : '';
    const previewSummary =
      relationshipDelta !== 0
        ? `${action.title} preview (${previewSign}${relationshipDelta} affinity)`
        : `${action.title} preview`;
    return {
      success: true,
      delta: relationshipDelta,
      newEnergy: currentEnergy,
      summary: previewSummary,
      score: finalScore,
      label: finalLabel,
    };
  }

  if (actionId === 'ask_loh_target' && lohPlanState) {
    _store.dispatch({
      type: 'game/setLohSocialPlan',
      payload: {
        ...lohPlanState,
        askCountsByPlayerId: {
          ...lohPlanState.askCountsByPlayerId,
          [actorId]: priorLohAsks + 1,
        },
      },
    });
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
  const stateAfter = _store.getState() as { social: SocialState; game?: { week?: number } };
  const balancesAfter = {
    energy: stateAfter.social.energyBank[actorId] ?? 0,
    influence: stateAfter.social.influenceBank[actorId] ?? 0,
    info: stateAfter.social.infoBank[actorId] ?? 0,
  };

  const subjectId = options?.subjectId ?? lohTargetPlan?.targetId;

  const entry: SocialActionLogEntry = {
    actionId,
    actorId,
    targetId,
    ...(subjectId ? { subjectId } : {}),
    ...(lohTargetPlan
      ? { context: { lohPlanType: lohTargetPlan.isBackdoor ? 'backup_plan' as const : 'current_target' as const } }
      : {}),
    cost: costs.energy,
    costs,
    delta: relationshipDelta,
    outcome,
    newEnergy,
    balancesAfter,
    timestamp: Date.now(),
    week: stateAfter.game?.week,
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
      delta: relationshipDelta,
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
          delta: reciprocalAllianceDelta,
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
  const sign = relationshipDelta > 0 ? '+' : '';
  const lohName = rootState.game?.players?.find((player) => player.id === targetId)?.name ?? 'The LOH';
  const contextualSummary = getContextualActionSummary({
    actionId,
    actorId,
    targetId,
    subjectId: options?.subjectId,
    recipientTrust,
    game: rootState.game,
    relationships: state.social.relationships,
  });
  const summary = contextualSummary ?? (actionId === 'ask_loh_target' && priorLohAsks >= 3
    ? `${lohName} shut the conversation down after being asked repeatedly.`
    : actionId === 'ask_loh_target' && priorLohAsks === 2
      ? `${lohName} said they had already answered and became annoyed by the pressure.`
      : actionId === 'ask_loh_target' && !lohTargetPlan
        ? `${lohName} kept their plan deliberately vague.`
    : lohTargetPlan && outcome === 'success'
      ? lohTargetPlan.isBackdoor
        ? `${lohTargetPlan.targetName} is the LOH's backup plan if the nominations change.`
      : `${lohTargetPlan.targetName} is the LOH's current target.`
    : relationshipDelta !== 0
      ? `${action.title} ${verb} (${sign}${relationshipDelta} relationship)`
      : `${action.title} ${verb}`);

  return { success: true, delta: relationshipDelta, newEnergy, summary, score: finalScore, label: finalLabel };
}

// ── Named export for convenience ──────────────────────────────────────────

export const SocialManeuvers = {
  getActionById,
  getAvailableActions,
  canAfford,
  computeActionCost,
  computeActionCosts,
  executeAction,
};

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__socialManeuvers'] = {
    getActionById,
    getAvailableActions,
    canAfford,
    computeActionCost,
    computeActionCosts,
    executeAction,
  };
}
