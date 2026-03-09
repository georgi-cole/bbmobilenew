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
 *   2. **Global cap** – the total number of unresolved interactions in the inbox
 *      must be below `incomingInteractionConfig.maxActive`.
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
import { pushIncomingInteraction } from './socialSlice';
import type { IncomingInteraction, IncomingInteractionType, RelationshipsMap } from './types';

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
      relationships?: RelationshipsMap;
    };
    game?: {
      players?: AutonomyPlayer[];
      week?: number;
    };
  };
}

// ── Personality weights ───────────────────────────────────────────────────

/**
 * Lightweight default personality multiplier map.
 * Values are in [0, 1] and represent how proactively an actor reaches out.
 * If the repo later adds explicit personality fields to houseguests, replace
 * this with a lookup into that data.
 *
 * Actors not listed here default to 0.5 (neutral).
 */
const PERSONALITY_FACTOR: Record<string, number> = {
  finn: 0.3, // analytical, reserved
  mimi: 0.6, // warm but shy
  rae: 0.8, // assertive, high-contact
  nova: 0.7, // social, extroverted
  leo: 0.9, // high-energy strategist
  zara: 0.7,
  dante: 0.6,
  priya: 0.7,
  sam: 0.5,
  jax: 0.8,
  luna: 0.6,
  max: 0.5,
  ivy: 0.7,
  omar: 0.6,
  kai: 0.5,
};

function getPersonalityFactor(actorId: string): number {
  return PERSONALITY_FACTOR[actorId] ?? 0.5;
}

// ── Strategic urgency per phase ────────────────────────────────────────────

/**
 * How strategically urgent each phase is for AI actors to reach out.
 * Phases not listed default to 0.3.
 */
const PHASE_URGENCY: Record<string, number> = {
  week_start: 0.5,
  nominations: 0.9,
  nomination_results: 0.8,
  pov_results: 0.7,
  pov_ceremony: 0.6,
  pov_ceremony_results: 0.7,
  live_vote: 0.95,
  eviction_results: 0.85,
  hoh_results: 0.8,
  social_1: 0.4,
  social_2: 0.4,
};

function getPhaseUrgency(phase: string): number {
  return PHASE_URGENCY[phase] ?? 0.3;
}

// ── Event pressure ─────────────────────────────────────────────────────────

/**
 * Additional event pressure bonus for particular phases.
 * This is a lighter signal that stacks on top of strategic urgency.
 */
const PHASE_EVENT_PRESSURE: Record<string, number> = {
  nominations: 0.2,
  live_vote: 0.3,
  eviction_results: 0.2,
  pov_results: 0.1,
  hoh_results: 0.1,
};

function getEventPressure(phase: string): number {
  return PHASE_EVENT_PRESSURE[phase] ?? 0;
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
  const affinity = relEntry ? normalizeAffinity(relEntry.affinity) : 0;

  const phase = context.phase;

  // High-urgency phases favour strategic interaction types
  if (phase === 'live_vote' || phase === 'nominations') {
    if (affinity >= 0.3) return 'nomination_plea';
    if (affinity <= -0.3) return 'snide_remark';
    return 'deal_offer';
  }

  if (phase === 'pov_results' || phase === 'pov_ceremony_results') {
    if (affinity >= 0.3) return 'alliance_proposal';
    if (affinity <= -0.3) return 'warning';
    return 'check_in';
  }

  if (phase === 'hoh_results' || phase === 'eviction_results') {
    if (affinity >= 0.5) return 'alliance_proposal';
    if (affinity >= 0.1) return 'compliment';
    if (affinity <= -0.4) return 'snide_remark';
    return 'gossip';
  }

  // Default / social phases
  if (affinity >= 0.4) return 'compliment';
  if (affinity >= 0.1) return 'check_in';
  if (affinity <= -0.4) return 'snide_remark';
  if (affinity <= -0.1) return 'gossip';
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

  // ── Weighted sum ────────────────────────────────────────────────────────
  const baseScore =
    w.relationshipIntensity * relationshipIntensity +
    w.strategicUrgency * strategicUrgency +
    w.personality * personality +
    w.eventPressure * eventPressure;

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
  const cfg = socialConfig.incomingInteractionConfig;

  // ── Global active cap ───────────────────────────────────────────────────
  const globalActive = pendingInteractions.filter((i) => !i.resolved).length;
  if (globalActive >= cfg.maxActive) {
    if (socialConfig.verbose) {
      console.debug(
        `[autonomy] skip ${actorId}: global active cap reached (${globalActive}/${cfg.maxActive})`,
      );
    }
    return false;
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
    return false;
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
    return false;
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
    return false;
  }

  if (socialConfig.verbose) {
    console.debug(`[autonomy] enqueue ${actorId}: score=${score.toFixed(3)}`);
  }
  return true;
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
 * enqueue incoming interactions.  Guarded behind a set for O(1) lookup.
 */
export const ELIGIBLE_PHASES = new Set<string>([
  'week_start',
  'nominations',
  'hoh_results',
  'pov_results',
  'live_vote',
  'eviction_results',
]);

/** Returns true for interaction types that expect an explicit player response. */
function interactionTypeRequiresResponse(type: IncomingInteractionType): boolean {
  return type === 'alliance_proposal' || type === 'deal_offer' || type === 'nomination_plea';
}

// ── Main scheduler ─────────────────────────────────────────────────────────

/**
 * Evaluate all AI houseguests and enqueue incoming interactions for the player
 * as appropriate for the given phase.
 *
 * Side-effects: dispatches `pushIncomingInteraction` for each chosen actor.
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

  const playerEntry = players.find((p) => p.isUser);
  if (!playerEntry) {
    if (socialConfig.verbose) {
      console.debug('[autonomy] no player found – skipping');
    }
    return;
  }
  const playerId = playerEntry.id;

  const context: AutonomyContext = {
    phase,
    week,
    relationships,
    players,
    random: contextOverride?.random,
  };

  // Make a mutable local copy so we can track newly enqueued interactions within
  // this phase pass without mutating the frozen Redux state array.
  const pendingInteractions: IncomingInteraction[] = [
    ...(socialState.incomingInteractions ?? []),
  ];

  // Evaluate each AI actor
  const aiActors = players.filter(
    (p) =>
      !p.isUser &&
      p.status !== 'evicted' &&
      p.status !== 'jury' &&
      p.id !== playerId,
  );

  for (const actor of aiActors) {
    const eligible = shouldEnqueueInteraction(actor.id, playerId, context, pendingInteractions);
    if (!eligible) continue;

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

    store.dispatch(pushIncomingInteraction(interaction));

    // Update our local snapshot so subsequent actors in this same pass see the
    // updated pending list (prevents over-filling within a single phase pass).
    pendingInteractions.unshift(interaction);
  }
}
