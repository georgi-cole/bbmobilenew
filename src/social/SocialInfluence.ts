/**
 * SocialInfluence — nomination/veto bias computation and influence update events.
 *
 * Public API:
 *   initInfluence(store)                                   — wire Redux store
 *   computeNomBias(actorId, nominatedId, state)            → number (−0.15 … 0.15)
 *   computeVetoBias(vetoHolderId, nomineeId, state)        → number (−0.1 … 0.2)
 *   update(actorId, decisionType, eligibleTargets)         — dispatches social/influenceUpdated
 *
 * Debug: window.__socialInfluence exposes { computeNomBias, computeVetoBias } in browsers.
 */

import { socialConfig } from './socialConfig';
import { influenceUpdated } from './socialSlice';
import type { RelationshipsMap } from './types';

// ── Internal store reference ──────────────────────────────────────────────

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface StateForInfluence {
  social: {
    relationships: RelationshipsMap;
  };
}

let _store: StoreAPI | null = null;

/** Provide the Redux store so update() can dispatch influenceUpdated actions. */
export function initInfluence(store: StoreAPI): void {
  _store = store;
}

// ── Bias computation ──────────────────────────────────────────────────────

/**
 * Compute nomination bias for actorId toward nominatedId.
 * Allies return a negative bias (less likely to nominate);
 * enemies return a positive bias (more likely to nominate).
 * Result is clamped to socialConfig.nomBiasBounds.
 */
export function computeNomBias(
  actorId: string,
  nominatedId: string,
  state: StateForInfluence,
): number {
  const [min, max] = socialConfig.nomBiasBounds;
  const rels = state.social.relationships[actorId] ?? {};
  const rel = rels[nominatedId];
  if (!rel) return 0;

  const { allyThreshold, enemyThreshold } = socialConfig.relationshipThresholds;
  let bias: number;

  if (rel.affinity >= allyThreshold) {
    // Strong ally – actor is reluctant to nominate
    bias = min;
  } else if (rel.affinity <= enemyThreshold) {
    // Known enemy – actor is keen to nominate
    bias = max;
  } else {
    // Neutral/unknown – proportional mapping: positive affinity → negative bias (reluctant),
    // negative affinity → positive bias (keen)
    bias = allyThreshold !== 0 ? -(rel.affinity / allyThreshold) * max : 0;
  }

  // Apply tag modifiers
  if (rel.tags.includes('target')) bias = Math.min(bias + 0.05, max);
  if (rel.tags.includes('shield')) bias = Math.max(bias - 0.05, min);

  return Math.max(min, Math.min(max, bias));
}

/**
 * Compute veto bias for vetoHolderId toward a nominee.
 * Allies produce a higher bias (holder wants to use veto to save them);
 * enemies produce a lower bias (holder is indifferent or unwilling to save).
 * Result is clamped to socialConfig.vetoBiasBounds.
 */
export function computeVetoBias(
  vetoHolderId: string,
  nomineeId: string,
  state: StateForInfluence,
): number {
  const [min, max] = socialConfig.vetoBiasBounds;
  const rels = state.social.relationships[vetoHolderId] ?? {};
  const rel = rels[nomineeId];
  if (!rel) return 0;

  const { allyThreshold, enemyThreshold } = socialConfig.relationshipThresholds;
  let bias: number;

  if (rel.affinity >= allyThreshold) {
    // Strong ally – holder wants to save them
    bias = max;
  } else if (rel.affinity <= enemyThreshold) {
    // Known enemy – holder won't use the veto
    bias = min;
  } else {
    // Neutral – proportional
    bias = allyThreshold !== 0 ? (rel.affinity / allyThreshold) * max : 0;
  }

  // Apply tag modifiers
  if (rel.tags.includes('alliance')) bias = Math.min(bias + 0.05, max);

  return Math.max(min, Math.min(max, bias));
}

// ── Influence update ──────────────────────────────────────────────────────

/**
 * Compute influence weights for each eligible target and dispatch
 * `social/influenceUpdated` so the Redux store is kept in sync.
 * Has no effect if the store has not been initialised via initInfluence().
 */
export function update(
  actorId: string,
  decisionType: string,
  eligibleTargets: string[],
): void {
  if (!_store) return;

  const state = _store.getState() as StateForInfluence;
  const weights: Record<string, number> = {};

  for (const targetId of eligibleTargets) {
    if (decisionType === 'nomination') {
      weights[targetId] = computeNomBias(actorId, targetId, state);
    } else if (decisionType === 'veto') {
      weights[targetId] = computeVetoBias(actorId, targetId, state);
    } else {
      weights[targetId] = 0;
    }
  }

  _store.dispatch(influenceUpdated({ actorId, decisionType, weights }));
}

// ── Debug export ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__socialInfluence'] = {
    computeNomBias,
    computeVetoBias,
  };
}
