/**
 * incomingInteractionAutonomy – AI-driven scheduling of incoming interactions.
 *
 * Algorithm overview
 * ──────────────────
 * On each eligible phase transition, `scheduleIncomingInteractionsForPhase`
 * iterates every non-evicted, non-jury AI houseguest and decides whether they
 * should reach out to the player. The decision is governed by eligibility,
 * engagement scoring, contextual scenario routing, and delivery dedupe.
 */

import { normalizeAffinity } from './affinityUtils';
import { socialConfig } from './socialConfig';
import { scheduleIncomingInteraction } from './socialSlice';
import {
  computeSocialMemoryAffinityBias,
  computeSocialMemoryIntensity,
  computeTrustMomentumNormalized,
} from './socialMemory';
import {
  INCOMING_INTERACTION_ELIGIBLE_PHASES,
  INCOMING_INTERACTION_PHASE_ORDER,
} from './incomingInteractionPhases';
import {
  assignDeliverySlot,
  buildDeliverySlotCounts,
  buildPendingIncomingInteractions,
  getInteractionDedupeReason,
  getIncomingInteractionPriority,
} from './incomingInteractionScheduler';
import { logIncomingInteractionDecision } from './incomingInteractionLogging';
import {
  SCENARIO_VARIANT_POOLS,
  getVoiceProfile,
  pickVariantText,
} from './interactionVariantBank';
import { getNamedInteractionText } from './namedInteractionBank';
import { createIncomingInteraction } from './incomingInteractionFactory';
import { createDeterministicSocialRandom } from './socialExecutionGuard';
import { getSocialPersonality } from './socialPersonalityBank';
import { getEffectiveSocialMode } from './socialMode';
import { getRemoteScenarioLines } from './socialRuntimeConfig';
import type {
  IncomingInteraction,
  IncomingInteractionDeliveryState,
  IncomingInteractionType,
  RelationshipsMap,
  ScheduledIncomingInteraction,
  SocialActionLogEntry,
  SocialMemoryEntry,
  SocialMemoryMap,
} from './types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AutonomyPlayer {
  id: string;
  name?: string;
  status: string;
  isUser?: boolean;
}

export interface AutonomyContext {
  phase: string;
  week: number;
  relationships: RelationshipsMap;
  socialMemory?: SocialMemoryMap;
  players: AutonomyPlayer[];
  lohId?: string | null;
  nomineeIds?: string[];
  posWinnerId?: string | null;
  povSavedId?: string | null;
  prevHohId?: string | null;
  votes?: Record<string, string>;
  recentEvicteeId?: string | null;
  pendingEvictionId?: string | null;
  isDoubleEviction?: boolean;
  specialVeto?: string | null;
  lastHohCompFinisherId?: string | null;
  playerSocialActionCount?: number;
  dramaMode?: boolean;
  /** Seeded random function (returns value in [0,1)). Defaults to Math.random. */
  random?: () => number;
}

/** Minimal Redux-like store interface required by the autonomy scheduler. */
export interface AutonomyStore {
  dispatch: (action: unknown) => unknown;
  getState: () => {
    settings?: {
      gameUX?: { dramaMode?: boolean };
    };
    vip?: {
      isActive?: boolean;
      entitlements?: { dramaMode?: boolean };
    };
    social?: {
      incomingInteractions?: IncomingInteraction[];
      scheduledIncomingInteractions?: ScheduledIncomingInteraction[];
      incomingInteractionDelivery?: IncomingInteractionDeliveryState;
      relationships?: RelationshipsMap;
      socialMemory?: SocialMemoryMap;
      sessionLogs?: SocialActionLogEntry[];
      actionHistory?: SocialActionLogEntry[];
    };
    game?: {
      players?: AutonomyPlayer[];
      week?: number;
      seed?: number;
      dramaSocialMode?: boolean;
      lohId?: string | null;
      nomineeIds?: string[];
      posWinnerId?: string | null;
      povSavedId?: string | null;
      prevHohId?: string | null;
      votes?: Record<string, string>;
      pendingEviction?: { evicteeId: string } | null;
      doubleEviction?: { weekActive?: boolean };
      specialVeto?: { activeType?: string | null };
      lastHohCompFinisherId?: string | null;
    };
  };
}

type InteractionScenarioKey =
  | 'week_start_ally_check_in'
  | 'week_start_enemy_gossip'
  | 'week_start_alliance_lock'
  | 'hoh_congratulations'
  | 'safety_win_congratulations'
  | 'safety_holder_consults_loh'
  | 'player_nominated_support'
  | 'player_nominated_tension'
  | 'competition_low_finish_support'
  | 'competition_low_finish_taunt'
  | 'social_momentum_notice'
  | 'hoh_safety_request'
  | 'nominee_hoh_plea'
  | 'nominee_veto_pitch'
  | 'nominee_campaign'
  | 'nomination_aftershock'
  | 'nominee_understands_loh'
  | 'nominee_confronts_loh'
  | 'replacement_nominee_reacts_to_loh'
  | 'post_veto_gratitude'
  | 'post_veto_campaign'
  | 'live_vote_pitch'
  | 'survivor_gratitude'
  | 'betrayal_warning'
  | 'ignored_warning'
  | 'targeted_snark'
  | 'alliance_reassurance'
  | 'generic_gossip'
  | 'generic_check_in';

interface InteractionPlan {
  type: IncomingInteractionType;
  scenarioKey: InteractionScenarioKey;
}

const CRITICAL_EVENT_SCENARIOS = new Set<InteractionScenarioKey>([
  'nominee_hoh_plea',
  'nominee_veto_pitch',
  'safety_holder_consults_loh',
  'nominee_understands_loh',
  'nominee_confronts_loh',
  'replacement_nominee_reacts_to_loh',
  'live_vote_pitch',
]);

function isCriticalEventScenario(plan: InteractionPlan | null | undefined): boolean {
  return Boolean(plan && CRITICAL_EVENT_SCENARIOS.has(plan.scenarioKey));
}

interface RelationshipSignals {
  affinity: number;
  tags: Set<string>;
  memoryEntry?: SocialMemoryEntry;
  gratitudeRatio: number;
  resentmentRatio: number;
  neglectRatio: number;
  trustMomentum: number;
  isStrongAlly: boolean;
  isMildAlly: boolean;
  isStrongEnemy: boolean;
  isMildEnemy: boolean;
}

