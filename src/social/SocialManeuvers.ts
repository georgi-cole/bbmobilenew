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

import { getSocialOutcomeCopy, type SocialOutcomeKind } from './socialOutcomeCopy'
import { resolveActionTargetMode } from './socialActions'
import type { SocialActionDefinition } from './socialActions'
import { evaluateSocialActionEligibility } from './socialActionEligibility'
import { socialConfig } from './socialConfig'
import { normalizeAffinity } from './affinityUtils'
import { normalizeActionCost, normalizeActionCosts, normalizeActionYields } from './smExecNormalize'
import { initEnergyBank, SocialEnergyBank } from './SocialEnergyBank'
import { computeOutcomeDelta, evaluateOutcome, OUTCOME_THRESHOLDS } from './SocialPolicy'
import {
  recordSocialAction,
  updateRelationship,
  applyInfluenceDelta,
  applyInfoDelta,
} from './socialSlice'
import {
  ALLIANCE_TAG,
  BETRAYAL_TAG,
  MIN_ALLIANCE_AFFINITY,
  hasAllianceBetween,
} from './socialAlliance'
import type { SocialActionLogEntry, SocialState } from './types'
import { getSocialResourceEffect } from './socialResourceEconomy'
import { getEffectiveSocialMode } from './socialMode'
import { getPersistentSocialHistory, type SocialStateWithHistory } from './socialHistory'
import {
  getRuntimeSocialActionById,
  getRuntimeSocialActions,
  isActionAllowedForRealityPreset,
} from './socialActionManager'

// ── Internal store reference ──────────────────────────────────────────────

interface StoreAPI {
  dispatch: (action: unknown) => unknown
  getState: () => unknown
}

/**
 * Partial SocialState snapshot accepted by getAvailableActions and
 * computeActionCost. Only the fields actively read by those functions are
 * required — lastReport and influenceWeights are not needed here.
 * influenceBank and infoBank are optional to allow snapshots that pre-date
 * multi-resource support (absent banks are treated as empty / all zeros).
 */
type PartialSocialState = {
  energyBank: Record<string, number>
  influenceBank?: Record<string, number>
  infoBank?: Record<string, number>
  relationships: SocialState['relationships']
  sessionLogs: SocialActionLogEntry[]
  actionHistory?: SocialActionLogEntry[]
}

interface ManeuverPlayer {
  id: string
  name: string
  status: string
  isUser?: boolean
}

interface ManeuverGameState {
  players: ManeuverPlayer[]
  week?: number
  phase?: string
  lohId?: string | null
  nomineeIds?: string[]
  dramaSocialMode?: boolean
  lohSocialPlan?: {
    week: number
    lohId: string
    currentTargetId: string | null
    backupTargetId: string | null
    askCountsByPlayerId: Record<string, number>
    disclosedTargetByPlayerId?: Record<string, string>
  } | null
}

interface StateForManeuvers {
  game?: ManeuverGameState
  settings?: { gameUX?: { dramaMode?: boolean; realityModePreset?: string } }
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
  social: PartialSocialState
}

let _store: StoreAPI | null = null
const FIRST_POSITIVE_MIN_DELTA = 1
const FIRST_POSITIVE_MAX_DELTA = 5
const REPEATED_POSITIVE_MIN_DELTA = 1
const REPEATED_POSITIVE_MAX_DELTA = 3
const PHASE_REPETITION_SUCCESS_CHANCES = [0.8, 0.5, 0.25] as const
const INFORMATION_REPETITION_SUCCESS_CHANCES = [1, 0.75, 0.3] as const
const ALLIANCE_REJECTION_DELTA = -6
const ALLIANCE_GASLIGHT_DELTA = -10
const ALLIANCE_BETRAYAL_DELTA = -8
const ALLIANCE_GASLIGHT_AFFINITY_THRESHOLD = 0

function countPriorRepeatedActions(
  logs: SocialActionLogEntry[],
  actorId: string,
  targetId: string,
  actionId: string,
  week?: number,
  phase?: string
): number {
  return logs.filter(
    (entry) =>
      entry.actorId === actorId &&
      entry.targetId === targetId &&
      entry.actionId === actionId &&
      entry.week === week &&
      entry.phase === phase
  ).length
}

function buildSnoopNarrative(
  social: SocialState,
  actorId: string,
  players: ManeuverPlayer[]
): string {
  const secret = social.dramaNetwork.arcs.find(
    (arc) =>
      arc.status === 'active' &&
      !arc.public &&
      (arc.type === 'romance' || arc.type === 'bromance') &&
      !arc.participantIds.includes(actorId) &&
      !(arc.discoveredByIds ?? []).includes(actorId)
  )
  if (!secret) {
    return 'You checked the hallway, storage room and whisper chain, but found no usable lead this time.'
  }
  const names = secret.participantIds.map(
    (id) => players.find((player) => player.id === id)?.name ?? 'another housemate'
  )
  if (secret.type === 'romance') {
    return `You caught ${names[0]} and ${names[1]} slipping away together after lights-out. Their secret romance is now yours to keep, trade or expose.`
  }
  return `You overheard ${names[0]} and ${names[1]} making a private loyalty pact. You now know their bromance is more strategic than it looks.`
}

function buildLohTargetNarrative(
  social: SocialState,
  game: ManeuverGameState | undefined,
  actorId: string,
  lohId: string,
  priorRepeats: number
): string {
  const lohName = game?.players.find((player) => player.id === lohId)?.name ?? 'The LOH'
  if (priorRepeats >= 2) {
    return `${lohName}: "I have answered this already. Stop pressing me."`
  }
  if (priorRepeats === 1) {
    return `${lohName}: "My answer has not changed. Watch what happens at the ceremony."`
  }
  const nominees = new Set(game?.nomineeIds ?? [])
  const candidates = (game?.players ?? [])
    .filter(
      (player) =>
        player.id !== lohId &&
        player.status !== 'evicted' &&
        player.status !== 'jury' &&
        !nominees.has(player.id)
    )
    .sort(
      (a, b) =>
        (social.relationships[lohId]?.[a.id]?.affinity ?? 0) -
        (social.relationships[lohId]?.[b.id]?.affinity ?? 0)
    )
  const likelyTarget = candidates[0]
  if (!likelyTarget || likelyTarget.id === actorId) {
    return `${lohName}: "I am still weighing my options. I am not giving you a name yet."`
  }
  if (nominees.size > 0) {
    return `${lohName}: "If safety changes my nominations, ${likelyTarget.name} is my current backup plan."`
  }
  return `${lohName}: "Right now, ${likelyTarget.name} is the person I am watching most closely."`
}

