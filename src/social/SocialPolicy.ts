/**
 * SocialPolicy — action selection and outcome delta computation.
 *
 * Public API:
 *   chooseActionFor(playerId, context)                          → action id
 *   chooseTargetsFor(playerId, actionId, context)               → targetId[]
 *   computeOutcomeDelta(actionId, actorId, targetId, outcome)   → number
 */

import { socialConfig } from './socialConfig';
import type { PolicyContext } from './types';

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