interface ActorConstraints {
  actor: AutonomyPlayer;
  playerId: string;
  playerEntry?: AutonomyPlayer;
  actorIsNominee: boolean;
  actorIsCurrentHoh: boolean;
  actorHasSafetyPower: boolean;
  playerIsHoh: boolean;
  playerHasSafetyPower: boolean;
  playerIsNominee: boolean;
  playerFinishedLastLohComp: boolean;
  actorWasSaved: boolean;
  actorIsPendingEvictee: boolean;
  actorSurvivedCurrentVote: boolean;
}

interface InteractionTextContext {
  actorName: string;
  playerName: string;
  hohName: string;
  posName: string;
  nomineesLabel: string;
  specialVeto: string;
}

function getPersonalityFactor(actorId: string): number {
  return getSocialPersonality(actorId).socialEnergy;
}

function getPhaseUrgency(phase: string): number {
  const tuning = socialConfig.incomingInteractionAutonomyTuning;
  return tuning.phaseUrgency[phase] ?? tuning.defaultPhaseUrgency;
}

function getEventPressure(phase: string): number {
  const tuning = socialConfig.incomingInteractionAutonomyTuning;
  return tuning.phaseEventPressure[phase] ?? 0;
}

function getPlayerById(context: AutonomyContext, playerId: string): AutonomyPlayer | undefined {
  return context.players.find((player) => player.id === playerId);
}