function getRepetitionSuccessChances(
  action: SocialActionDefinition,
  delta: number,
  yields: { influence: number; info: number }
): readonly number[] | null {
  if (action.targetMode === 'none' || action.needsTargets === false) {
    return null
  }
  if (action.kind === 'intel_gain' && (yields.info > 0 || delta > 0)) {
    return INFORMATION_REPETITION_SUCCESS_CHANCES
  }
  if (action.kind === 'rapport' && (delta > 0 || yields.influence > 0)) {
    return PHASE_REPETITION_SUCCESS_CHANCES
  }
  return null
}

function randomIntegerInclusive(min: number, max: number, random: () => number): number {
  const normalized = Math.max(0, Math.min(0.999999999, random()))
  return min + Math.floor(normalized * (max - min + 1))
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
  successChances: readonly number[] = PHASE_REPETITION_SUCCESS_CHANCES
): { delta: number; didBackfire: boolean } {
  const successChance = successChances[priorRepeats] ?? 0.02
  if (random() >= successChance) {
    return {
      delta: priorRepeats <= 0 ? 0 : priorRepeats === 1 ? -1 : priorRepeats === 2 ? -3 : -5,
      didBackfire: priorRepeats > 0,
    }
  }
  if (priorRepeats <= 0) {
    return {
      delta: randomIntegerInclusive(FIRST_POSITIVE_MIN_DELTA, FIRST_POSITIVE_MAX_DELTA, random),
      didBackfire: false,
    }
  }
  return {
    delta:
      priorRepeats === 1
        ? randomIntegerInclusive(REPEATED_POSITIVE_MIN_DELTA, REPEATED_POSITIVE_MAX_DELTA, random)
        : priorRepeats === 2
          ? randomIntegerInclusive(1, 2, random)
          : 1,
    didBackfire: false,
  }
}

function scoreToLabel(score: number): 'Bad' | 'Unmoved' | 'Good' | 'Great' {
  if (score <= OUTCOME_THRESHOLDS.bad) return 'Bad'
  if (score < OUTCOME_THRESHOLDS.unmoved) return 'Unmoved'
  if (score < OUTCOME_THRESHOLDS.good) return 'Good'
  return 'Great'
}

function clampResourceAdjustment(delta: number, availableBalance: number): number {
  return delta < 0 ? -Math.min(Math.abs(delta), availableBalance) : delta
}

function getAdvancedAllianceAcceptChance(
  proposerAffinity: number,
  recipientTrust: number,
  priorRepeats: number,
  context: { proposerIsLoh: boolean; proposerHasSafety: boolean; recipientIsNominated: boolean }
): number {
  const proposer = normalizeAffinity(proposerAffinity)
  const recipient = normalizeAffinity(recipientTrust)
  const mutual = (proposer + recipient) / 2
  if (Math.min(proposer, recipient) <= -0.35) return 0.02
  const relationshipChance =
    mutual >= socialConfig.relationshipThresholds.allyThreshold
      ? 0.82 + mutual * 0.12
      : 0.08 + Math.max(0, mutual) * 0.85
  const leverageBonus =
    (context.proposerIsLoh ? 0.28 : 0) +
    (context.proposerHasSafety ? 0.08 : 0) +
    (context.recipientIsNominated ? 0.14 : 0)
  const hostilityCap = Math.min(proposer, recipient) < -0.1 ? 0.22 : 0.95
  return Math.max(
    0.02,
    Math.min(hostilityCap, relationshipChance + leverageBonus - priorRepeats * 0.14)
  )
}

function getStandardAllianceAcceptChance(affinity: number, priorRepeats: number): number {
  const normalizedAffinity = normalizeAffinity(affinity)
  const baseChance =
    normalizedAffinity >= socialConfig.relationshipThresholds.allyThreshold
      ? 0.9
      : 0.5 + normalizedAffinity * 0.45
  return Math.max(0.08, Math.min(0.96, baseChance - priorRepeats * 0.12))
}

function getAdvancedAllianceFailureDelta(
  gaslightOccurred: boolean,
  proposerAffinity: number,
  recipientTrust: number
): number {
  if (gaslightOccurred) return ALLIANCE_GASLIGHT_DELTA
  const mutual = (normalizeAffinity(proposerAffinity) + normalizeAffinity(recipientTrust)) / 2
  if (mutual >= 0.2) return -2
  if (mutual >= 0) return -4
  return ALLIANCE_REJECTION_DELTA
}

function getStandardAllianceFailureDelta(gaslightOccurred: boolean): number {
  return gaslightOccurred ? ALLIANCE_GASLIGHT_DELTA : ALLIANCE_REJECTION_DELTA
}
function getAllianceBetrayalChance(affinity: number): number {
  const normalizedAffinity = normalizeAffinity(affinity)
  if (normalizedAffinity < -0.15) return 0.35
  if (normalizedAffinity < 0.2) return 0.16
  return 0.04
}

