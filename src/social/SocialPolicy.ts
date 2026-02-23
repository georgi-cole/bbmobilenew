/**
 * SocialPolicy — action selection and outcome delta computation.
 *
 * Public API:
 *   chooseActionFor(playerId, context)                          → action id
 *   chooseTargetsFor(playerId, actionId, context)               → targetId[]
 *   computeOutcomeDelta(actionId, actorId, targetId, outcome)   → number
 *   computeOutcomeScore(actionId, actorId, targetId, mode, rels?) → number [-1..+1]
 *   evaluateOutcome(params)                                     → OutcomeResult
 */

import { socialConfig } from './socialConfig';
import type { PolicyContext, RelationshipsMap } from './types';

// ── Evaluator configuration ───────────────────────────────────────────────

/**
 * Score thresholds that map a numeric score to a label.
 * Tune these values to adjust how outcomes feel to players.
 */
export const OUTCOME_THRESHOLDS = {
  /** score <= bad   → 'Bad'     */
  bad: -0.25,
  /** score <  unmoved → 'Unmoved' */
  unmoved: 0.05,
  /** score <  good  → 'Good', else 'Great' */
  good: 0.3,
} as const;

/**
 * Maximum RNG jitter added in 'execute' mode to mimic legacy variance.
 * Set to 0 to make execution fully deterministic as well.
 */
const JITTER_MAGNITUDE = 0.08;

/** Weight applied to existing affinity when computing actorBias. */
const ACTOR_BIAS_WEIGHT = 0.1;

// ── Evaluator types ───────────────────────────────────────────────────────

export type OutcomeLabel = 'Bad' | 'Unmoved' | 'Good' | 'Great';

/** Full outcome result returned by evaluateOutcome. */
export interface OutcomeResult {
  /** Normalised score in [-1, +1]. */
  score: number;
  /** Human-readable outcome label. */
  label: OutcomeLabel;
  /** Absolute magnitude of the score. */
  magnitude: number;
  /** Optional narrative description of the outcome. */
  narrative?: string;
}

/** Parameters for evaluateOutcome. */
export interface EvaluateOutcomeParams {
  actionId: string;
  actorId: string;
  /** One or more target player ids. Score is averaged across all targets. */
  targetIds: string | string[];
  mode: 'preview' | 'execute';
  /** Optional relationship graph for actor/target bias calculation. */
  relationships?: RelationshipsMap;
}

/**
 * Deterministic weighted-random action selection for an AI player.
 * Uses the game seed (when provided) mixed with the player id to
 * produce a per-player, per-phase stable choice.
 */
export function chooseActionFor(playerId: string, context: PolicyContext): string {
  const weights = socialConfig.actionWeights;
  const entries = Object.entries(weights);
  if (entries.length === 0) return 'idle';

  // Mix game seed with a simple sum of the player id char codes for per-player variance
  const idSum = playerId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  let rng = (((context.seed ?? 0) ^ idSum) >>> 0);
  rng = ((rng * 1664525 + 1013904223) >>> 0);

  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let pick = (rng / 0xffffffff) * total;
  for (const [action, weight] of entries) {
    pick -= weight;
    if (pick <= 0) return action;
  }
  return entries[entries.length - 1][0];
}

/**
 * Return eligible target player ids for a given action.
 * Friendly actions (ally, protect) prefer known allies; aggressive actions
 * (betray, nominate) prefer known enemies. Falls back to the first eligible
 * player when no matching relationship is found.
 */
export function chooseTargetsFor(
  playerId: string,
  actionId: string,
  context: PolicyContext,
): string[] {
  const { players, relationships } = context;
  const eligible = players.filter(
    (p) => p.id !== playerId && p.status !== 'evicted' && p.status !== 'jury',
  );
  if (eligible.length === 0) return [];

  const { allyThreshold, enemyThreshold } = socialConfig.relationshipThresholds;
  const { friendlyActions, aggressiveActions } = socialConfig.actionCategories;
  const rels = relationships[playerId] ?? {};

  if (friendlyActions.includes(actionId)) {
    const allies = eligible.filter((p) => (rels[p.id]?.affinity ?? 0) >= allyThreshold);
    return allies.length > 0 ? [allies[0].id] : [eligible[0].id];
  }

  if (aggressiveActions.includes(actionId)) {
    const enemies = eligible.filter((p) => (rels[p.id]?.affinity ?? 0) <= enemyThreshold);
    return enemies.length > 0 ? [enemies[0].id] : [eligible[0].id];
  }

  return [eligible[0].id];
}

