/**
 * incomingInteractionAutonomy – AI-driven scheduling of incoming interactions.
 *
 * Algorithm overview
 * ──────────────────
 * On each eligible phase transition, `scheduleIncomingInteractionsForPhase`
 * iterates every non-evicted, non-jury AI houseguest and decides whether they
 * should reach out to the player.  The decision is governed by:
 *
 *   1. **Eligibility** – actor must not be evicted/jury, must not be the player
 *      themselves, must not be on per-AI cooldown, and must not have exceeded
 *      their per-AI active interaction cap.
 *   2. **Global cap** – the total number of unresolved interactions (visible +
 *      scheduled) must be below `incomingInteractionConfig.maxActive`.
 *   3. **Engagement score** – a weighted sum of:
 *        - relationship intensity (|normalized affinity|, weighted 0.25)
 *        - strategic urgency    (phase-based event pressure, weighted 0.5)
 *        - personality factor   (actor-specific modifier, weighted 0.15)
 *        - event pressure       (contextual bonus per phase, weighted 0.1)
 *        plus ±randomVariance jitter.
 *   4. **Score threshold** – actor is only enqueued when score ≥ scoreThreshold.
 *   5. **Interaction type** – chosen deterministically from the actor's
 *      relationship with the player and the current phase context.
 *
 * Config values live in `socialConfig.incomingInteractionConfig`.
 * Stored/display affinity is never modified; `normalizeAffinity` is used
 * locally to convert display-scale values for arithmetic.
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
import type {
  IncomingInteraction,
  IncomingInteractionType,
  IncomingInteractionDeliveryState,
  RelationshipsMap,
  ScheduledIncomingInteraction,
  SocialMemoryMap,
} from './types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AutonomyPlayer {
  id: string;
  status: string;
  isUser?: boolean;
}

export interface AutonomyContext {
  phase: string;
  week: number;
  relationships: RelationshipsMap;
  socialMemory?: SocialMemoryMap;
  players: AutonomyPlayer[];
  /** Seeded random function (returns value in [0,1)). Defaults to Math.random. */
  random?: () => number;
}

/** Minimal Redux-like store interface required by the autonomy scheduler. */
export interface AutonomyStore {
  dispatch: (action: unknown) => unknown;
  getState: () => {
    social?: {
      incomingInteractions?: IncomingInteraction[];
      scheduledIncomingInteractions?: ScheduledIncomingInteraction[];
      incomingInteractionDelivery?: IncomingInteractionDeliveryState;
      relationships?: RelationshipsMap;
      socialMemory?: SocialMemoryMap;
    };
    game?: {
      players?: AutonomyPlayer[];
      week?: number;
    };
  };
}

function getPersonalityFactor(actorId: string): number {
  const tuning = socialConfig.incomingInteractionAutonomyTuning;
  return tuning.personalityFactors[actorId] ?? tuning.defaultPersonalityFactor;
}

// ── Strategic urgency per phase ────────────────────────────────────────────

function getPhaseUrgency(phase: string): number {
  const tuning = socialConfig.incomingInteractionAutonomyTuning;
  return tuning.phaseUrgency[phase] ?? tuning.defaultPhaseUrgency;
}

// ── Event pressure ─────────────────────────────────────────────────────────

function getEventPressure(phase: string): number {
  const tuning = socialConfig.incomingInteractionAutonomyTuning;
  return tuning.phaseEventPressure[phase] ?? 0;
}

// ── Interaction type selection ─────────────────────────────────────────────

/**
 * Choose the most appropriate interaction type for an actor based on their
 * normalized affinity toward the player and the current phase.
 *
 * This function is pure and testable.
 */