function getLohTargetPlan(
  game:
    | {
        players?: Array<{ id: string; name?: string; status: string }>
        nomineeIds?: string[]
      }
    | undefined,
  relationships: SocialState['relationships'],
  lohId: string
): {
  targetId: string
  targetName: string
  isBackdoor: boolean
  currentTargetId: string | null
  backupTargetId: string | null
} | null {
  const players = (game?.players ?? []).filter(
    (player) => player.id !== lohId && player.status !== 'evicted' && player.status !== 'jury'
  )
  if (players.length === 0) return null
  const score = (playerId: string) => relationships[lohId]?.[playerId]?.affinity ?? 0
  const lowest = (pool: typeof players) =>
    [...pool].sort((left, right) => score(left.id) - score(right.id))[0]
  const nomineeIds = new Set(game?.nomineeIds ?? [])
  const nominees = players.filter((player) => nomineeIds.has(player.id))
  const nonNominees = players.filter((player) => !nomineeIds.has(player.id))
  const nomineeTarget = nominees.length > 0 ? lowest(nominees) : null
  const backdoorTarget = nonNominees.length > 0 ? lowest(nonNominees) : null
  const isBackdoor =
    !!nomineeTarget && !!backdoorTarget && score(backdoorTarget.id) <= score(nomineeTarget.id) - 12
  const currentTarget = nomineeTarget ?? lowest(players)
  const target = isBackdoor ? backdoorTarget! : currentTarget
  return {
    targetId: target.id,
    targetName: target.name ?? target.id,
    isBackdoor,
    currentTargetId: currentTarget?.id ?? null,
    backupTargetId: backdoorTarget?.id ?? null,
  }
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
  actionId: string
  actorId: string
  targetId: string
  subjectId?: string
  recipientTrust: number
  game?: {
    players?: Array<{ id: string; name?: string; status: string }>
    nomineeIds?: string[]
    lohId?: string | null
    nominationContext?: { autoNomineeId: string | null } | null
  }
  relationships: SocialState['relationships']
}): string | null {
  const name = (id: string | undefined) =>
    game?.players?.find((player) => player.id === id)?.name ?? id ?? 'that player'
  if (actionId === 'ask_why_nominated') {
    const lohName = name(targetId)
    if (game?.nominationContext?.autoNomineeId === actorId) {
      return `${lohName} explained that you entered danger automatically after the competition, not as their personal nominee.`
    }
    if (recipientTrust >= 30)
      return `${lohName} said they respect you, but your competition potential made you too dangerous to leave comfortable.`
    if (recipientTrust < 0)
      return `${lohName} admitted they do not trust your position and wanted to force you to show your hand.`
    return `${lohName} said they needed options and believed you were connected enough to survive without becoming an immediate enemy.`
  }
  if (actionId === 'ask_safety_plan') {
    const holderName = name(targetId)
    const holder = game?.players?.find((player) => player.id === targetId)
    if (holder?.status.includes('nominated'))
      return `${holderName} said they have no real choice: they intend to use Safety on themselves.`
    const actor = game?.players?.find((player) => player.id === actorId)
    const actorIsHoh = game?.lohId === actorId || actor?.status.includes('loh') === true
    const disclosureThreshold = actorIsHoh ? -5 : 25
    if (recipientTrust < disclosureThreshold)
      return `${holderName} stayed vague and said everyone would learn the decision at the ceremony.`
    const nominee = (game?.nomineeIds ?? [])
      .map((id) => ({ id, affinity: relationships[targetId]?.[id]?.affinity ?? 0 }))
      .sort((left, right) => right.affinity - left.affinity)[0]
    return nominee
      ? actorIsHoh
        ? `${holderName} said they are leaning toward using Safety on ${name(nominee.id)}.`
        : `${holderName} trusted you enough to say they are leaning toward using Safety on ${name(nominee.id)}.`
      : `${holderName} said they are currently leaning toward leaving the nominations unchanged.`
  }
  if (actionId === 'ask_use_safety') {
    return recipientTrust >= 20
      ? `${name(targetId)} said they would seriously consider using Safety on ${name(subjectId)} but made no promise.`
      : `${name(targetId)} listened to the request about ${name(subjectId)} and refused to reveal the decision.`
  }
  if (actionId === 'ask_hold_safety') {
    return recipientTrust >= 20
      ? `${name(targetId)} acknowledged the LOH's request to leave nominations unchanged, while keeping the final decision.`
      : `${name(targetId)} rejected the pressure and said the Safety decision belongs to them alone.`
  }
  return null
}

function getOutcomeVerb({
  betrayalOccurred,
  gaslightOccurred,
  didBackfire,
  outcome,
}: {
  betrayalOccurred: boolean
  gaslightOccurred: boolean
  didBackfire: boolean
  outcome: 'success' | 'failure'
}): string {
  if (betrayalOccurred) return 'was accepted, but they may be playing both sides'
  if (gaslightOccurred) return 'made things worse'
  if (didBackfire) return 'backfired'
  if (outcome === 'failure') return 'failed'
  return 'succeeded'
}

/**
 * Wire the Redux store for SocialManeuvers (and SocialEnergyBank internally).
 * Should be called once at bootstrap, typically from SocialEngine.init().
 */
export function initManeuvers(store: StoreAPI): void {
  _store = store
  initEnergyBank(store)
}

// ── Action lookup ─────────────────────────────────────────────────────────

/** Return the action definition for the given id, or undefined if not found. */
export function getActionById(id: string): SocialActionDefinition | undefined {
  return getRuntimeSocialActionById(id)
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
  state?: StateForManeuvers
): boolean {
  let energy: number
  let influence: number
  let info: number

  if (state) {
    energy = state.social.energyBank[actorId] ?? 0
    influence = state.social.influenceBank?.[actorId] ?? 0
    info = state.social.infoBank?.[actorId] ?? 0
  } else {
    const s = _store?.getState() as { social: SocialState } | null
    energy = s?.social.energyBank[actorId] ?? 0
    influence = s?.social.influenceBank?.[actorId] ?? 0
    info = s?.social.infoBank?.[actorId] ?? 0
  }

  return energy >= costs.energy && influence >= costs.influence && info >= costs.info
}

/**
 * Return all actions the actor can currently afford (all resources checked).
 * Reads from the provided state snapshot, or falls back to the Redux store.
 */
