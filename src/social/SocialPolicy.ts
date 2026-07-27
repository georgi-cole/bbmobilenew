/**
 * SocialPolicy — action selection, target selection and outcome evaluation.
 */

import { socialConfig } from './socialConfig';
import { normalizeAffinity } from './affinityUtils';
import { hasAllianceBetween } from './socialAlliance';
import { getSocialPersonality } from './socialPersonalityBank';
import { getSocialRuntimeConfig } from './socialRuntimeConfig';
import type { PolicyContext, RelationshipsMap, SocialActionLogEntry } from './types';

// ── Evaluator configuration ───────────────────────────────────────────────

export const OUTCOME_THRESHOLDS = {
  bad: -0.25,
  unmoved: 0.05,
  good: 0.3,
} as const;

export type OutcomeLabel = 'Bad' | 'Unmoved' | 'Good' | 'Great';

export interface OutcomeResult {
  score: number;
  label: OutcomeLabel;
  magnitude: number;
  narrative?: string;
}

export interface EvaluateOutcomeParams {
  actionId: string;
  actorId: string;
  targetIds: string | string[];
  mode: 'preview' | 'execute';
  outcome?: 'success' | 'failure';
  relationships?: RelationshipsMap;
  /** Optional seeded RNG used by execution and deterministic simulations. */
  random?: () => number;
}

interface RichPolicyContext extends PolicyContext {
  phase?: string;
  decisionIndex?: number;
  recentActions?: readonly SocialActionLogEntry[];
  availableActionIds?: readonly string[];
}

function hashUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 1_000_003) / 1_000_003;
}

function seededTie(seed: string): number {
  return hashUnit(seed) * 0.0001;
}

function recentCount(
  context: RichPolicyContext,
  actorId: string,
  actionId?: string,
  targetId?: string,
): number {
  return (context.recentActions ?? []).filter(
    (entry) =>
      entry.actorId === actorId &&
      (context.week === undefined || entry.week === context.week) &&
      (!actionId || entry.actionId === actionId) &&
      (!targetId || entry.targetId === targetId),
  ).length;
}

/**
 * Contextual weighted selection for Normal Mode. It remains deterministic for
 * the same state, but includes week, phase, actor role, relationships,
 * personality and recent repetition instead of locking each actor to one
 * action for the whole season.
 */
export function chooseActionFor(playerId: string, rawContext: PolicyContext): string {
  const context = rawContext as RichPolicyContext;
  const configuredWeights = socialConfig.actionWeights;
  const configuredEntries = Object.entries(configuredWeights);
  if (configuredEntries.length === 0) return 'idle';

  const runtime = getSocialRuntimeConfig();
  const allowed = context.availableActionIds
    ? new Set(context.availableActionIds)
    : null;
  const actor = context.players.find((player) => player.id === playerId);
  const actorStatus = actor?.status ?? '';
  const personality = getSocialPersonality(playerId);
  const relationships = context.relationships[playerId] ?? {};
  const affinities = Object.values(relationships).map((entry) => normalizeAffinity(entry.affinity));
  const strongest = affinities.length > 0 ? Math.max(...affinities) : 0;
  const weakest = affinities.length > 0 ? Math.min(...affinities) : 0;
  const { friendlyActions, aggressiveActions } = socialConfig.actionCategories;

  const candidates = configuredEntries
    .filter(([actionId]) => !allowed || allowed.has(actionId))
    .map(([actionId, authoredWeight]) => {
      let utility = runtime.ai.basicActionWeights[actionId] ?? authoredWeight;
      const repeats = recentCount(context, playerId, actionId);

      if (friendlyActions.includes(actionId)) {
        utility *= 0.65 + personality.warmth * 0.55 + Math.max(0, strongest) * 0.8;
      }
      if (aggressiveActions.includes(actionId)) {
        utility *=
          0.45 +
          personality.assertiveness * 0.35 +
          personality.riskTolerance * 0.35 +
          Math.max(0, -weakest) * 0.9;
      }
      if (actionId === 'whisper' || actionId === 'rumor' || actionId === 'share_intel') {
        utility *= 0.55 + personality.gossipPropensity * 0.75;
      }
      if (actionId === 'proposeAlliance' || actionId === 'ally') {
        utility *= strongest >= 0.15 ? 1 + personality.loyalty * 0.4 : 0.15;
      }
      if (actionId === 'idle') {
        utility *= 1.1 - personality.socialEnergy * 0.75;
      }

      if (actorStatus.includes('nominated')) {
        if (actionId === 'ask_use_safety' || actionId === 'protect') utility *= 2.2;
        if (actionId === 'reassure' || actionId === 'compliment') utility *= 1.25;
      }
      if (actorStatus.includes('loh')) {
        if (actionId === 'nominate') utility *= 2.4;
        if (actionId === 'whisper' || actionId === 'protect') utility *= 1.35;
      }
      if (actorStatus.includes('pos')) {
        if (actionId === 'protect' || actionId === 'whisper') utility *= 1.45;
      }

      utility /= 1 + repeats * runtime.ai.repetitionPenalty;
      utility +=
        hashUnit(
          `${context.seed ?? 0}:${context.week ?? 0}:${context.phase ?? ''}:${playerId}:${actionId}`,
        ) * runtime.ai.noveltyWeight;
      return { actionId, utility: Math.max(0, utility) };
    })
    .filter((candidate) => candidate.utility > 0);

  if (candidates.length === 0) return 'idle';
  const total = candidates.reduce((sum, candidate) => sum + candidate.utility, 0);
  if (total <= 0) return 'idle';

  const roll =
    hashUnit(
      `${context.seed ?? 0}:${context.week ?? 0}:${context.phase ?? ''}:${context.decisionIndex ?? 0}:${playerId}`,
    ) * total;
  let remaining = roll;
  for (const candidate of candidates) {
    remaining -= candidate.utility;
    if (remaining <= 0) return candidate.actionId;
  }
  return candidates[candidates.length - 1]?.actionId ?? 'idle';
}

