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

import { getSocialOutcomeCopy, type SocialOutcomeKind } from './socialOutcomeCopy';
import { SOCIAL_ACTIONS, resolveActionTargetMode } from './socialActions';
import type { SocialActionDefinition } from './socialActions';
import { evaluateSocialActionEligibility } from './socialActionEligibility';
import { socialConfig } from './socialConfig';
import { normalizeAffinity } from './affinityUtils';
import {
  normalizeActionCost,
  normalizeActionCosts,
  normalizeActionYields,
} from './smExecNormalize';
import { initEnergyBank, SocialEnergyBank } from './SocialEnergyBank';
import { computeOutcomeDelta, evaluateOutcome, OUTCOME_THRESHOLDS } from './SocialPolicy';
import {
  recordSocialAction,
  updateRelationship,
  applyInfluenceDelta,
  applyInfoDelta,
} from './socialSlice';
import { ALLIANCE_TAG, BETRAYAL_TAG, hasAllianceBetween } from './socialAlliance';
import type { SocialActionLogEntry, SocialState } from './types';
import { getSocialResourceEffect } from './socialResourceEconomy';

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

interface ManeuverPlayer {
  id: string;
  name: string;
  status: string;
  isUser?: boolean;
}

interface ManeuverGameState {
  players: ManeuverPlayer[];
  week?: number;
  phase?: string;
  lohId?: string | null;
  nomineeIds?: string[];
}


interface StateForManeuvers {
  settings?: { gameUX?: { dramaMode?: boolean } };
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
      entry.actorId === actorId && entry.targetId === targetId && entry.actionId === actionId,
  ).length;
}

function buildSnoopNarrative(
  social: SocialState,
  actorId: string,
  players: ManeuverPlayer[],
): string {
  const secret = social.dramaNetwork.arcs.find(
    (arc) =>
      arc.status === 'active' &&
      !arc.public &&
      (arc.type === 'romance' || arc.type === 'bromance') &&
      !arc.participantIds.includes(actorId) &&
      !(arc.discoveredByIds ?? []).includes(actorId),
  );
  if (!secret) {
    return 'You checked the hallway, storage room and whisper chain, but found no usable lead this time.';
  }
  const names = secret.participantIds.map(
    (id) => players.find((player) => player.id === id)?.name ?? 'another housemate',
  );
  if (secret.type === 'romance') {
    return `You caught ${names[0]} and ${names[1]} slipping away together after lights-out. Their secret romance is now yours to keep, trade or expose.`;
  }
  return `You overheard ${names[0]} and ${names[1]} making a private loyalty pact. You now know their bromance is more strategic than it looks.`;
}