export function getAvailableActions(
  actorId: string,
  state?: StateForManeuvers,
  targetId?: string
): SocialActionDefinition[] {
  const resolvedState = state ?? (_store?.getState() as StateForManeuvers | null)
  const socialState = resolvedState?.social
  const dramaMode = getEffectiveSocialMode(resolvedState ?? {}) === 'drama'
  return getRuntimeSocialActions().filter((action) => {
    if (!canAfford(actorId, normalizeActionCosts(action, 0, dramaMode), state)) {
      return false
    }
    if (
      targetId &&
      action.id === 'proposeAlliance' &&
      socialState &&
      hasAllianceBetween(socialState.relationships, actorId, targetId)
    ) {
      return false
    }
    return true
  })
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
  dramaMode = false
): number {
  return normalizeActionCost(action, targetCount, dramaMode)
}

/** Return the complete multi-resource price for an action. */
export function computeActionCosts(
  _actorId: string,
  action: SocialActionDefinition,
  _targetId: string,
  _state?: StateForManeuvers,
  targetCount = 0,
  dramaMode = false
): { energy: number; influence: number; info: number } {
  return normalizeActionCosts(action, targetCount, dramaMode)
}

// ── Execution ─────────────────────────────────────────────────────────────

export interface ExecuteActionOptions {
  /** Override the outcome instead of defaulting to 'success'. */
  outcome?: 'success' | 'failure'
  /**
   * When true, the action is simulated but no state changes are dispatched.
   * Returns the outcome result without mutating energy, relationships, or logs.
   */
  previewOnly?: boolean
  /**
   * Origin of the action for activity routing.
   * Set to 'manual' for human-player actions and 'system' for AI/background actions.
   * Defaults to 'system' when omitted so un-tagged callers are treated conservatively.
   */
  source?: 'manual' | 'system'
  /**
   * Optional contextual subject for primaryPlusSubject actions.
   * Represents the person being talked *about* (as opposed to targetId, which is
   * the person being talked *to*).
   * When provided and the action succeeds, a lightweight tag is applied to the
   * primary target → subject relationship to reflect the conversation.
   */
  subjectId?: string
  /** Optional RNG override for deterministic simulations and tests. */
  random?: () => number
  /** Apply the action to another group member without charging the group cost again. */
  waiveCosts?: boolean
  /** Override the energy portion of the cost for dynamically priced actions. */
  energyCostOverride?: number
  /** Override the complete price when a UI batches several targets atomically. */
  costOverride?: { energy: number; influence: number; info: number }
  /** Reality orchestration already resolved the phase-scoped repetition roll. */
  repetitionAlreadyResolved?: boolean
}