function roleValue(status: string): number {
  let value = 0;
  if (status.includes('loh')) value += 0.28;
  if (status.includes('pos')) value += 0.18;
  if (status.includes('nominated')) value += 0.14;
  return value;
}

function sortedByScore<T extends { id: string }>(
  items: T[],
  score: (item: T) => number,
  seed: string,
): T[] {
  return [...items].sort(
    (left, right) =>
      score(right) - score(left) ||
      seededTie(`${seed}:${right.id}`) - seededTie(`${seed}:${left.id}`) ||
      left.id.localeCompare(right.id),
  );
}

/** Return plausible target player IDs for a given action. */
export function chooseTargetsFor(
  playerId: string,
  actionId: string,
  rawContext: PolicyContext,
): string[] {
  const context = rawContext as RichPolicyContext;
  const { players, relationships } = context;
  const eligible = players.filter(
    (player) =>
      player.id !== playerId && player.status !== 'evicted' && player.status !== 'jury',
  );
  if (eligible.length === 0) return [];

  if (actionId === 'ask_use_safety') {
    const posHolder = eligible.find((player) => player.status.includes('pos'));
    if (!posHolder) return [];
    if (posHolder.status.includes('nominated')) return [posHolder.id, posHolder.id];

    const actor = players.find((player) => player.id === playerId);
    if (actor?.status.includes('nominated')) return [posHolder.id, playerId];

    const nomineePool = players.filter(
      (player) => player.id !== posHolder.id && player.status.includes('nominated'),
    );
    if (nomineePool.length === 0) return [];
    const posHolderRels = relationships[posHolder.id] ?? {};
    const preferredNominee = sortedByScore(
      nomineePool,
      (player) => normalizeAffinity(posHolderRels[player.id]?.affinity ?? 0),
      `${context.seed ?? 0}:safety:${posHolder.id}`,
    )[0];
    return preferredNominee ? [posHolder.id, preferredNominee.id] : [];
  }

  const { allyThreshold, enemyThreshold } = socialConfig.relationshipThresholds;
  const { friendlyActions, aggressiveActions } = socialConfig.actionCategories;
  const rels = relationships[playerId] ?? {};
  const actorStatus = players.find((player) => player.id === playerId)?.status ?? '';
  const seed = `${context.seed ?? 0}:${context.week ?? 0}:${context.phase ?? ''}:${playerId}:${actionId}`;
  const repeatPenalty = getSocialRuntimeConfig().ai.repetitionPenalty;

  const relationshipScore = (targetId: string) =>
    normalizeAffinity(rels[targetId]?.affinity ?? 0);
  const novelty = (targetId: string) =>
    1 / (1 + recentCount(context, playerId, actionId, targetId) * repeatPenalty);

  if (actionId === 'betray') {
    const strainedAlliances = eligible.filter((player) => {
      if (!hasAllianceBetween(relationships, playerId, player.id)) return false;
      const outward = relationships[playerId]?.[player.id];
      const inward = relationships[player.id]?.[playerId];
      const minAffinity = Math.min(
        normalizeAffinity(outward?.affinity ?? 0),
        normalizeAffinity(inward?.affinity ?? 0),
      );
      const tags = new Set([...(outward?.tags ?? []), ...(inward?.tags ?? [])]);
      return minAffinity < 0.2 || ['distrust', 'target', 'rivalry'].some((tag) => tags.has(tag));
    });
    const target = sortedByScore(
      strainedAlliances,
      (player) => -relationshipScore(player.id) + roleValue(player.status) + novelty(player.id),
      seed,
    )[0];
    return target ? [target.id] : [];
  }

  if (actionId === 'ally' || actionId === 'proposeAlliance') {
    const prospects = eligible.filter(
      (player) => !hasAllianceBetween(relationships, playerId, player.id),
    );
    const credible = prospects.filter((player) => {
      const affinity = relationshipScore(player.id);
      const strategicPressure = /loh|hoh|pos|pov|nominated/i.test(
        `${actorStatus} ${player.status}`,
      );
      return affinity >= allyThreshold || (affinity >= 0.15 && strategicPressure);
    });
    const target = sortedByScore(
      credible,
      (player) => relationshipScore(player.id) + roleValue(player.status) + novelty(player.id),
      seed,
    )[0];
    return target ? [target.id] : [];
  }

  if (friendlyActions.includes(actionId)) {
    const allies = eligible.filter(
      (player) => relationshipScore(player.id) >= allyThreshold,
    );
    const pool = allies.length > 0 ? allies : eligible;
    const target = sortedByScore(
      pool,
      (player) => relationshipScore(player.id) + roleValue(player.status) * 0.35 + novelty(player.id),
      seed,
    )[0];
    return target ? [target.id] : [];
  }

  if (aggressiveActions.includes(actionId)) {
    const enemies = eligible.filter(
      (player) => relationshipScore(player.id) <= enemyThreshold,
    );
    const pool = enemies.length > 0 ? enemies : eligible;
    const target = sortedByScore(
      pool,
      (player) => -relationshipScore(player.id) + roleValue(player.status) + novelty(player.id),
      seed,
    )[0];
    return target ? [target.id] : [];
  }

  const target = sortedByScore(
    eligible,
    (player) => roleValue(player.status) + novelty(player.id),
    seed,
  )[0];
  return target ? [target.id] : [];
}