function buildLohTargetNarrative(
  social: SocialState,
  game: ManeuverGameState | undefined,
  actorId: string,
  lohId: string,
  priorRepeats: number,
): string {
  const lohName = game?.players.find((player) => player.id === lohId)?.name ?? 'The LOH';
  if (priorRepeats >= 2) {
    return `${lohName}: "I have answered this already. Stop pressing me."`;
  }
  if (priorRepeats === 1) {
    return `${lohName}: "My answer has not changed. Watch what happens at the ceremony."`;
  }
  const nominees = new Set(game?.nomineeIds ?? []);
  const candidates = (game?.players ?? [])
    .filter(
      (player) =>
        player.id !== lohId &&
        player.status !== 'evicted' &&
        player.status !== 'jury' &&
        !nominees.has(player.id),
    )
    .sort(
      (a, b) =>
        (social.relationships[lohId]?.[a.id]?.affinity ?? 0) -
        (social.relationships[lohId]?.[b.id]?.affinity ?? 0),
    );
  const likelyTarget = candidates[0];
  if (!likelyTarget || likelyTarget.id === actorId) {
    return `${lohName}: "I am still weighing my options. I am not giving you a name yet."`;
  }
  if (nominees.size > 0) {
    return `${lohName}: "If safety changes my nominations, ${likelyTarget.name} is my current backup plan."`;
  }
  return `${lohName}: "Right now, ${likelyTarget.name} is the person I am watching most closely."`;
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
    delta: randomIntegerInclusive(REPEATED_POSITIVE_MIN_DELTA, REPEATED_POSITIVE_MAX_DELTA, random),
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
  const resolvedState = state ?? (_store?.getState() as StateForManeuvers | null);
  const socialState = resolvedState?.social;
  const dramaMode = resolvedState?.settings?.gameUX?.dramaMode === true;
  return SOCIAL_ACTIONS.filter((action) => {
    if (!canAfford(actorId, normalizeActionCosts(action, 0, dramaMode), state)) {
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
  targetCount = 0,
  dramaMode = false,
): number {
  return normalizeActionCost(action, targetCount, dramaMode);
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
  /** Per-recipient deltas for an atomic multi-target action. */
  targetDeltas?: Record<string, number>;
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
    return {
      success: false,
      delta: 0,
      newEnergy: 0,
      summary: 'Store not initialised',
      score: 0,
      label: 'Unmoved',
    };
  }

  const action = getActionById(actionId);
  if (!action) {
    return {
      success: false,
      delta: 0,
      newEnergy: SocialEnergyBank.get(actorId),
      summary: 'Unknown action',
      score: 0,
      label: 'Unmoved',
    };
  }

  const currentEnergy = SocialEnergyBank.get(actorId);
  const state = _store.getState() as {
    social: SocialState;
    game?: ManeuverGameState;
    settings?: { gameUX?: { dramaMode?: boolean } };
  };

  const dramaMode = state.settings?.gameUX?.dramaMode === true;
  const costs = normalizeActionCosts(action, 0, dramaMode);
  if (action.dramaOnly && state.settings?.gameUX?.dramaMode !== true) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'Drama Mode required',
      score: 0,
      label: 'Unavailable',
    };
  }

  if (
    actionId === 'proposeAlliance' &&
    hasAllianceBetween(state.social.relationships, actorId, targetId)
  ) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'Already allied',
      score: 0,
      label: 'Unmoved',
    };
  }

  const eligibility = evaluateSocialActionEligibility({
    action,
    actorId,
    targetIds:
      action.targetMode === 'none' || action.needsTargets === false ? [] : [targetId],
    subjectId: options?.subjectId,
    phase: state.game?.phase,
    players: state.game?.players,
    relationships: state.social.relationships,
    dramaNetwork: state.social.dramaNetwork,
    dramaMode: state.settings?.gameUX?.dramaMode === true,
    requireCompleteSelection: true,
    allowAIOnly: true,
  });
  if (!eligibility.eligible) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: eligibility.reason,
      score: 0,
      label: 'Unavailable',
    };
  }

  if (!canAfford(actorId, costs)) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'Insufficient resources',
      score: 0,
      label: 'Unmoved',
    };
  }
  if (
    dramaMode && actionId === 'betray' &&
    !hasAllianceBetween(state.social.relationships, actorId, targetId)
  ) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'You can only betray an active ally.',
      score: 0,
      label: 'Unavailable',
    };
  }

  if (
    actionId === 'ask_loh_target' &&
    (state.game?.lohId !== targetId ||
      !state.game?.phase ||
      !(action.dramaAllowedPhases ?? action.allowedPhases)?.includes(state.game.phase))
  ) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'The LOH target question is not available at this point in the week.',
      score: 0,
      label: 'Unavailable',
    };
  }


  const scaledYields = normalizeActionYields(action);
  const random = options?.random ?? Math.random;
  const priorRepeats = countPriorRepeatedActions(
    state.social.sessionLogs,
    actorId,
    targetId,
    actionId,
  );
  // Acceptance belongs to the recipient, so use their view of the proposer.
  const existingAffinity = state.social.relationships[targetId]?.[actorId]?.affinity ?? 0;
  let outcome = options?.outcome ?? 'success';
  const betrayalOccurred = false;
  let gaslightOccurred = false;
  if (actionId === 'proposeAlliance' && !options?.outcome) {
    const acceptChance = getAllianceAcceptChance(existingAffinity, priorRepeats);
    const accepted = random() < acceptChance;
    if (!accepted) {
      outcome = 'failure';
      gaslightOccurred =
        existingAffinity < ALLIANCE_GASLIGHT_AFFINITY_THRESHOLD && priorRepeats > 0;
    }
  }
  if (actionId === 'ask_use_safety' && !options?.outcome) {
    const beneficiaryId = options?.subjectId ?? actorId;
    const recipientView = state.social.relationships[targetId]?.[beneficiaryId];
    const tags = new Set(recipientView?.tags ?? []);
    let acceptanceChance = 0.3 + normalizeAffinity(recipientView?.affinity ?? 0) * 0.5;
    if (tags.has('alliance')) acceptanceChance += 0.25;
    if (tags.has('romance') || tags.has('bromance')) acceptanceChance += 0.18;
    if (tags.has('protection') || tags.has('safety_promise')) acceptanceChance += 0.12;
    if (tags.has('betrayal')) acceptanceChance = 0.02;
    else if (tags.has('target') || tags.has('rivalry')) acceptanceChance = Math.min(0.08, acceptanceChance);
    if (random() >= Math.max(0.02, Math.min(0.94, acceptanceChance))) outcome = 'failure';
  }
  const baseDelta =
    actionId === 'proposeAlliance' && outcome === 'failure'
      ? getAllianceFailureDelta(gaslightOccurred)
      : computeOutcomeDelta(actionId, actorId, targetId, outcome);
  const repeatSensitive =
    outcome === 'success' && isRepeatSensitiveAction(action, baseDelta, scaledYields);
  const repeatedPositive =
    repeatSensitive && baseDelta > 0
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

  // Apply outcome-sensitive gains or losses after paying the action costs.
  const resourceEffect = dramaMode
    ? getSocialResourceEffect(action, didBackfire ? 'backfire' : outcome)
    : outcome === 'success'
      ? {
          influence: didBackfire ? -scaledYields.influence : scaledYields.influence,
          info: didBackfire ? -scaledYields.info : scaledYields.info,
        }
      : { influence: 0, info: 0 };
  const appliedYields = { influence: 0, info: 0 };
    if (resourceEffect.influence !== 0) {
      const appliedInfluenceDelta = clampResourceAdjustment(
        resourceEffect.influence,
        postSpendInfluenceBalance,
      );
      if (appliedInfluenceDelta !== 0) {
        _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: appliedInfluenceDelta }));
      }
      appliedYields.influence = appliedInfluenceDelta;
    }
    if (resourceEffect.info !== 0) {
      const appliedInfoDelta = clampResourceAdjustment(resourceEffect.info, postSpendInfoBalance);
      if (appliedInfoDelta !== 0) {
        _store.dispatch(applyInfoDelta({ playerId: actorId, delta: appliedInfoDelta }));
      }
      appliedYields.info = appliedInfoDelta;
    }

  // Read balances after all mutations
  const stateAfter = _store.getState() as { social: SocialState; game?: { week?: number } };
  const balancesAfter = {
    energy: stateAfter.social.energyBank[actorId] ?? 0,
    influence: stateAfter.social.influenceBank[actorId] ?? 0,
    info: stateAfter.social.infoBank[actorId] ?? 0,
  };

  const subjectId = options?.subjectId;

  const narrative =
    outcome !== 'success'
      ? undefined
      : actionId === 'snoop_around'
        ? buildSnoopNarrative(state.social, actorId, state.game?.players ?? [])
        : actionId === 'ask_loh_target'
          ? buildLohTargetNarrative(state.social, state.game, actorId, targetId, priorRepeats)
          : undefined;

  const entry: SocialActionLogEntry = {
    actionId,
    actorId,
    targetId,
    ...(subjectId ? { subjectId } : {}),
    ...(narrative ? { narrative } : {}),

    cost: costs.energy,
    costs,
    delta,
    outcome,
    newEnergy,
    balancesAfter,
    timestamp: Date.now(),
    week: stateAfter.game?.week,
    score: finalScore,
    label: finalLabel,
    source: options?.source ?? 'system',
  };
  if (appliedYields.influence !== 0 || appliedYields.info !== 0) {
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

  if ((actionId === 'break_alliance' || actionId === 'break_bromance') && outcome === 'success') {
    _store.dispatch(
      updateRelationship({
        source: targetId,
        target: actorId,
        delta: -5,
        tags: [BETRAYAL_TAG],
        actionSource: options?.source ?? 'system',
      }),
    );
  }

  if (actionId === 'end_romance' && outcome === 'success') {
    _store.dispatch(
      updateRelationship({
        source: targetId,
        target: actorId,
        delta: -5,
        tags: ['ex'],
        actionSource: options?.source ?? 'system',
      }),
    );
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

  if (actionId === 'ask_use_safety' && outcome === 'success') {
    const beneficiaryId = subjectId ?? actorId;
    _store.dispatch(
      updateRelationship({
        source: targetId,
        target: beneficiaryId,
        delta: 0,
        tags: ['safety_promise'],
        actionSource: 'system',
      }),
    );
  }

  _store.dispatch(recordSocialAction({ entry }));

  const verb = getOutcomeVerb({ betrayalOccurred, gaslightOccurred, didBackfire, outcome });
  const sign = delta > 0 ? '+' : '';
  const summary =
    delta !== 0 ? `${action.title} ${verb} (${sign}${delta} affinity)` : `${action.title} ${verb}`;


  if (state.settings?.gameUX?.dramaMode === true) {
    const outcomeKind: SocialOutcomeKind = betrayalOccurred
      ? 'betrayal'
      : gaslightOccurred
        ? 'gaslight'
        : didBackfire
          ? 'backfire'
          : outcome;
    return {
      success: true,
      delta,
      newEnergy,
      summary: narrative ?? getSocialOutcomeCopy({ actionId, actionTitle: action.title, kind: outcomeKind, delta }),
      score: finalScore,
      label: finalLabel,
    };
  }
  return { success: true, delta, newEnergy, summary: narrative ?? summary, score: finalScore, label: finalLabel };
}

/**
 * Execute one atomic multi-target action. Validation and affordability happen
 * before any mutation, so a group action can never partially spend or apply.
 */
export function executeGroupAction(
  actorId: string,
  rawTargetIds: readonly string[],
  actionId: string,
  options?: ExecuteActionOptions,
): ExecuteActionResult {
  const currentEnergy = SocialEnergyBank.get(actorId);
  const unavailable = (summary: string): ExecuteActionResult => ({
    success: false,
    delta: 0,
    newEnergy: currentEnergy,
    summary,
    score: 0,
    label: 'Unavailable',
  });
  if (!_store) return unavailable('Store not initialised');

  const action = getActionById(actionId);
  if (!action) return unavailable('Unknown action');

  const targetIds = [...new Set(rawTargetIds)].filter((id) => id && id !== actorId);
  const state = _store.getState() as {
    social: SocialState;
    game?: ManeuverGameState;
    settings?: { gameUX?: { dramaMode?: boolean } };
  };
  const dramaMode = state.settings?.gameUX?.dramaMode === true;
  if (resolveActionTargetMode(action, dramaMode) !== 'multi') return unavailable('This is not a group action');
  const eligibility = evaluateSocialActionEligibility({
    action,
    actorId,
    targetIds,
    phase: state.game?.phase,
    players: state.game?.players,
    relationships: state.social.relationships,
    dramaNetwork: state.social.dramaNetwork,
    dramaMode: state.settings?.gameUX?.dramaMode === true,
    requireCompleteSelection: true,
    allowAIOnly: true,
  });
  if (!eligibility.eligible) return unavailable(eligibility.reason);

  const costs = normalizeActionCosts(action, targetIds.length, dramaMode);
  if (!canAfford(actorId, costs)) {
    return {
      ...unavailable(
        'Not enough resources: Group Chat needs ' + costs.energy + ' energy for ' +
          targetIds.length + ' housemates.',
      ),
      label: 'Unmoved',
    };
  }

  const random = options?.random ?? Math.random;
  const outcome = options?.outcome ?? 'success';
  const targetDeltas: Record<string, number> = {};
  let anyBackfire = false;
  for (const targetId of targetIds) {
    const repeats = countPriorRepeatedActions(
      state.social.sessionLogs,
      actorId,
      targetId,
      actionId,
    );
    const baseDelta = computeOutcomeDelta(actionId, actorId, targetId, outcome);
    const repeated =
      outcome === 'success' && baseDelta > 0
        ? computeRepeatedPositiveDelta(repeats, random)
        : { delta: baseDelta, didBackfire: false };
    targetDeltas[targetId] = repeated.delta;
    anyBackfire ||= repeated.didBackfire;
  }

  const deltas = Object.values(targetDeltas);
  const averageDelta = Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
  const scoreResult = evaluateOutcome({
    actionId,
    actorId,
    targetIds,
    mode: options?.previewOnly ? 'preview' : 'execute',
    outcome,
    relationships: state.social.relationships,
  });
  const finalScore = anyBackfire ? -Math.abs(scoreResult.score) : scoreResult.score;
  const finalLabel = anyBackfire ? scoreToLabel(finalScore) : scoreResult.label;

  if (options?.previewOnly) {
    return {
      success: true,
      delta: averageDelta,
      targetDeltas,
      newEnergy: currentEnergy,
      summary: 'Group Chat preview for ' + targetIds.length + ' housemates',
      score: finalScore,
      label: finalLabel,
    };
  }

  const newEnergy = SocialEnergyBank.add(actorId, -costs.energy);
  const currentInfluence = state.social.influenceBank[actorId] ?? 0;
  const currentInfo = state.social.infoBank[actorId] ?? 0;
  if (costs.influence > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -costs.influence }));
  }
  if (costs.info > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -costs.info }));
  }

  const effect = getSocialResourceEffect(
    action,
    anyBackfire ? 'backfire' : outcome,
    targetIds.length,
  );
  const appliedEffect = {
    influence: clampResourceAdjustment(effect.influence, currentInfluence - costs.influence),
    info: clampResourceAdjustment(effect.info, currentInfo - costs.info),
  };
  if (appliedEffect.influence !== 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: appliedEffect.influence }));
  }
  if (appliedEffect.info !== 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: appliedEffect.info }));
  }

  for (const targetId of targetIds) {
    _store.dispatch(
      updateRelationship({
        source: actorId,
        target: targetId,
        delta: targetDeltas[targetId],
        actionSource: options?.source ?? 'system',
      }),
    );
  }

  const stateAfter = _store.getState() as { social: SocialState; game?: { week?: number } };
  const entry: SocialActionLogEntry = {
    actionId,
    actorId,
    targetId: targetIds[0],
    targetIds,
    targetDeltas,
    cost: costs.energy,
    costs,
    delta: averageDelta,
    outcome,
    newEnergy,
    balancesAfter: {
      energy: stateAfter.social.energyBank[actorId] ?? 0,
      influence: stateAfter.social.influenceBank[actorId] ?? 0,
      info: stateAfter.social.infoBank[actorId] ?? 0,
    },
    yieldsApplied: {
      ...(appliedEffect.influence !== 0 ? { influence: appliedEffect.influence } : {}),
      ...(appliedEffect.info !== 0 ? { info: appliedEffect.info } : {}),
    },
    narrative:
      'You brought ' + targetIds.length +
      ' housemates into one conversation; each reacted according to your history with them.',
    timestamp: Date.now(),
    week: stateAfter.game?.week,
    score: finalScore,
    label: finalLabel,
    source: options?.source ?? 'system',
  };
  _store.dispatch(recordSocialAction({ entry }));

  return {
    success: true,
    delta: averageDelta,
    targetDeltas,
    newEnergy,
    summary:
      'Group Chat reached ' + targetIds.length + ' housemates for ' + costs.energy + ' energy.',
    score: finalScore,
    label: finalLabel,
  };
}
// ── Named export for convenience ──────────────────────────────────────────

export const SocialManeuvers = {
  getActionById,
  getAvailableActions,
  canAfford,
  computeActionCost,
  executeAction,
  executeGroupAction,
};

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__socialManeuvers'] = {
    getActionById,
    getAvailableActions,
    canAfford,
    computeActionCost,
    executeAction,
    executeGroupAction,
  };
}