export function chooseIncomingInteractionType(
  actorId: string,
  _playerId: string,
  context: AutonomyContext,
): IncomingInteractionType {
  const actorRels = context.relationships[actorId] ?? {};
  // Find the player entry – player is always 'user' in this codebase
  const playerId = context.players.find((p) => p.isUser)?.id ?? _playerId;
  const relEntry = actorRels[playerId];
  const baseAffinity = relEntry ? normalizeAffinity(relEntry.affinity) : 0;
  const memoryEntry = context.socialMemory?.[actorId]?.[playerId];
  const memoryBias = computeSocialMemoryAffinityBias(memoryEntry);
  const affinity = Math.max(-1, Math.min(1, baseAffinity + memoryBias));

  const phase = context.phase;
  const { interactionTypeThresholds } = socialConfig.incomingInteractionAutonomyTuning;

  // High-urgency phases favour strategic interaction types
  if (phase === 'live_vote' || phase === 'nominations') {
    if (affinity >= interactionTypeThresholds.highUrgency.ally) return 'nomination_plea';
    if (affinity <= interactionTypeThresholds.highUrgency.enemy) return 'snide_remark';
    return 'deal_offer';
  }

  if (phase === 'pov_results' || phase === 'pov_ceremony_results') {
    if (affinity >= interactionTypeThresholds.povResults.ally) return 'alliance_proposal';
    if (affinity <= interactionTypeThresholds.povResults.enemy) return 'warning';
    return 'check_in';
  }

  if (phase === 'hoh_results' || phase === 'eviction_results') {
    if (affinity >= interactionTypeThresholds.hohEviction.strongAlly) return 'alliance_proposal';
    if (affinity >= interactionTypeThresholds.hohEviction.mildAlly) return 'compliment';
    if (affinity <= interactionTypeThresholds.hohEviction.strongEnemy) return 'snide_remark';
    return 'gossip';
  }

  // Default / social phases
  if (affinity >= interactionTypeThresholds.social.strongAlly) return 'compliment';
  if (affinity >= interactionTypeThresholds.social.mildAlly) return 'check_in';
  if (affinity <= interactionTypeThresholds.social.strongEnemy) return 'snide_remark';
  if (affinity <= interactionTypeThresholds.social.mildEnemy) return 'gossip';
  return 'check_in';
}

// ── Recency penalty ────────────────────────────────────────────────────────

/**
 * Look up the most recent unresolved interaction from `actorId` and return a
 * recency penalty in [0, 1].  A cooldown of `cooldownTicks` evaluations with
 * no new interactions yields a penalty of 0; an interaction enqueued very
 * recently yields a penalty close to 1.
 *
 * In this simplified model we use the interaction's `createdWeek` vs the
 * current `week` as a proxy for elapsed time.
 */