/** Compute the display-scale affinity delta for an action outcome. */
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

function scoreToLabel(score: number): OutcomeLabel {
  if (score <= OUTCOME_THRESHOLDS.bad) return 'Bad';
  if (score < OUTCOME_THRESHOLDS.unmoved) return 'Unmoved';
  if (score < OUTCOME_THRESHOLDS.good) return 'Good';
  return 'Great';
}

function outcomeAffinity(value: number): number {
  // Older tests and pre-normalisation callers sometimes supplied [-1, 1]
  // values directly. Preserve that contract while correctly normalising the
  // real display-scale relationship values used by production.
  return Math.abs(value) <= 2 ? value : normalizeAffinity(value);
}

/** Compute a normalised outcome score in [-1, +1]. */
export function computeOutcomeScore(
  actionId: string,
  actorId: string,
  targetId: string,
  mode: 'preview' | 'execute',
  relationships?: RelationshipsMap,
  outcome: 'success' | 'failure' = 'success',
  random: () => number = Math.random,
): number {
  const { friendlyActions, aggressiveActions } = socialConfig.actionCategories;
  const deltas = socialConfig.scoreDeltas;
  const runtime = getSocialRuntimeConfig();

  const baseScore: number = friendlyActions.includes(actionId)
    ? outcome === 'success'
      ? deltas.friendlySuccess
      : deltas.friendlyFailure
    : aggressiveActions.includes(actionId)
      ? outcome === 'success'
        ? deltas.aggressiveSuccess
        : deltas.aggressiveFailure
      : 0;

  const existingAffinity = relationships?.[actorId]?.[targetId]?.affinity ?? 0;
  const actorBias =
    outcomeAffinity(existingAffinity) * runtime.ai.outcomeAffinityBiasWeight;

  let score = Math.max(-1, Math.min(1, baseScore + actorBias));
  if (mode === 'execute') {
    const jitter = (random() * 2 - 1) * runtime.ai.outcomeJitterMagnitude;
    score = Math.max(-1, Math.min(1, score + jitter));
  }

  return score;
}

/** Perform a full outcome evaluation for one or more targets. */
export function evaluateOutcome(params: EvaluateOutcomeParams): OutcomeResult {
  const {
    actionId,
    actorId,
    targetIds,
    mode,
    outcome = 'success',
    relationships,
    random,
  } = params;
  const targets = Array.isArray(targetIds) ? targetIds : [targetIds];
  if (targets.length === 0) return { score: 0, label: 'Unmoved', magnitude: 0 };

  const scores = targets.map((targetId) =>
    computeOutcomeScore(
      actionId,
      actorId,
      targetId,
      mode,
      relationships,
      outcome,
      random,
    ),
  );
  const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const label = scoreToLabel(score);
  const magnitude = Math.abs(score);

  return { score, label, magnitude };
}