/**
 * Compute the affinity delta resulting from an action's outcome.
 * Positive for friendly actions, negative for aggressive ones.
 * Returns 0 for unknown actions.
 */
export function computeOutcomeDelta(
  actionId: string,
  _actorId: string,
  _targetId: string,
  outcome: string,
): number {
  const { friendlyActions, aggressiveActions } = socialConfig.actionCategories;
  const deltas = socialConfig.affinityDeltas;

  if (friendlyActions.includes(actionId)) {
    return outcome === 'success' ? deltas.friendlySuccess : deltas.friendlyFailure;
  }
  if (aggressiveActions.includes(actionId)) {
    return outcome === 'success' ? deltas.aggressiveSuccess : deltas.aggressiveFailure;
  }
  return 0;
}

// ── Outcome evaluator ─────────────────────────────────────────────────────

/**
 * Map a numeric score to a human-readable label using OUTCOME_THRESHOLDS.
 */
function scoreToLabel(score: number): OutcomeLabel {
  if (score <= OUTCOME_THRESHOLDS.bad) return 'Bad';
  if (score < OUTCOME_THRESHOLDS.unmoved) return 'Unmoved';
  if (score < OUTCOME_THRESHOLDS.good) return 'Good';
  return 'Great';
}

/**
 * Compute a normalised outcome score in [-1, +1] for a single actor→target action.
 *
 * Deterministic in 'preview' mode — same inputs always yield the same score.
 * In 'execute' mode a small configurable RNG jitter is added to mimic legacy
 * variance. Pass the current relationship graph for a richer actor/target bias.
 */
export function computeOutcomeScore(
  actionId: string,
  actorId: string,
  targetId: string,
  mode: 'preview' | 'execute',
  relationships?: RelationshipsMap,
): number {
  const { friendlyActions, aggressiveActions } = socialConfig.actionCategories;
  const deltas = socialConfig.affinityDeltas;

  // Base effect derived from action category.
  const baseScore: number = friendlyActions.includes(actionId)
    ? deltas.friendlySuccess
    : aggressiveActions.includes(actionId)
      ? deltas.aggressiveSuccess
      : 0;

  // Actor bias: scale by existing affinity from actor toward target.
  const existingAffinity = relationships?.[actorId]?.[targetId]?.affinity ?? 0;
  const actorBias = existingAffinity * ACTOR_BIAS_WEIGHT;

  let score = Math.max(-1, Math.min(1, baseScore + actorBias));

  // In execute mode add small RNG jitter to mimic legacy variance.
  if (mode === 'execute') {
    const jitter = (Math.random() * 2 - 1) * JITTER_MAGNITUDE;
    score = Math.max(-1, Math.min(1, score + jitter));
  }

  return score;
}

/**
 * Perform a full outcome evaluation for one or more targets.
 * In 'execute' mode a small RNG jitter is applied (configurable via JITTER_MAGNITUDE).
 * In 'preview' mode the result is fully deterministic.
 *
 * Returns an OutcomeResult with score (averaged across targets), label, and magnitude.
 */
export function evaluateOutcome(params: EvaluateOutcomeParams): OutcomeResult {
  const { actionId, actorId, targetIds, mode, relationships } = params;
  const targets = Array.isArray(targetIds) ? targetIds : [targetIds];

  const scores = targets.map((t) =>
    computeOutcomeScore(actionId, actorId, t, mode, relationships),
  );
  const score = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const label = scoreToLabel(score);
  const magnitude = Math.abs(score);

  return { score, label, magnitude };
}