function computeRecencyPenalty(
  actorId: string,
  pendingInteractions: IncomingInteraction[],
  currentWeek: number,
  cooldownTicks: number,
): number {
  // Use all interactions from this actor (resolved or not) so that responding
  // to a message doesn't immediately reset the cooldown and allow re-spam.
  const lastFromActor = pendingInteractions
    .filter((i) => i.fromId === actorId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  if (!lastFromActor) return 0;

  const weeksSince = currentWeek - lastFromActor.createdWeek;
  if (weeksSince >= cooldownTicks) return 0;
  // Linear decay: penalty = 1 when weeksSince===0, 0 when weeksSince===cooldownTicks
  return 1 - weeksSince / cooldownTicks;
}

// ── Engagement score ───────────────────────────────────────────────────────

/**
 * Compute a weighted engagement score for a given actor → player interaction
 * opportunity.  Score is in approximately [0, 1+randomVariance].
 *
 * Higher score → higher priority for enqueueing.
 *
 * This function is pure and accepts an optional `random` function for
 * deterministic testing.
 */
export function computeIncomingInteractionEngagementScore(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
  pendingInteractions: IncomingInteraction[] = [],
): number {
  const cfg = socialConfig.incomingInteractionConfig;
  const w = cfg.weights;

  // ── Relationship intensity ──────────────────────────────────────────────
  const actorRels = context.relationships[actorId] ?? {};
  const relEntry = actorRels[playerId];
  const displayAffinity = relEntry?.affinity ?? 0;
  const normAffinity = normalizeAffinity(displayAffinity);
  // Intensity is the absolute value of affinity: both strong allies and strong
  // enemies are motivated to interact (ally: warmth, enemy: conflict/strategy).
  const relationshipIntensity = Math.abs(normAffinity);

  // ── Strategic urgency ───────────────────────────────────────────────────
  const strategicUrgency = getPhaseUrgency(context.phase);

  // ── Personality ─────────────────────────────────────────────────────────
  const personality = getPersonalityFactor(actorId);

  // ── Event pressure ──────────────────────────────────────────────────────
  const eventPressure = getEventPressure(context.phase);

  const memoryEntry = context.socialMemory?.[actorId]?.[playerId];
  const memoryIntensity = computeSocialMemoryIntensity(memoryEntry);
  const trustMomentum = computeTrustMomentumNormalized(memoryEntry);

  // ── Weighted sum ────────────────────────────────────────────────────────
  const baseScore =
    w.relationshipIntensity * relationshipIntensity +
    w.strategicUrgency * strategicUrgency +
    w.personality * personality +
    w.eventPressure * eventPressure +
    (w.memoryIntensity ?? 0) * memoryIntensity +
    (w.trustMomentum ?? 0) * trustMomentum;

  // ── Recency penalty ─────────────────────────────────────────────────────
  const recencyPenalty = computeRecencyPenalty(
    actorId,
    pendingInteractions,
    context.week,
    cfg.cooldownTicks,
  );
  const penalised = baseScore * (1 - recencyPenalty);

  // ── Random variance ─────────────────────────────────────────────────────
  const rng = context.random ?? Math.random;
  const jitter = (rng() * 2 - 1) * cfg.randomVariance; // ±randomVariance

  return Math.max(0, penalised + jitter);
}

// ── Eligibility and cap guards ─────────────────────────────────────────────

export interface IncomingInteractionEnqueueDecision {
  allowed: boolean;
  reason: string;
  score?: number;
  globalActive?: number;
  perAiActive?: number;
  recencyPenalty?: number;
}

/**
 * Return a decision object describing eligibility to enqueue an interaction.
 * This is a pure guard; it does not modify state.
 */
export function evaluateIncomingInteractionEnqueueDecision(
  actorId: string,
  playerId: string,
  context: AutonomyContext,
  pendingInteractions: IncomingInteraction[],
): IncomingInteractionEnqueueDecision {
  const cfg = socialConfig.incomingInteractionConfig;

  // ── Global active cap ───────────────────────────────────────────────────
  const globalActive = pendingInteractions.filter((i) => !i.resolved).length;
  if (globalActive >= cfg.maxActive) {
    if (socialConfig.verbose) {
      console.debug(
        `[autonomy] skip ${actorId}: global active cap reached (${globalActive}/${cfg.maxActive})`,
      );
    }
    return { allowed: false, reason: 'blocked_by_global_cap', globalActive };
  }

  // ── Per-AI active cap ───────────────────────────────────────────────────
  const perAiActive = pendingInteractions.filter(
    (i) => i.fromId === actorId && !i.resolved,
  ).length;
  if (perAiActive >= cfg.maxPerAI) {
    if (socialConfig.verbose) {
      console.debug(
        `[autonomy] skip ${actorId}: per-AI cap reached (${perAiActive}/${cfg.maxPerAI})`,
      );
    }
    return { allowed: false, reason: 'blocked_by_actor_cap', perAiActive };
  }

  // ── Per-AI cooldown ─────────────────────────────────────────────────────
  const recencyPenalty = computeRecencyPenalty(
    actorId,
    pendingInteractions,
    context.week,
    cfg.cooldownTicks,
  );
  if (recencyPenalty >= 1) {
    if (socialConfig.verbose) {
      console.debug(`[autonomy] skip ${actorId}: on cooldown (recencyPenalty=${recencyPenalty})`);
    }
    return { allowed: false, reason: 'blocked_by_cooldown', recencyPenalty };
  }

  // ── Engagement score threshold ──────────────────────────────────────────
  const score = computeIncomingInteractionEngagementScore(
    actorId,
    playerId,
    context,
    pendingInteractions,
  );
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
  return { allowed: true, reason: 'eligible', score };
}

/**
 * Return true when the actor is eligible to enqueue an interaction right now.
 * This is a pure guard; it does not modify state.
 */
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

// ── Interaction text generation ────────────────────────────────────────────

const TYPE_TEMPLATES: Record<IncomingInteractionType, string[]> = {
  compliment: [
    "You've been playing really well lately.",
    'I just wanted to say – respect.',
  ],
  gossip: [
    "Have you heard what's going on with the others?",
    "There's something you should know about the house dynamics.",
  ],
  warning: [
    'Watch your back – people are talking.',
    "I thought you should know: you're being targeted.",
  ],
  alliance_proposal: [
    'I think we should work together.',
    'What do you say – final two?',
  ],
  deal_offer: [
    'I can keep you safe this week if you do the same for me.',
    "Let's make a deal.",
  ],
  nomination_plea: [
    "Please don't put me on the block.",
    "I'm asking you to keep me safe this week.",
  ],
  check_in: [
    'Just checking in – how are you holding up?',
    "Hey, wanted to see where your head's at.",
  ],
  snide_remark: [
    "Don't think I haven't noticed what you've been doing.",
    'Interesting move. Bold.',
  ],
  other: ['We need to talk.'],
};

function generateInteractionText(
  type: IncomingInteractionType,
  rng: () => number = Math.random,
): string {
  const templates = TYPE_TEMPLATES[type];
  return templates[Math.floor(rng() * templates.length)];
}

// ── ID generator ───────────────────────────────────────────────────────────

let _idCounter = 0;
function generateInteractionId(): string {
  return `ai-int-${Date.now()}-${++_idCounter}`;
}

// ── Phase eligibility ──────────────────────────────────────────────────────

/**
 * Phases during which the autonomy scheduler will evaluate and potentially
 * enqueue incoming interactions. Guarded behind a set for O(1) lookup.
 */
export { INCOMING_INTERACTION_PHASE_ORDER };

export const ELIGIBLE_PHASES = INCOMING_INTERACTION_ELIGIBLE_PHASES;

/** Returns true for interaction types that expect an explicit player response. */
function interactionTypeRequiresResponse(type: IncomingInteractionType): boolean {
  return type === 'alliance_proposal' || type === 'deal_offer' || type === 'nomination_plea';
}

// ── Main scheduler ─────────────────────────────────────────────────────────

/**
 * Evaluate all AI houseguests and enqueue incoming interactions for the player
 * as appropriate for the given phase.
 *
 * Side-effects: dispatches `scheduleIncomingInteraction` for each chosen actor.
 *
 * @param phase   The current game phase string.
 * @param store   A Redux-compatible store with `dispatch` and `getState`.
 * @param context Optional context override (used in tests to inject RNG etc.).
 */
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
  const socialState = state.social;
  if (!socialState) {
    if (socialConfig.verbose) {
      console.debug('[autonomy] no social state – skipping');
    }
    return;
  }

  // Pull game state from context override or derive from social state
  const gameState = state.game;
  const players: AutonomyPlayer[] = contextOverride?.players ?? gameState?.players ?? [];
  const week: number = contextOverride?.week ?? (gameState?.week ?? 1);
  const relationships: RelationshipsMap =
    contextOverride?.relationships ?? socialState.relationships ?? {};
  const socialMemory: SocialMemoryMap =
    contextOverride?.socialMemory ?? socialState.socialMemory ?? {};

  const playerEntry = players.find((p) => p.isUser);
  if (!playerEntry) {
    if (socialConfig.verbose) {
      console.debug('[autonomy] no player found – skipping');
    }
    return;
  }

  // Skip scheduling if the user has been evicted or is in jury —
  // they are no longer in the house and should not receive new interactions.
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
    random: contextOverride?.random,
  };

  // Make a mutable local copy so we can track newly enqueued interactions within
  // this phase pass without mutating the frozen Redux state array.
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
  const visibleActiveCount = (socialState.incomingInteractions ?? []).filter((i) => !i.resolved)
    .length;

  // Evaluate each AI actor
  const aiActors = players.filter(
    (p) =>
      !p.isUser &&
      p.status !== 'evicted' &&
      p.status !== 'jury' &&
      p.id !== playerId,
  );

  for (const actor of aiActors) {
    const decision = evaluateIncomingInteractionEnqueueDecision(
      actor.id,
      playerId,
      context,
      pendingInteractions,
    );
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

    const type = chooseIncomingInteractionType(actor.id, playerId, context);
    const text = generateInteractionText(type, context.random);
    const interaction: IncomingInteraction = {
      id: generateInteractionId(),
      fromId: actor.id,
      type,
      text,
      createdAt: Date.now(),
      createdWeek: week,
      expiresAtWeek: week + 1,
      read: false,
      requiresResponse: interactionTypeRequiresResponse(type),
      resolved: false,
    };

    const priority = getIncomingInteractionPriority(type);
    logIncomingInteractionDecision(store.dispatch, {
      stage: 'generation',
      reason: 'generated',
      actorId: actor.id,
      interactionId: interaction.id,
      type: interaction.type,
      priority,
      week,
      phase,
      detail: decision.score !== undefined ? `score=${decision.score.toFixed(3)}` : undefined,
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
      detail: slot.deliveryReason,
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

    // Update our local snapshot so subsequent actors in this same pass see the
    // updated pending list (prevents over-filling within a single phase pass).
    pendingInteractions.unshift(interaction);
  }
}