export interface ExecuteActionResult {
  /** False when the actor lacks energy or the action is unknown. */
  success: boolean
  /** Affinity delta applied to the source→target relationship. */
  delta: number
  /** Actor's energy after the action (unchanged on failure). */
  newEnergy: number
  /** Human-readable summary of the outcome for UI display. */
  summary: string
  /** Normalised outcome score in [-1, +1] from the SocialPolicy evaluator. */
  score: number
  /** Human-readable outcome label (e.g. 'Good', 'Bad'). */
  /** Per-recipient deltas for an atomic multi-target action. */
  targetDeltas?: Record<string, number>
  label: string
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
  options?: ExecuteActionOptions
): ExecuteActionResult {
  if (!_store) {
    return {
      success: false,
      delta: 0,
      newEnergy: 0,
      summary: 'Store not initialised',
      score: 0,
      label: 'Unmoved',
    }
  }

  const action = getActionById(actionId)
  if (!action) {
    return {
      success: false,
      delta: 0,
      newEnergy: SocialEnergyBank.get(actorId),
      summary: 'Unknown action',
      score: 0,
      label: 'Unmoved',
    }
  }

  const currentEnergy = SocialEnergyBank.get(actorId)
  const state = _store.getState() as {
    social: SocialState
    game?: ManeuverGameState
    settings?: { gameUX?: { dramaMode?: boolean; realityModePreset?: string } }
    vip?: {
      isActive?: boolean
      entitlements?: { dramaMode?: boolean }
    }
  }

  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const realityPreset = state.settings?.gameUX?.realityModePreset
  if (realityPreset && !isActionAllowedForRealityPreset(action, realityPreset)) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'Unavailable for the selected Reality intensity',
      score: 0,
      label: 'Unavailable',
    }
  }
  const normalizedCosts = normalizeActionCosts(action, 0, dramaMode)
  const costs = options?.waiveCosts
    ? { energy: 0, influence: 0, info: 0 }
    : (options?.costOverride ?? {
        ...normalizedCosts,
        energy: options?.energyCostOverride ?? normalizedCosts.energy,
      })
  if (action.dramaOnly && !dramaMode) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'Reality Mode required',
      score: 0,
      label: 'Unavailable',
    }
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
    }
  }

  const eligibility = evaluateSocialActionEligibility({
    action,
    actorId,
    targetIds: resolveActionTargetMode(action, dramaMode) === 'none' ? [] : [targetId],
    subjectId: options?.subjectId,
    phase: state.game?.phase,
    players: state.game?.players,
    relationships: state.social.relationships,
    dramaNetwork: state.social.dramaNetwork,
    dramaMode,
    requireCompleteSelection: true,
    allowAIOnly: true,
  })
  if (!eligibility.eligible) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: eligibility.reason,
      score: 0,
      label: 'Unavailable',
    }
  }

  if (!canAfford(actorId, costs)) {
    return {
      success: false,
      delta: 0,
      newEnergy: currentEnergy,
      summary: 'Insufficient resources',
      score: 0,
      label: 'Unmoved',
    }
  }

  const scaledYields = options?.waiveCosts
    ? { influence: 0, info: 0 }
    : normalizeActionYields(action)
  const random = options?.random ?? Math.random
  const priorRepeats = countPriorRepeatedActions(
    getPersistentSocialHistory(state.social as SocialStateWithHistory),
    actorId,
    targetId,
    actionId,
    state.game?.week,
    state.game?.phase
  )
  const existingAffinity = state.social.relationships[actorId]?.[targetId]?.affinity ?? 0
  const recipientTrust = state.social.relationships[targetId]?.[actorId]?.affinity ?? 0
  const rootState = _store.getState() as {
    social: SocialState
    settings?: { gameUX?: { dramaMode?: boolean; realityModePreset?: string } }
    game?: {
      week?: number
      phase?: string
      lohId?: string | null
      posWinnerId?: string | null
      players?: Array<{ id: string; name?: string; status: string }>
      nomineeIds?: string[]
      nominationContext?: { autoNomineeId: string | null } | null
      lohSocialPlan?: {
        week: number
        lohId: string
        currentTargetId: string | null
        backupTargetId: string | null
        askCountsByPlayerId: Record<string, number>
        disclosedTargetByPlayerId?: Record<string, string>
      } | null
    }
  }
  const freshLohTargetPlan =
    actionId === 'ask_loh_target'
      ? getLohTargetPlan(rootState.game, state.social.relationships, targetId)
      : null
  const savedLohPlan = rootState.game?.lohSocialPlan
  const existingLohPlan =
    savedLohPlan && savedLohPlan.week === rootState.game?.week && savedLohPlan.lohId === targetId
      ? savedLohPlan
      : null
  const lohPlanState = freshLohTargetPlan
    ? (existingLohPlan ?? {
        week: rootState.game?.week ?? 0,
        lohId: targetId,
        currentTargetId: freshLohTargetPlan.currentTargetId,
        backupTargetId: freshLohTargetPlan.backupTargetId,
        askCountsByPlayerId: {},
        disclosedTargetByPlayerId: {},
      })
    : null
  const priorLohAsks = lohPlanState?.askCountsByPlayerId[actorId] ?? 0
  const finalBlockLocked = ['pos_ceremony_results', 'social_2', 'live_vote'].includes(
    rootState.game?.phase ?? ''
  )
  const safetyAdviceOpen = ['pos_results', 'pos_ceremony'].includes(rootState.game?.phase ?? '')
  const lohDisclosureId = lohPlanState
    ? finalBlockLocked
      ? lohPlanState.currentTargetId
      : priorLohAsks % 2 === 1 && lohPlanState.currentTargetId
        ? lohPlanState.currentTargetId
        : (lohPlanState.backupTargetId ?? lohPlanState.currentTargetId)
    : null
  const lohDisclosurePlayer = rootState.game?.players?.find(
    (player) => player.id === lohDisclosureId
  )
  // The LOH may share another name as misdirection, but should not casually tell
  // a player that *they* are the current or backup target.
  const lohWillDisclose =
    !!lohDisclosureId &&
    (!dramaMode || lohDisclosureId !== actorId) &&
    recipientTrust >= 0 &&
    priorLohAsks < 2
  const lohTargetPlan =
    lohWillDisclose && lohDisclosureId
      ? {
          targetId: lohDisclosureId,
          targetName: lohDisclosurePlayer?.name ?? lohDisclosureId,
          isBackdoor: lohDisclosureId === lohPlanState?.backupTargetId,
        }
      : null
  let outcome = options?.outcome ?? 'success'
  let betrayalOccurred = false
  let gaslightOccurred = false
  if (actionId === 'proposeAlliance' && !options?.outcome) {
    const recipientPlayer = rootState.game?.players?.find((player) => player.id === targetId)
    const acceptChance = dramaMode
      ? getAdvancedAllianceAcceptChance(existingAffinity, recipientTrust, priorRepeats, {
          proposerIsLoh: rootState.game?.lohId === actorId,
          proposerHasSafety: rootState.game?.posWinnerId === actorId,
          recipientIsNominated: recipientPlayer?.status.includes('nominated') ?? false,
        })
      : getStandardAllianceAcceptChance(existingAffinity, priorRepeats)
    const accepted = random() < acceptChance
    if (accepted && dramaMode && random() < getAllianceBetrayalChance(recipientTrust)) {
      betrayalOccurred = true
    }
    if (!accepted) {
      outcome = 'failure'
      gaslightOccurred = existingAffinity < ALLIANCE_GASLIGHT_AFFINITY_THRESHOLD && priorRepeats > 0
    }
  }
  if (actionId === 'ask_use_safety' && !options?.outcome) {
    const beneficiaryId = options?.subjectId ?? actorId
    const recipientView = state.social.relationships[targetId]?.[beneficiaryId]
    const tags = new Set(recipientView?.tags ?? [])
    let acceptanceChance = 0.3 + normalizeAffinity(recipientView?.affinity ?? 0) * 0.5
    if (tags.has('alliance')) acceptanceChance += 0.25
    if (tags.has('romance') || tags.has('bromance')) acceptanceChance += 0.18
    if (tags.has('protection') || tags.has('safety_promise')) acceptanceChance += 0.12
    if (tags.has('betrayal')) acceptanceChance = 0.02
    else if (tags.has('target') || tags.has('rivalry'))
      acceptanceChance = Math.min(0.08, acceptanceChance)
    if (random() >= Math.max(0.02, Math.min(0.94, acceptanceChance))) outcome = 'failure'
  }
  const baseDelta =
    actionId === 'proposeAlliance' && outcome === 'failure'
      ? dramaMode
        ? getAdvancedAllianceFailureDelta(gaslightOccurred, existingAffinity, recipientTrust)
        : getStandardAllianceFailureDelta(gaslightOccurred)
      : computeOutcomeDelta(actionId, actorId, targetId, outcome)
  const repetitionSuccessChances =
    outcome === 'success' ? getRepetitionSuccessChances(action, baseDelta, scaledYields) : null
  const repeatSensitive = repetitionSuccessChances !== null
  const repetitionResolution = repetitionSuccessChances
    ? options?.repetitionAlreadyResolved
      ? {
          delta:
            baseDelta > 0
              ? priorRepeats <= 0
                ? randomIntegerInclusive(FIRST_POSITIVE_MIN_DELTA, FIRST_POSITIVE_MAX_DELTA, random)
                : priorRepeats === 1
                  ? randomIntegerInclusive(
                      REPEATED_POSITIVE_MIN_DELTA,
                      REPEATED_POSITIVE_MAX_DELTA,
                      random
                    )
                  : priorRepeats === 2
                    ? randomIntegerInclusive(1, 2, random)
                    : 1
              : 1,
          didBackfire: false,
        }
      : computeRepeatedPositiveDelta(priorRepeats, random, repetitionSuccessChances)
    : {
        delta: baseDelta,
        didBackfire: false,
      }
  const didBackfire = repetitionResolution.didBackfire
  const repetitionMissed =
    repeatSensitive && !options?.repetitionAlreadyResolved && repetitionResolution.delta <= 0
  const delta =
    actionId === 'ask_loh_target' && priorLohAsks >= 2
      ? -Math.min(4, priorLohAsks)
      : actionId === 'ask_loh_target' && !lohWillDisclose
        ? 0
        : baseDelta > 0
          ? repetitionResolution.delta
          : baseDelta
  const formingAlliance =
    actionId === 'proposeAlliance' && outcome === 'success' && !betrayalOccurred
  const relationshipDelta = formingAlliance
    ? Math.max(delta, MIN_ALLIANCE_AFFINITY - existingAffinity)
    : delta
  const reciprocalAllianceDelta = formingAlliance
    ? Math.max(delta, MIN_ALLIANCE_AFFINITY - recipientTrust)
    : delta

  // Evaluate outcome score and label using the SocialPolicy evaluator.
  const mode = options?.previewOnly ? 'preview' : 'execute'
  const outcomeResult = evaluateOutcome({
    actionId,
    actorId,
    targetIds: targetId,
    mode,
    outcome,
    relationships: state.social.relationships,
    random,
  })
  const finalScore = didBackfire ? -Math.abs(outcomeResult.score) : outcomeResult.score
  const finalLabel = didBackfire ? scoreToLabel(finalScore) : outcomeResult.label

  // previewOnly: return outcome without mutating state.
  if (options?.previewOnly) {
    const previewSign = relationshipDelta > 0 ? '+' : ''
    const previewSummary =
      relationshipDelta !== 0
        ? `${action.title} preview (${previewSign}${relationshipDelta} affinity)`
        : `${action.title} preview`
    return {
      success: true,
      delta: relationshipDelta,
      newEnergy: currentEnergy,
      summary: previewSummary,
      score: finalScore,
      label: finalLabel,
    }
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
        disclosedTargetByPlayerId: lohDisclosureId
          ? {
              ...(lohPlanState.disclosedTargetByPlayerId ?? {}),
              [actorId]: lohDisclosureId,
            }
          : lohPlanState.disclosedTargetByPlayerId,
      },
    })
  }
  if (actionId === 'ask_hold_safety' && rootState.game?.lohId === actorId) {
    _store.dispatch({
      type: 'game/setLohSafetyAdvice',
      payload: {
        week: rootState.game.week ?? 0,
        lohId: actorId,
        holderId: targetId,
        advice: 'hold',
      },
    })
  }

  // Deduct all resources
  const newEnergy = SocialEnergyBank.add(actorId, -costs.energy)
  const currentInfluence = state.social.influenceBank[actorId] ?? 0
  const influenceSpend = Math.min(costs.influence, currentInfluence)
  const postSpendInfluenceBalance = currentInfluence - influenceSpend
  if (influenceSpend > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -influenceSpend }))
  }
  const currentInfo = state.social.infoBank[actorId] ?? 0
  const infoSpend = Math.min(costs.info, currentInfo)
  const postSpendInfoBalance = currentInfo - infoSpend
  if (infoSpend > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -infoSpend }))
  }

  // Apply outcome-sensitive gains or losses after paying the action costs.
  const resourceEffect = dramaMode
    ? getSocialResourceEffect(
        action,
        didBackfire ? 'backfire' : repetitionMissed ? 'failure' : outcome
      )
    : outcome === 'success'
      ? {
          influence: didBackfire
            ? -scaledYields.influence
            : repetitionMissed
              ? 0
              : scaledYields.influence,
          info: didBackfire ? -scaledYields.info : repetitionMissed ? 0 : scaledYields.info,
        }
      : { influence: 0, info: 0 }
  const appliedYields = { influence: 0, info: 0 }
  if (resourceEffect.influence !== 0) {
    const appliedInfluenceDelta = clampResourceAdjustment(
      resourceEffect.influence,
      postSpendInfluenceBalance
    )
    if (appliedInfluenceDelta !== 0) {
      _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: appliedInfluenceDelta }))
    }
    appliedYields.influence = appliedInfluenceDelta
  }
  if (resourceEffect.info !== 0) {
    const appliedInfoDelta = clampResourceAdjustment(resourceEffect.info, postSpendInfoBalance)
    if (appliedInfoDelta !== 0) {
      _store.dispatch(applyInfoDelta({ playerId: actorId, delta: appliedInfoDelta }))
    }
    appliedYields.info = appliedInfoDelta
  }

  // Read balances after all mutations
  const stateAfter = _store.getState() as {
    social: SocialState
    game?: { week?: number; phase?: string }
  }
  const balancesAfter = {
    energy: stateAfter.social.energyBank[actorId] ?? 0,
    influence: stateAfter.social.influenceBank[actorId] ?? 0,
    info: stateAfter.social.infoBank[actorId] ?? 0,
  }

  const subjectId = options?.subjectId ?? lohTargetPlan?.targetId

  const narrative =
    outcome !== 'success'
      ? undefined
      : actionId === 'snoop_around'
        ? buildSnoopNarrative(state.social, actorId, state.game?.players ?? [])
        : actionId === 'ask_loh_target' && !safetyAdviceOpen
          ? buildLohTargetNarrative(state.social, state.game, actorId, targetId, priorRepeats)
          : undefined

  const entry: SocialActionLogEntry = {
    actionId,
    actorId,
    targetId,
    ...(subjectId ? { subjectId } : {}),
    ...(narrative ? { narrative } : {}),
    ...(lohTargetPlan
      ? {
          context: {
            lohPlanType: lohTargetPlan.isBackdoor
              ? ('backup_plan' as const)
              : ('current_target' as const),
          },
        }
      : {}),
    cost: costs.energy,
    costs,
    delta: relationshipDelta,
    outcome,
    newEnergy,
    balancesAfter,
    timestamp: Date.now(),
    week: stateAfter.game?.week,
    phase: stateAfter.game?.phase,
    score: finalScore,
    label: finalLabel,
    source: options?.source ?? 'system',
  }
  if (appliedYields.influence !== 0 || appliedYields.info !== 0) {
    entry.yieldsApplied = {
      ...(appliedYields.influence !== 0 ? { influence: appliedYields.influence } : {}),
      ...(appliedYields.info !== 0 ? { info: appliedYields.info } : {}),
    }
  }

  const relationshipTags =
    outcome === 'success' &&
    action.outcomeTag &&
    !(actionId === 'proposeAlliance' && betrayalOccurred)
      ? [action.outcomeTag]
      : undefined

  _store.dispatch(
    updateRelationship({
      source: actorId,
      target: targetId,
      delta: relationshipDelta,
      tags: relationshipTags,
      actionSource: options?.source ?? 'system',
    })
  )

  if (actionId === 'proposeAlliance' && outcome === 'success') {
    if (betrayalOccurred) {
      _store.dispatch(
        updateRelationship({
          source: targetId,
          target: actorId,
          delta: ALLIANCE_BETRAYAL_DELTA,
          tags: [BETRAYAL_TAG],
          actionSource: options?.source ?? 'system',
        })
      )
    } else {
      _store.dispatch(
        updateRelationship({
          source: targetId,
          target: actorId,
          delta: reciprocalAllianceDelta,
          tags: [ALLIANCE_TAG],
          // Preserve the initiating source so middleware can reward the exact
          // reciprocal transition once, while AI/system proposals remain free
          // from human resource bonuses.
          actionSource: options?.source ?? 'system',
        })
      )
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
      })
    )
  }

  if (actionId === 'end_romance' && outcome === 'success') {
    _store.dispatch(
      updateRelationship({
        source: targetId,
        target: actorId,
        delta: -5,
        tags: ['ex'],
        actionSource: options?.source ?? 'system',
      })
    )
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
      })
    )
  }

  if (actionId === 'ask_use_safety' && outcome === 'success') {
    const beneficiaryId = subjectId ?? actorId
    _store.dispatch(
      updateRelationship({
        source: targetId,
        target: beneficiaryId,
        delta: 0,
        tags: ['safety_promise'],
        actionSource: 'system',
      })
    )
  }

  _store.dispatch(recordSocialAction({ entry }))

  const verb = getOutcomeVerb({ betrayalOccurred, gaslightOccurred, didBackfire, outcome })
  const sign = relationshipDelta > 0 ? '+' : ''
  const lohName =
    rootState.game?.players?.find((player) => player.id === targetId)?.name ?? 'The LOH'
  const contextualSummary = getContextualActionSummary({
    actionId,
    actorId,
    targetId,
    subjectId: options?.subjectId,
    recipientTrust,
    game: rootState.game,
    relationships: state.social.relationships,
  })
  const standardSummary =
    contextualSummary ??
    (actionId === 'ask_loh_target' && priorLohAsks >= 3
      ? `${lohName} shut the conversation down after being asked repeatedly.`
      : actionId === 'ask_loh_target' && priorLohAsks === 2
        ? `${lohName} said they had already answered and became annoyed by the pressure.`
        : actionId === 'ask_loh_target' && !lohTargetPlan
          ? `${lohName} kept their plan deliberately vague.`
          : lohTargetPlan && outcome === 'success'
            ? safetyAdviceOpen && rootState.game?.posWinnerId === actorId
              ? lohTargetPlan.isBackdoor
                ? `${lohName} advised using Safety on ${
                    rootState.game.nomineeIds
                      ?.filter((nomineeId) => nomineeId !== lohPlanState?.currentTargetId)
                      .map(
                        (nomineeId) =>
                          rootState.game?.players?.find((player) => player.id === nomineeId)
                            ?.name ?? nomineeId
                      )[0] ?? 'the other nominee'
                  } so ${lohTargetPlan.targetName} can become the replacement.`
                : `${lohName} advised leaving the nominations unchanged; ${lohTargetPlan.targetName} is who they want out.`
              : finalBlockLocked
                ? `${lohTargetPlan.targetName} is who the LOH wants out now.`
                : lohTargetPlan.isBackdoor
                  ? `${lohTargetPlan.targetName} is the LOH's backup plan if the nominations change.`
                  : `${lohTargetPlan.targetName} is the LOH's current target.`
            : relationshipDelta !== 0
              ? `${action.title} ${verb} (${sign}${relationshipDelta} relationship)`
              : `${action.title} ${verb}`)

  if (dramaMode) {
    const outcomeKind: SocialOutcomeKind = betrayalOccurred
      ? 'betrayal'
      : gaslightOccurred
        ? 'gaslight'
        : didBackfire
          ? 'backfire'
          : outcome
    return {
      success: true,
      delta: relationshipDelta,
      newEnergy,
      summary:
        narrative ??
        contextualSummary ??
        getSocialOutcomeCopy({
          actionId,
          actionTitle: action.title,
          kind: outcomeKind,
          delta: relationshipDelta,
        }),
      score: finalScore,
      label: finalLabel,
    }
  }
  return {
    success: true,
    delta: relationshipDelta,
    newEnergy,
    summary: narrative ?? standardSummary,
    score: finalScore,
    label: finalLabel,
  }
}