function getPlayerName(context: AutonomyContext, playerId: string | null | undefined, fallback: string): string {
  if (!playerId) return fallback;
  return getPlayerById(context, playerId)?.name ?? playerId;
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return 'the block';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function buildRelationshipSignals(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
): RelationshipSignals {
  const actorRels = context.relationships[actorId] ?? {};
  const relEntry = actorRels[playerId];
  const baseAffinity = relEntry ? normalizeAffinity(relEntry.affinity) : 0;
  const memoryEntry = context.socialMemory?.[actorId]?.[playerId];
  const memoryBias = computeSocialMemoryAffinityBias(memoryEntry);
  const affinity = Math.max(-1, Math.min(1, baseAffinity + memoryBias));
  const thresholds = socialConfig.incomingInteractionAutonomyTuning.scenarioThresholds;
  const memoryCaps = socialConfig.socialMemoryConfig.caps;

  const gratitudeRatio = memoryCaps.gratitude > 0 ? (memoryEntry?.gratitude ?? 0) / memoryCaps.gratitude : 0;
  const resentmentRatio = memoryCaps.resentment > 0 ? (memoryEntry?.resentment ?? 0) / memoryCaps.resentment : 0;
  const neglectRatio = memoryCaps.neglect > 0 ? (memoryEntry?.neglect ?? 0) / memoryCaps.neglect : 0;
  const trustMomentum = computeTrustMomentumNormalized(memoryEntry);

  return {
    affinity,
    tags: new Set(relEntry?.tags ?? []),
    memoryEntry,
    gratitudeRatio,
    resentmentRatio,
    neglectRatio,
    trustMomentum,
    isStrongAlly: affinity >= thresholds.strongAlly,
    isMildAlly: affinity >= thresholds.mildAlly,
    isStrongEnemy: affinity <= thresholds.strongEnemy,
    isMildEnemy: affinity <= thresholds.mildEnemy,
  };
}

function buildActorConstraints(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
): ActorConstraints | null {
  const actor = getPlayerById(context, actorId);
  if (!actor) return null;
  const playerEntry = getPlayerById(context, playerId);
  const nomineeIds = context.nomineeIds ?? [];
  const safetyIsLive =
    context.phase === 'pos_results' ||
    context.phase === 'pos_ceremony' ||
    context.phase === 'pos_ceremony_results';
  const actorIsNominee = nomineeIds.includes(actor.id) || actor.status.includes('nominated');
  const actorIsCurrentHoh = context.lohId === actor.id || actor.status.includes('loh');
  const actorHasSafetyPower = safetyIsLive &&
    (context.posWinnerId === actor.id || actor.status.includes('pos'));
  const playerIsHoh = context.lohId === playerId || playerEntry?.status.includes('loh') === true;
  const playerHasSafetyPower = safetyIsLive &&
    (context.posWinnerId === playerId || playerEntry?.status.includes('pos') === true);
  const playerIsNominee = nomineeIds.includes(playerId) || playerEntry?.status.includes('nominated') === true;
  const playerFinishedLastLohComp = context.lastHohCompFinisherId === playerId;
  const actorWasSaved = context.povSavedId === actor.id;
  const actorIsPendingEvictee = context.pendingEvictionId === actor.id;
  const actorSurvivedCurrentVote =
    context.phase === 'eviction_results' && actorIsNominee && !actorIsPendingEvictee;

  return {
    actor,
    playerId,
    playerEntry,
    actorIsNominee,
    actorIsCurrentHoh,
    actorHasSafetyPower,
    playerIsHoh,
    playerHasSafetyPower,
    playerIsNominee,
    playerFinishedLastLohComp,
    actorWasSaved,
    actorIsPendingEvictee,
    actorSurvivedCurrentVote,
  };
}

function canSendInteractionType(
  type: IncomingInteractionType,
  constraints: ActorConstraints,
  signals: RelationshipSignals,
): boolean {
  switch (type) {
    case 'nomination_plea':
      return constraints.actorIsNominee && (constraints.playerIsHoh || constraints.playerHasSafetyPower);
    case 'deal_offer':
      return !constraints.actorIsCurrentHoh;
    case 'alliance_proposal':
      return !signals.tags.has('alliance') && signals.affinity > 0;
    case 'snide_remark':
      return !signals.tags.has('alliance') && !constraints.actorSurvivedCurrentVote;
    case 'warning':
      return !signals.tags.has('alliance') && !constraints.actorSurvivedCurrentVote && !(constraints.actorIsCurrentHoh && constraints.playerHasSafetyPower);
    case 'compliment':
      return !signals.tags.has('betrayal') || constraints.actorSurvivedCurrentVote;
    default:
      return true;
  }
}

function fallbackInteractionPlan(
  phase: string,
  constraints: ActorConstraints,
  signals: RelationshipSignals,
): InteractionPlan | null {
  const thresholds = socialConfig.incomingInteractionAutonomyTuning.scenarioThresholds;
  if (constraints.actorIsPendingEvictee) return null;
  if (constraints.actorSurvivedCurrentVote) {
    return { type: 'compliment', scenarioKey: 'survivor_gratitude' };
  }
  if (
    signals.tags.has('betrayal') ||
    (signals.resentmentRatio >= thresholds.resentmentHigh && signals.affinity < 0)
  ) {
    return {
      type: signals.isStrongEnemy ? 'snide_remark' : 'warning',
      scenarioKey: 'betrayal_warning',
    };
  }
  if (signals.neglectRatio >= thresholds.neglectHigh && !signals.tags.has('alliance')) {
    return { type: 'warning', scenarioKey: 'ignored_warning' };
  }
  if (signals.tags.has('target')) {
    return {
      type: signals.isStrongEnemy ? 'snide_remark' : 'gossip',
      scenarioKey: 'targeted_snark',
    };
  }
  if (signals.tags.has('alliance')) {
    return {
      type: signals.isStrongAlly ? 'compliment' : 'check_in',
      scenarioKey: 'alliance_reassurance',
    };
  }
  if ((phase === 'week_start' || phase === 'social_1' || phase === 'social_2') && signals.isMildAlly) {
    return { type: 'check_in', scenarioKey: 'week_start_ally_check_in' };
  }
  if (signals.isStrongEnemy || signals.isMildEnemy) {
    return { type: 'gossip', scenarioKey: 'generic_gossip' };
  }
  return null;
}

function resolveIncomingInteractionPlan(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
): InteractionPlan | null {
  const constraints = buildActorConstraints(actorId, playerId, context);
  if (!constraints || constraints.actorIsPendingEvictee) return null;

  const signals = buildRelationshipSignals(actorId, playerId, context);
  const thresholds = socialConfig.incomingInteractionAutonomyTuning.scenarioThresholds;
  let plan: InteractionPlan | null = null;

  if (
    context.dramaMode &&
    context.phase === 'pos_results' &&
    constraints.actorHasSafetyPower &&
    constraints.playerIsHoh &&
    !constraints.actorIsNominee
  ) {
    plan = { type: 'deal_offer', scenarioKey: 'safety_holder_consults_loh' };
  } else if (
    context.phase === 'pos_results' &&
    constraints.playerHasSafetyPower &&
    !constraints.actorIsNominee &&
    (signals.isMildAlly || signals.tags.has('alliance'))
  ) {
    plan = { type: 'compliment', scenarioKey: 'safety_win_congratulations' };
  } else if (context.phase === 'nomination_results' && constraints.playerIsNominee) {
    if (signals.isMildAlly || signals.tags.has('alliance')) {
      plan = { type: 'check_in', scenarioKey: 'player_nominated_support' };
    } else if (signals.isMildEnemy || signals.tags.has('target') || signals.tags.has('betrayal')) {
      plan = {
        type: signals.isStrongEnemy ? 'snide_remark' : 'warning',
        scenarioKey: 'player_nominated_tension',
      };
    }
  } else if (
    (context.phase === 'loh_results' || context.phase === 'social_1') &&
    constraints.playerFinishedLastLohComp
  ) {
    if (signals.isMildAlly || signals.tags.has('alliance')) {
      plan = { type: 'check_in', scenarioKey: 'competition_low_finish_support' };
    } else if (signals.isMildEnemy) {
      plan = { type: 'snide_remark', scenarioKey: 'competition_low_finish_taunt' };
    }
  } else if (
    context.phase === 'social_2' &&
    (context.playerSocialActionCount ?? 0) >= 3 &&
    (signals.isMildAlly || signals.isMildEnemy)
  ) {
    plan = {
      type: signals.isMildAlly ? 'compliment' : 'warning',
      scenarioKey: 'social_momentum_notice',
    };
  } else if (context.phase === 'eviction_results' && constraints.actorSurvivedCurrentVote) {
    if (!signals.tags.has('alliance') && signals.affinity >= thresholds.allianceProposalMinAffinity) {
      plan = { type: 'alliance_proposal', scenarioKey: 'survivor_gratitude' };
    } else {
      plan = { type: 'compliment', scenarioKey: 'survivor_gratitude' };
    }
  } else if (
    context.phase === 'pos_ceremony_results' &&
    constraints.actorWasSaved &&
    (constraints.playerIsHoh || constraints.playerHasSafetyPower)
  ) {
    if (!signals.tags.has('alliance') && signals.affinity >= thresholds.allianceProposalMinAffinity) {
      plan = { type: 'alliance_proposal', scenarioKey: 'post_veto_gratitude' };
    } else {
      plan = { type: 'compliment', scenarioKey: 'post_veto_gratitude' };
    }
  } else if (
    constraints.actorIsNominee &&
    (context.phase === 'pos_results' || context.phase === 'pos_ceremony_results') &&
    constraints.playerHasSafetyPower
  ) {
    plan = {
      type: signals.isMildEnemy ? 'check_in' : 'deal_offer',
      scenarioKey: 'nominee_veto_pitch',
    };
  } else if (
    constraints.actorIsNominee &&
    context.phase === 'nominations' &&
    constraints.playerIsHoh
  ) {
    plan = { type: 'nomination_plea', scenarioKey: 'nominee_hoh_plea' };
  } else if (
    constraints.actorIsNominee &&
    (context.phase === 'social_2' || context.phase === 'live_vote')
  ) {
    plan = {
      type: context.phase === 'live_vote' ? 'deal_offer' : 'check_in',
      scenarioKey: context.phase === 'live_vote' ? 'live_vote_pitch' : 'nominee_campaign',
    };
  } else if (
    (context.phase === 'social_1' || context.phase === 'nominations' || context.phase === 'loh_results') &&
    constraints.playerIsHoh &&
    !constraints.actorIsNominee &&
    !constraints.actorIsCurrentHoh
  ) {
    if (signals.isStrongAlly || signals.tags.has('alliance')) {
      plan = {
        type: signals.tags.has('alliance') ? 'check_in' : 'compliment',
        scenarioKey: 'hoh_safety_request',
      };
    } else {
      plan = { type: 'deal_offer', scenarioKey: 'hoh_safety_request' };
    }
  } else if (context.phase === 'nomination_results' && constraints.actorIsNominee) {
    if (context.dramaMode && constraints.playerIsHoh) {
      plan = signals.isMildEnemy || signals.tags.has('betrayal')
        ? { type: 'warning', scenarioKey: 'nominee_confronts_loh' }
        : { type: 'check_in', scenarioKey: 'nominee_understands_loh' };
    } else {
      plan = { type: 'check_in', scenarioKey: 'nomination_aftershock' };
    }
  } else if (context.phase === 'pos_ceremony_results' && constraints.actorIsNominee) {
    if (context.dramaMode && constraints.playerIsHoh) {
      plan = {
        type: signals.isMildEnemy ? 'warning' : 'check_in',
        scenarioKey: 'replacement_nominee_reacts_to_loh',
      };
    } else {
      plan = { type: 'check_in', scenarioKey: 'post_veto_campaign' };
    }
  } else if (context.phase === 'loh_results' && constraints.playerIsHoh) {
    if (signals.isStrongAlly || signals.tags.has('alliance')) {
      plan = { type: 'compliment', scenarioKey: 'hoh_congratulations' };
    } else if (signals.tags.has('betrayal') || signals.isStrongEnemy || signals.tags.has('target')) {
      plan = {
        type: signals.isStrongEnemy ? 'warning' : 'gossip',
        scenarioKey: 'betrayal_warning',
      };
    }
  } else if (
    (context.phase === 'week_start' || context.phase === 'social_1') &&
    !signals.tags.has('alliance') &&
    signals.isStrongAlly
  ) {
    plan = { type: 'alliance_proposal', scenarioKey: 'week_start_alliance_lock' };
  }

  if (!plan) {
    plan = fallbackInteractionPlan(context.phase, constraints, signals);
  }
  if (!plan) return null;
  if (canSendInteractionType(plan.type, constraints, signals)) {
    return plan;
  }

  const fallback = fallbackInteractionPlan(context.phase, constraints, signals);
  if (fallback && canSendInteractionType(fallback.type, constraints, signals)) {
    return fallback;
  }

  if (signals.tags.has('alliance')) {
    return { type: 'check_in', scenarioKey: 'alliance_reassurance' };
  }
  if (signals.isStrongEnemy) {
    return { type: 'gossip', scenarioKey: 'generic_gossip' };
  }
  return null;
}

/**
 * Choose the most appropriate interaction type for an actor based on their
 * relationship, game power state, and current phase.
 */
export function chooseIncomingInteractionType(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
): IncomingInteractionType {
  return resolveIncomingInteractionPlan(actorId, playerId, context)?.type ?? 'check_in';
}

function computeRecencyPenalty(
  actorId: string,
  pendingInteractions: IncomingInteraction[],
  currentWeek: number,
  cooldownTicks: number,
): number {
  const lastFromActor = pendingInteractions
    .filter((interaction) => interaction.fromId === actorId)
    .sort((left, right) => right.createdAt - left.createdAt)[0];

  if (!lastFromActor) return 0;

  const weeksSince = currentWeek - lastFromActor.createdWeek;
  if (weeksSince >= cooldownTicks) return 0;
  return 1 - weeksSince / cooldownTicks;
}

export function computeIncomingInteractionEngagementScore(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
  pendingInteractions: IncomingInteraction[] = [],
): number {
  const cfg = socialConfig.incomingInteractionConfig;
  const w = cfg.weights;
  const signals = buildRelationshipSignals(actorId, playerId, context);

  const relationshipIntensity = Math.abs(signals.affinity);
  const strategicUrgency = getPhaseUrgency(context.phase);
  const personality = getPersonalityFactor(actorId);
  const eventPressure = getEventPressure(context.phase);
  const memoryIntensity = computeSocialMemoryIntensity(signals.memoryEntry);
  const trustMomentum = signals.trustMomentum;

  const baseScore =
    w.relationshipIntensity * relationshipIntensity +
    w.strategicUrgency * strategicUrgency +
    w.personality * personality +
    w.eventPressure * eventPressure +
    (w.memoryIntensity ?? 0) * memoryIntensity +
    (w.trustMomentum ?? 0) * trustMomentum;

  const recencyPenalty = computeRecencyPenalty(
    actorId,
    pendingInteractions,
    context.week,
    cfg.cooldownTicks,
  );
  const penalised = baseScore * (1 - recencyPenalty);

  const rng = context.random ?? Math.random;
  const jitter = (rng() * 2 - 1) * cfg.randomVariance;

  return Math.max(0, penalised + jitter);
}

export interface IncomingInteractionEnqueueDecision {
  allowed: boolean;
  reason: string;
  plan?: InteractionPlan;
  score?: number;
  globalActive?: number;
  perAiActive?: number;
  recencyPenalty?: number;
}

export function evaluateIncomingInteractionEnqueueDecision(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
  pendingInteractions: IncomingInteraction[],
): IncomingInteractionEnqueueDecision {
  const cfg = socialConfig.incomingInteractionConfig;
  const constraints = buildActorConstraints(actorId, playerId, context);

  if (!constraints) {
    return { allowed: false, reason: 'blocked_missing_actor' };
  }
  if (constraints.actorIsPendingEvictee) {
    return { allowed: false, reason: 'blocked_pending_eviction' };
  }

  const globalActive = pendingInteractions.filter((interaction) => !interaction.resolved).length;
  const maxActive = context.dramaMode ? cfg.maxActive : 4;
  if (globalActive >= maxActive) {
    if (socialConfig.verbose) {
      console.debug(
        `[autonomy] skip ${actorId}: global active cap reached (${globalActive}/${maxActive})`,
      );
    }
    return { allowed: false, reason: 'blocked_by_global_cap', globalActive };
  }

  const perAiActive = pendingInteractions.filter(
    (interaction) => interaction.fromId === actorId && !interaction.resolved,
  ).length;
  if (perAiActive >= cfg.maxPerAI) {
    if (socialConfig.verbose) {
      console.debug(
        `[autonomy] skip ${actorId}: per-AI cap reached (${perAiActive}/${cfg.maxPerAI})`,
      );
    }
    return { allowed: false, reason: 'blocked_by_actor_cap', perAiActive };
  }

  const plan = resolveIncomingInteractionPlan(actorId, playerId, context);
  if (!plan) {
    return { allowed: false, reason: 'blocked_by_context_rules' };
  }

  const recencyPenalty = computeRecencyPenalty(
    actorId,
    pendingInteractions,
    context.week,
    cfg.cooldownTicks,
  );
  if (recencyPenalty >= 1 && !(context.dramaMode && isCriticalEventScenario(plan))) {
    if (socialConfig.verbose) {
      console.debug(`[autonomy] skip ${actorId}: on cooldown (recencyPenalty=${recencyPenalty})`);
    }
    return { allowed: false, reason: 'blocked_by_cooldown', recencyPenalty };
  }


  const eventDrivenScenarios = new Set<InteractionScenarioKey>([
    'nomination_aftershock',
    'nominee_veto_pitch',
    'nominee_hoh_plea',
    'safety_holder_consults_loh',
    'nominee_understands_loh',
    'nominee_confronts_loh',
    'replacement_nominee_reacts_to_loh',
    'nominee_campaign',
    'live_vote_pitch',
    'post_veto_campaign',
    'post_veto_gratitude',
    'survivor_gratitude',
    'player_nominated_support',
    'player_nominated_tension',
    'safety_win_congratulations',
    'competition_low_finish_support',
    'competition_low_finish_taunt',
  ]);
  const baseScore = computeIncomingInteractionEngagementScore(
    actorId,
    playerId,
    context,
    pendingInteractions,
  );
  const score = baseScore + (context.dramaMode && isCriticalEventScenario(plan) ? 0.9 : eventDrivenScenarios.has(plan.scenarioKey) ? 0.2 : 0);
  if (score < cfg.scoreThreshold) {
    if (socialConfig.verbose) {
      console.debug(
        `[autonomy] skip ${actorId}: score ${score.toFixed(3)} below threshold ${cfg.scoreThreshold}`,
      );
    }
    return { allowed: false, reason: 'blocked_by_score_threshold', score };
  }

  if (socialConfig.verbose) {
    console.debug(`[autonomy] enqueue ${actorId}: score=${score.toFixed(3)}`);
  }
  return { allowed: true, reason: 'eligible', plan, score };
}

export function shouldEnqueueInteraction(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
  pendingInteractions: IncomingInteraction[],
): boolean {
  return evaluateIncomingInteractionEnqueueDecision(
    actorId,
    playerId,
    context,
    pendingInteractions,
  ).allowed;
}

const SCENARIO_TEMPLATES: Record<InteractionScenarioKey, string[]> = {
  week_start_ally_check_in: [
    'Just checking in, {player} — I want us on the same page this week.',
    'Fresh week, clean slate. I wanted to touch base with you early, {player}.',
    'Before the house gets loud, I wanted to make sure you and I are good.',
  ],
  week_start_enemy_gossip: [
    'New week, same whispers. People are already circling names.',
    'You can feel the house shifting already. Nobody is sitting still.',
    'It did not take long for people to start talking again this week.',
  ],
  week_start_alliance_lock: [
    'I trust you more than most people in here. Maybe we should make that official.',
    'This house is about to fracture. I think you and I should lock something in.',
    'If we are serious about going deep, this is the week to commit.',
  ],
  hoh_congratulations: [
    'Congrats on the power, {player}. That was a strong win.',
    'You earned that room this week, {player}. Respect.',
    'Big win. I figured you should hear that from me directly.',
  ],
  safety_win_congratulations: [
    'That Safety win was huge, {player}. You earned some breathing room.',
    'You came through when it mattered. Congratulations on winning Safety.',
    'Strong performance. Holding Safety changes the whole week for you.',
  ],
  safety_holder_consults_loh: [
    'I won Safety, and before the ceremony I want your read: should I use it or keep the nominations the same?',
    'You control the backup plan, {hoh}. Do you want me to change the block, or leave it alone?',
    'Before I decide what to do with Safety, I wanted to consult you. What helps your plan?',
  ],
  player_nominated_support: [
    'Seeing your name go up was rough. I want you to know you are not alone.',
    'I know tonight stung. If you want to talk through a path forward, I am here.',
    'Do not panic yet, {player}. There is still time, and I have not abandoned you.',
  ],
  player_nominated_tension: [
    'Now that you are in danger, people are comparing notes about how you have played.',
    'Your nomination did not come from nowhere. You may want to rethink who trusts you.',
    'The pressure is on you now, {player}. Some old choices are catching up.',
  ],
  competition_low_finish_support: [
    'That competition was not your moment, but one result does not define your week.',
    'Finishing last hurts. Keep your head up and be careful about your next move.',
    'Rough competition, {player}. I wanted to check that you are holding up.',
  ],
  competition_low_finish_taunt: [
    'Last place puts a bright light on you. The house noticed.',
    'That competition result left you exposed, {player}. People will use it.',
    'You needed that win more than you showed. Now your options are narrower.',
  ],
  social_momentum_notice: [
    'You have been everywhere today, {player}. Your social game is getting attention.',
    'People have noticed how many conversations you are having. So have I.',
    'You are shaping the mood of the house today. That can become power—or a target.',
  ],
  hoh_safety_request: [
    'I know you have a lot to weigh, {hoh}. I just want you to know I am not coming after you.',
    'With you holding power, I wanted to check in early and keep things clear between us.',
    'If names are flying around, I hope mine is not one of them. I can be good for your game.',
  ],
  nominee_hoh_plea: [
    'I know you have the power this week, {hoh}. Please give me a chance to stay off the block.',
    'Before you lock anything in, I am asking you to hear me out. I am not the shot you need.',
    'You decide what happens next, {hoh}. I need you to know I would not come after you.',
  ],
  nominee_veto_pitch: [
    'If you use {specialVeto}, I will remember it. I need that chance right now.',
    'You hold the power to change my week. I would owe you if you saved me.',
    'I am asking straight up: if you can help me here, I will not forget it.',
  ],
  nominee_campaign: [
    'I know I am vulnerable, but I am still fighting. I hope you will keep me in mind.',
    'I need calm numbers around me this week. I wanted to see where your head is at.',
    'Being up there changes everything. I am trying to make sure I still have people.',
  ],
  nomination_aftershock: [
    'I am still trying to process seeing my name up there. I needed to talk to someone.',
    'That ceremony hit hard. I am scrambling a little, if I am honest.',
    'Now that the block is real, I need to know who I can still trust.',
  ],
  nominee_understands_loh: [
    'I will not pretend seeing my name felt good, but I understand you had to make a move. I wanted to hear it from you.',
    'You put me in danger, {hoh}. I am trying to separate the game decision from our relationship.',
    'I get that the LOH has to show their cards. I need to know whether this was strategy or something personal.',
  ],
  nominee_confronts_loh: [
    'You looked me in the eye and then put my name up. Tell me why I should not take that personally.',
    'If you wanted a fight, nominating me was a clean way to start one. Was that the plan?',
    'You made your move, {hoh}. Do not expect me to smile and call it understandable.',
  ],
  post_veto_gratitude: [
    'You changed my whole week. I needed you to know I see that.',
    'Getting saved matters. I am not taking that lightly.',
    'I am breathing again because of that move. Thank you for giving me another shot.',
  ],
  post_veto_campaign: [
    'The Safety decision changed everything, and now I have to rebuild fast.',
    'Once the ceremony shifted, I knew I needed to start talking immediately.',
    'The block looks different now, but the danger feels even sharper.',
  ],
  replacement_nominee_reacts_to_loh: [
    'That replacement decision put me in danger at the last possible moment. I need to understand why it was me.',
    'I was not on the block when this week started, and now my game is on the line because of your backup plan.',
    'You chose my name when the Safety changed things. I can respect the move, but I will remember it.',
  ],
  live_vote_pitch: [
    'The vote is here, and I need every conversation I can get. Can we keep this open?',
    'I am running out of time, so I will be direct: I need your support tonight.',
    'This is the last stretch before the vote. I hope there is a path for me with you.',
  ],
  survivor_gratitude: [
    'I am still here, and I am not forgetting the people who did not leave me hanging.',
    'Surviving that vote changed how I see the house. I know who showed up for me.',
    'After a night like that, gratitude hits harder than anything else.',
  ],
  betrayal_warning: [
    'After everything that happened, I am keeping my eyes open around you.',
    'I have not forgotten how you moved. Just know that.',
    'I am not in the mood to pretend that last move did not matter.',
  ],
  ignored_warning: [
    'You have been hard to get a read on lately. That does not go unnoticed.',
    'I keep reaching out and getting nothing back. That tells me something.',
    'Silence is still a message in this house, {player}.',
  ],
  targeted_snark: [
    'Interesting how your name keeps coming up whenever people talk strategy.',
    'You have been moving like nobody is paying attention. That is risky.',
    'Some of your choices are getting harder for the house to ignore.',
  ],
  alliance_reassurance: [
    'I am not wavering on us. I just wanted to make that clear.',
    'No matter how loud the house gets, I still see us as solid.',
    'I needed a quick check-in with you because our connection still matters to me.',
  ],
  generic_gossip: [
    'There is a lot moving underneath the surface right now.',
    'House dynamics are getting messy, and I thought you should know that.',
    'The vibe is shifting again. Nobody feels settled.',
  ],
  generic_check_in: [
    'Hey — wanted to check where your head is at.',
    'Just checking in. This week feels different already.',
    'I figured it was worth touching base for a second.',
  ],
};

function buildInteractionTextContext(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
): InteractionTextContext {
  const actorName = getPlayerName(context, actorId, actorId);
  const playerName = getPlayerName(context, playerId, 'you');
  const hohName = getPlayerName(context, context.lohId, 'the LOH');
  const posName = getPlayerName(context, context.posWinnerId, 'the Safety holder');
  const nomineeNames = (context.nomineeIds ?? []).map((nomineeId) => getPlayerName(context, nomineeId, nomineeId));
  const specialVeto = context.specialVeto ? context.specialVeto.replace(/_/g, ' ') : 'the Power of Safety';

  return {
    actorName,
    playerName,
    hohName,
    posName,
    nomineesLabel: formatNameList(nomineeNames),
    specialVeto,
  };
}

/** Pick a concrete third party for gossip/warnings instead of vague “people” talk. */
function selectInteractionSubject(
  actorId: string,
  playerId: string,
  type: IncomingInteractionType,
  context: AutonomyContext,
): AutonomyPlayer | undefined {
  if (type !== 'gossip' && type !== 'warning') return undefined;
  const candidates = context.players.filter(
    (candidate) =>
      candidate.id !== actorId &&
      candidate.id !== playerId &&
      candidate.status !== 'evicted' &&
      candidate.status !== 'jury',
  );
  return candidates.sort((left, right) => {
    const leftAffinity = normalizeAffinity(context.relationships[actorId]?.[left.id]?.affinity ?? 0);
    const rightAffinity = normalizeAffinity(context.relationships[actorId]?.[right.id]?.affinity ?? 0);
    return leftAffinity - rightAffinity || left.id.localeCompare(right.id);
  })[0];
}

function renderInteractionTemplate(template: string, textContext: InteractionTextContext): string {
  return template
    .replace(/\{actor\}/g, textContext.actorName)
    .replace(/\{player\}/g, textContext.playerName)
    .replace(/\{hoh\}/g, textContext.hohName)
    .replace(/\{pos\}/g, textContext.posName)
    .replace(/\{nominees\}/g, textContext.nomineesLabel)
    .replace(/\{specialVeto\}/g, textContext.specialVeto);
}

function generateInteractionText(
  actorId: string,
  playerId: string,
  plan: InteractionPlan,
  context: AutonomyContext,
  pendingInteractions: IncomingInteraction[] = [],
  rng: () => number = Math.random,
  dramaMode = false,
): { text: string; variantFamilyId: string; variantId: string } {
  // Build context for token replacement.
  const textContext = buildInteractionTextContext(actorId, playerId, context);

  // Determine how many times this actor has already contacted the player
  // (unresolved interactions) so follow-up families can be preferred.
  const priorFromActor = pendingInteractions.filter(
    (interaction) => interaction.fromId === actorId && !interaction.resolved,
  ).length;

  // Collect variant family IDs recently used by this actor → player pair so
  // the selection logic can avoid them. Only consider interactions within the
  // configured family-cooldown window to prevent unbounded growth.
  const familyRecencyWindowWeeks = Math.max(
    0,
    socialConfig.incomingInteractionDeliveryConfig.dedupe.familyCooldownWeeks ?? 0,
  );
  const recentFamilyCutoffWeek = context.week - familyRecencyWindowWeeks;
  const recentFamilyIds = new Set<string>(
    pendingInteractions
      .filter(
        (interaction) =>
          interaction.fromId === actorId &&
          typeof interaction.createdWeek === 'number' &&
          interaction.createdWeek >= recentFamilyCutoffWeek,
      )
      .map((interaction) => interaction.payload?.variantFamilyId as string | undefined)
      .filter((id): id is string => typeof id === 'string'),
  );
  const lineRecencyWindowWeeks = Math.max(
    familyRecencyWindowWeeks,
    socialConfig.incomingInteractionDeliveryConfig.dedupe.lineCooldownWeeks ?? 0,
  );
  const recentLineCutoffWeek = context.week - lineRecencyWindowWeeks;
  const recentVariantIds = new Set<string>(
    pendingInteractions
      .filter(
        (interaction) =>
          interaction.fromId === actorId && interaction.createdWeek >= recentLineCutoffWeek,
      )
      .map((interaction) => interaction.payload?.variantId as string | undefined)
      .filter((id): id is string => typeof id === 'string'),
  );


  const remoteTemplates = getRemoteScenarioLines(plan.scenarioKey);
  if (remoteTemplates?.length) {
    const template =
      remoteTemplates[Math.floor(rng() * remoteTemplates.length)] ?? remoteTemplates[0];
    return {
      text: renderInteractionTemplate(template, textContext),
      variantFamilyId: `remote_${plan.scenarioKey}`,
      variantId: `remote_${plan.scenarioKey}:${remoteTemplates.indexOf(template)}`,
    };
  }

  // Use the rich variant bank when families are available for this scenario.
  const variantFamilies = SCENARIO_VARIANT_POOLS[plan.scenarioKey];
  if (dramaMode && variantFamilies && variantFamilies.length > 0) {
    const voiceProfile = getVoiceProfile(actorId);
    const { text, familyId, variantId } = pickVariantText(
      variantFamilies,
      voiceProfile,
      recentFamilyIds,
      priorFromActor,
      rng,
      recentVariantIds,
    );
    return {
      text: renderInteractionTemplate(text, textContext),
      variantFamilyId: familyId,
      variantId,
    };
  }

  // Fallback: use the legacy flat template array.
  const templates = SCENARIO_TEMPLATES[plan.scenarioKey] ?? SCENARIO_TEMPLATES.generic_check_in;
  const template = templates[Math.floor(rng() * templates.length)] ?? 'We need to talk.';
  return {
    text: renderInteractionTemplate(template, textContext),
    variantFamilyId: `legacy_${plan.scenarioKey}`,
    variantId: `legacy_${plan.scenarioKey}:${templates.indexOf(template)}`,
  };
}

let _idCounter = 0;
function generateInteractionId(): string {
  return `ai-int-${Date.now()}-${++_idCounter}`;
}

export { INCOMING_INTERACTION_PHASE_ORDER };

export const ELIGIBLE_PHASES = INCOMING_INTERACTION_ELIGIBLE_PHASES;


export function scheduleIncomingInteractionsForPhase(
  phase: string,
  store: AutonomyStore,
  contextOverride?: Partial<AutonomyContext>,
): void {
  if (!ELIGIBLE_PHASES.has(phase)) {
    if (socialConfig.verbose) {
      console.debug(`[autonomy] phase '${phase}' is not an eligible scheduling phase – skipping`);
    }
    return;
  }

  const state = store.getState();
  const dramaMode = getEffectiveSocialMode(state) === 'drama';
  const socialState = state.social;
  if (!socialState) {
    if (socialConfig.verbose) {
      console.debug('[autonomy] no social state – skipping');
    }
    return;
  }

  const gameState = state.game;
  const players: AutonomyPlayer[] = contextOverride?.players ?? gameState?.players ?? [];
  const week: number = contextOverride?.week ?? (gameState?.week ?? 1);
  const relationships: RelationshipsMap =
    contextOverride?.relationships ?? socialState.relationships ?? {};
  const socialMemory: SocialMemoryMap =
    contextOverride?.socialMemory ?? socialState.socialMemory ?? {};

  const playerEntry = players.find((player) => player.isUser);
  if (!playerEntry) {
    if (socialConfig.verbose) {
      console.debug('[autonomy] no player found – skipping');
    }
    return;
  }

  if (playerEntry.status === 'evicted' || playerEntry.status === 'jury') {
    if (socialConfig.verbose) {
      console.debug(
        `[autonomy] player '${playerEntry.id}' is ${playerEntry.status} – skipping incoming interactions`,
      );
    }
    return;
  }

  const playerId = playerEntry.id;
  const context: AutonomyContext = {
    phase,
    week,
    relationships,
    socialMemory,
    players,
    dramaMode: contextOverride?.dramaMode ?? dramaMode,
    lohId: contextOverride?.lohId ?? gameState?.lohId ?? null,
    nomineeIds: contextOverride?.nomineeIds ?? gameState?.nomineeIds ?? [],
    posWinnerId: contextOverride?.posWinnerId ?? gameState?.posWinnerId ?? null,
    povSavedId: contextOverride?.povSavedId ?? gameState?.povSavedId ?? null,
    prevHohId: contextOverride?.prevHohId ?? gameState?.prevHohId ?? null,
    votes: contextOverride?.votes ?? gameState?.votes ?? {},
    recentEvicteeId:
      contextOverride?.recentEvicteeId ?? gameState?.pendingEviction?.evicteeId ?? null,
    pendingEvictionId:
      contextOverride?.pendingEvictionId ?? gameState?.pendingEviction?.evicteeId ?? null,
    isDoubleEviction:
      contextOverride?.isDoubleEviction ?? (gameState?.doubleEviction?.weekActive === true),
    specialVeto: contextOverride?.specialVeto ?? gameState?.specialVeto?.activeType ?? null,
    lastHohCompFinisherId:
      contextOverride?.lastHohCompFinisherId ?? gameState?.lastHohCompFinisherId ?? null,
    playerSocialActionCount:
      contextOverride?.playerSocialActionCount ??
      (socialState.actionHistory ?? socialState.sessionLogs ?? []).filter(
        (entry) =>
          entry.actorId === playerId &&
          entry.source === 'manual' &&
          entry.outcome === 'success' &&
          entry.week === week,
      ).length,
    random:
      contextOverride?.random ??
      createDeterministicSocialRandom([gameState?.seed ?? 0, week, phase, playerId]),
  };

  const scheduledQueue = socialState.scheduledIncomingInteractions ?? [];
  const pendingInteractions: IncomingInteraction[] = buildPendingIncomingInteractions(
    socialState.incomingInteractions ?? [],
    scheduledQueue,
  );
  const deliveredThisPhase = socialState.incomingInteractionDelivery
    ? socialState.incomingInteractionDelivery.lastDeliveryPhase === phase &&
      socialState.incomingInteractionDelivery.lastDeliveryWeek === week
      ? socialState.incomingInteractionDelivery.deliveredThisPhase
      : 0
    : 0;
  const slotCounts = buildDeliverySlotCounts(scheduledQueue, phase, week, deliveredThisPhase);
  const visibleActiveCount = (socialState.incomingInteractions ?? []).filter((interaction) => !interaction.resolved)
    .length;

  const aiActors = players.filter(
    (player) =>
      !player.isUser &&
      player.status !== 'evicted' &&
      player.status !== 'jury' &&
      player.id !== playerId,
  );

  const rankedDecisions = aiActors
    .map((actor) => ({
      actor,
      decision: evaluateIncomingInteractionEnqueueDecision(
        actor.id,
        playerId,
        context,
        pendingInteractions,
      ),
    }))
    .sort((left, right) => (right.decision.score ?? -1) - (left.decision.score ?? -1));
  const alreadyCreatedThisWeek = pendingInteractions.filter(
    (interaction) => interaction.createdWeek === week,
  ).length;
  const criticalDecisionCount = rankedDecisions.filter(
    (entry) =>
      context.dramaMode &&
      entry.decision.allowed &&
      isCriticalEventScenario(entry.decision.plan),
  ).length;
  const checkpointBudget = criticalDecisionCount > 0
    ? Math.max(
        socialConfig.incomingInteractionConfig.maxGeneratedPerCheckpoint,
        Math.min(3, criticalDecisionCount),
      )
    : socialConfig.incomingInteractionConfig.maxGeneratedPerCheckpoint;
  const generationBudget = Math.max(
    0,
    Math.min(
      checkpointBudget,
      (context.dramaMode ? socialConfig.incomingInteractionConfig.maxPerWeek : 3) - alreadyCreatedThisWeek,
    ),
  );
  let generatedThisCheckpoint = 0;

  for (const { actor, decision } of rankedDecisions) {
    if (!decision.allowed) {
      logIncomingInteractionDecision(store.dispatch, {
        stage: 'generation',
        reason: decision.reason,
        actorId: actor.id,
        week,
        phase,
        detail: decision.score !== undefined ? `score=${decision.score.toFixed(3)}` : undefined,
      });
      continue;
    }

    if (generatedThisCheckpoint >= generationBudget) {
      logIncomingInteractionDecision(store.dispatch, {
        stage: 'generation',
        reason: generationBudget === 0 ? 'blocked_by_weekly_budget' : 'blocked_by_checkpoint_budget',
        actorId: actor.id,
        week,
        phase,
        detail: decision.score !== undefined ? `score=${decision.score.toFixed(3)}` : undefined,
      });
      continue;
    }

    const plan = decision.plan;
    if (!plan) {
      logIncomingInteractionDecision(store.dispatch, {
        stage: 'generation',
        reason: 'blocked_by_missing_plan',
        actorId: actor.id,
        week,
        phase,
      });
      continue;
    }

    const textResult = generateInteractionText(
      actor.id,
      playerId,
      plan,
      context,
      pendingInteractions,
      context.random,
      dramaMode,
    );
    const subject = dramaMode
      ? selectInteractionSubject(actor.id, playerId, plan.type, context)
      : undefined;
    const subjectName = subject?.name ?? subject?.id;
    const interactionText =
      subjectName && (plan.type === 'gossip' || plan.type === 'warning')
        ? getNamedInteractionText(
            plan.scenarioKey,
            plan.type,
            subjectName,
            `${actor.id}:${playerId}:${week}:${phase}:${textResult.variantId}`,
          )
        : textResult.text;
    const interaction = createIncomingInteraction({
      id: generateInteractionId(),
      fromId: actor.id,
      type: plan.type,
      text: interactionText,
      week,
      phase,
      mode: dramaMode ? 'drama' : 'normal',
      payload: {
        scenarioKey: plan.scenarioKey,
        variantFamilyId: textResult.variantFamilyId,
        variantId: textResult.variantId,
        actorStatus: actor.status,
        subjectId: subject?.id,
      },
    });

    const priority = getIncomingInteractionPriority(plan.type);
    logIncomingInteractionDecision(store.dispatch, {
      stage: 'generation',
      reason: 'generated',
      actorId: actor.id,
      interactionId: interaction.id,
      type: interaction.type,
      priority,
      week,
      phase,
      detail:
        decision.score !== undefined
          ? `score=${decision.score.toFixed(3)};scenario=${plan.scenarioKey}`
          : `scenario=${plan.scenarioKey}`,
    });
    const dedupeReason = getInteractionDedupeReason({
      interaction,
      priority,
      pendingInteractions,
      week,
    });
    if (dedupeReason) {
      logIncomingInteractionDecision(store.dispatch, {
        stage: 'deduped',
        reason: dedupeReason,
        interactionId: interaction.id,
        actorId: interaction.fromId,
        type: interaction.type,
        priority,
        week,
        phase,
      });
      continue;
    }

    const slot = assignDeliverySlot({
      phase,
      week,
      priority,
      slotCounts,
      visibleActiveCount,
    });
    if (!slot) {
      const dropReason =
        visibleActiveCount >= socialConfig.incomingInteractionDeliveryConfig.maxActiveVisible
          ? 'blocked_by_visible_cap'
          : 'blocked_by_delivery_cap';
      logIncomingInteractionDecision(store.dispatch, {
        stage: 'dropped',
        reason: dropReason,
        interactionId: interaction.id,
        actorId: interaction.fromId,
        type: interaction.type,
        priority,
        week,
        phase,
      });
      continue;
    }

    logIncomingInteractionDecision(store.dispatch, {
      stage: 'scheduling',
      reason:
        slot.scheduledForWeek === week && slot.scheduledForPhase === phase
          ? 'scheduled_for_current_phase'
          : 'scheduled_for_future_phase',
      interactionId: interaction.id,
      actorId: interaction.fromId,
      type: interaction.type,
      priority,
      week,
      phase,
      scheduledForWeek: slot.scheduledForWeek,
      scheduledForPhase: slot.scheduledForPhase,
      detail: `${slot.deliveryReason ?? 'unknown'};scenario=${plan.scenarioKey}`,
    });

    store.dispatch(
      scheduleIncomingInteraction({
        interaction,
        priority,
        scheduledAt: Date.now(),
        scheduledForWeek: slot.scheduledForWeek,
        scheduledForPhase: slot.scheduledForPhase,
        deliveryReason: slot.deliveryReason,
      }),
    );

    pendingInteractions.unshift(interaction);
    generatedThisCheckpoint += 1;
  }
}