/**
 * Execute one atomic multi-target action. Validation and affordability happen
 * before any mutation, so a group action can never partially spend or apply.
 */
export function executeGroupAction(
  actorId: string,
  rawTargetIds: readonly string[],
  actionId: string,
  options?: ExecuteActionOptions
): ExecuteActionResult {
  const currentEnergy = SocialEnergyBank.get(actorId)
  const unavailable = (summary: string): ExecuteActionResult => ({
    success: false,
    delta: 0,
    newEnergy: currentEnergy,
    summary,
    score: 0,
    label: 'Unavailable',
  })
  if (!_store) return unavailable('Store not initialised')

  const action = getActionById(actionId)
  if (!action) return unavailable('Unknown action')

  const targetIds = [...new Set(rawTargetIds)].filter((id) => id && id !== actorId)
  const state = _store.getState() as {
    social: SocialState
    game?: ManeuverGameState
    settings?: { gameUX?: { dramaMode?: boolean; realityModePreset?: string } }
    vip?: {
      isActive?: boolean
      entitlements?: { dramaMode?: boolean }
    }
  }
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const realityPreset = state.settings?.gameUX?.realityModePreset
  if (realityPreset && !isActionAllowedForRealityPreset(action, realityPreset)) {
    return unavailable('Unavailable for the selected Reality intensity')
  }
  if (resolveActionTargetMode(action, dramaMode) !== 'multi')
    return unavailable('This is not a group action')
  const eligibility = evaluateSocialActionEligibility({
    action,
    actorId,
    targetIds,
    phase: state.game?.phase,
    players: state.game?.players,
    relationships: state.social.relationships,
    dramaNetwork: state.social.dramaNetwork,
    dramaMode,
    requireCompleteSelection: true,
    allowAIOnly: true,
  })
  if (!eligibility.eligible) return unavailable(eligibility.reason)

  const costs = normalizeActionCosts(action, targetIds.length, dramaMode)
  if (!canAfford(actorId, costs)) {
    return {
      ...unavailable(
        'Not enough resources: Group Chat needs ' +
          costs.energy +
          ' energy for ' +
          targetIds.length +
          ' housemates.'
      ),
      label: 'Unmoved',
    }
  }

  const random = options?.random ?? Math.random
  const outcome = options?.outcome ?? 'success'
  const targetDeltas: Record<string, number> = {}
  let anyBackfire = false
  for (const targetId of targetIds) {
    const repeats = countPriorRepeatedActions(
      getPersistentSocialHistory(state.social as SocialStateWithHistory),
      actorId,
      targetId,
      actionId,
      state.game?.week,
      state.game?.phase
    )
    const baseDelta = computeOutcomeDelta(actionId, actorId, targetId, outcome)
    const repeated =
      outcome === 'success' && baseDelta > 0
        ? computeRepeatedPositiveDelta(repeats, random)
        : { delta: baseDelta, didBackfire: false }
    targetDeltas[targetId] = repeated.delta
    anyBackfire ||= repeated.didBackfire
  }

  const deltas = Object.values(targetDeltas)
  const averageDelta = Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length)
  const scoreResult = evaluateOutcome({
    actionId,
    actorId,
    targetIds,
    mode: options?.previewOnly ? 'preview' : 'execute',
    outcome,
    relationships: state.social.relationships,
    random,
  })
  const finalScore = anyBackfire ? -Math.abs(scoreResult.score) : scoreResult.score
  const finalLabel = anyBackfire ? scoreToLabel(finalScore) : scoreResult.label

  if (options?.previewOnly) {
    return {
      success: true,
      delta: averageDelta,
      targetDeltas,
      newEnergy: currentEnergy,
      summary: 'Group Chat preview for ' + targetIds.length + ' housemates',
      score: finalScore,
      label: finalLabel,
    }
  }

  const newEnergy = SocialEnergyBank.add(actorId, -costs.energy)
  const currentInfluence = state.social.influenceBank[actorId] ?? 0
  const currentInfo = state.social.infoBank[actorId] ?? 0
  if (costs.influence > 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: -costs.influence }))
  }
  if (costs.info > 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: -costs.info }))
  }

  const effect = getSocialResourceEffect(
    action,
    anyBackfire ? 'backfire' : outcome,
    targetIds.length
  )
  const appliedEffect = {
    influence: clampResourceAdjustment(effect.influence, currentInfluence - costs.influence),
    info: clampResourceAdjustment(effect.info, currentInfo - costs.info),
  }
  if (appliedEffect.influence !== 0) {
    _store.dispatch(applyInfluenceDelta({ playerId: actorId, delta: appliedEffect.influence }))
  }
  if (appliedEffect.info !== 0) {
    _store.dispatch(applyInfoDelta({ playerId: actorId, delta: appliedEffect.info }))
  }

  for (const targetId of targetIds) {
    _store.dispatch(
      updateRelationship({
        source: actorId,
        target: targetId,
        delta: targetDeltas[targetId],
        actionSource: options?.source ?? 'system',
      })
    )
  }

  const stateAfter = _store.getState() as {
    social: SocialState
    game?: { week?: number; phase?: string }
  }
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
      'You brought ' +
      targetIds.length +
      ' housemates into one conversation; each reacted according to your history with them.',
    timestamp: Date.now(),
    week: stateAfter.game?.week,
    phase: stateAfter.game?.phase,
    score: finalScore,
    label: finalLabel,
    source: options?.source ?? 'system',
  }
  _store.dispatch(recordSocialAction({ entry }))

  return {
    success: true,
    delta: averageDelta,
    targetDeltas,
    newEnergy,
    summary:
      'Group Chat reached ' + targetIds.length + ' housemates for ' + costs.energy + ' energy.',
    score: finalScore,
    label: finalLabel,
  }
}
// ── Named export for convenience ──────────────────────────────────────────

export const SocialManeuvers = {
  getActionById,
  getAvailableActions,
  canAfford,
  computeActionCost,
  computeActionCosts,
  executeAction,
  executeGroupAction,
}

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>)['__socialManeuvers'] = {
    getActionById,
    getAvailableActions,
    canAfford,
    computeActionCost,
    computeActionCosts,
    executeAction,
    executeGroupAction,
  }
}
