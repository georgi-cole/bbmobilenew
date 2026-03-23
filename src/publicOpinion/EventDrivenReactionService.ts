/**
 * EventDrivenReactionService
 *
 * Computes immediate approval deltas triggered by major game events:
 * - Nominations: HOH backlash when a liked/beloved player is nominated;
 *   sympathy boost for the nominee.
 * - Evictions: responsible-actor boosts/penalties based on the evicted
 *   player's approval standing; final eviction delta for the evicted player.
 *
 * All reactions use the approval standings at the moment the event fires,
 * so the result is deterministic given the current state.
 */

import { publicOpinionConfig } from './publicOpinionConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReactionDelta {
  playerId: string;
  delta: number;
  reason: string;
  /** Feed event type for attribution (e.g. 'nomination', 'eviction'). */
  eventType: string;
  /** ID of the player whose action caused this reaction (optional). */
  attributedToId?: string;
  /**
   * Priority level for feed-budget tie-breaking:
   * higher = more likely to be shown when budget is constrained.
   * Uses the values from publicOpinionConfig.eventFeedPriority.
   */
  feedPriority: number;
}

type ApprovalBand = 'beloved' | 'liked' | 'mixed' | 'disliked' | 'hated';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getApprovalBand(approval: number): ApprovalBand {
  const { beloved, liked, disliked, hated } = publicOpinionConfig.reactionThresholds;
  if (approval >= beloved) return 'beloved';
  if (approval >= liked) return 'liked';
  if (approval < hated) return 'hated';
  if (approval < disliked) return 'disliked';
  return 'mixed';
}

function clampDelta(delta: number, cap: number): number {
  return Math.min(cap, Math.max(-cap, delta));
}

// ── Nomination reactions ───────────────────────────────────────────────────────

export interface NominationReactionInput {
  /** IDs of the players just nominated. */
  nomineeIds: string[];
  /** ID of the HOH who made the nominations (null for automated/unknown). */
  hohId: string | null;
  /** Current approval map: playerId → approval (0–100). */
  approvals: Record<string, number>;
  week: number;
}

/**
 * Compute immediate approval reactions triggered when nominations are made.
 *
 * Rules:
 * - If a beloved/liked nominee is nominated, the HOH takes a public backlash
 *   penalty (proportional to the nominee's standing).
 * - The nominee receives a small sympathy boost if they are beloved/liked,
 *   representing audience outrage at their nomination.
 */
export function computeNominationReactions(input: NominationReactionInput): ReactionDelta[] {
  const { nomineeIds, hohId, approvals, week } = input;
  const { nominationReactions, maxDeltaPerEvent, eventFeedPriority } = publicOpinionConfig;
  const cap = maxDeltaPerEvent.nomination_reaction;
  const results: ReactionDelta[] = [];

  for (const nomineeId of nomineeIds) {
    const approval = approvals[nomineeId] ?? publicOpinionConfig.DEFAULT_APPROVAL;
    const band = getApprovalBand(approval);

    // ── HOH backlash ──────────────────────────────────────────────────────
    if (hohId && hohId !== nomineeId) {
      let hohDelta = 0;
      if (band === 'beloved') {
        hohDelta = nominationReactions.hohBelovedNomineePenalty;
      } else if (band === 'liked') {
        hohDelta = nominationReactions.hohLikedNomineePenalty;
      }
      if (hohDelta !== 0) {
        results.push({
          playerId: hohId,
          delta: clampDelta(hohDelta, cap),
          reason: 'hoh_nomination_backlash',
          eventType: 'nomination',
          attributedToId: nomineeId,
          feedPriority: eventFeedPriority.nomination ?? 2,
        });
      }
    }

    // ── Nominee sympathy ──────────────────────────────────────────────────
    let sympathy = 0;
    if (band === 'beloved') {
      sympathy = nominationReactions.nomineeSympathyBeloved;
    } else if (band === 'liked') {
      sympathy = nominationReactions.nomineeSympathyLiked;
    } else {
      sympathy = nominationReactions.nomineeSympathyMixed;
    }
    if (sympathy !== 0) {
      results.push({
        playerId: nomineeId,
        delta: clampDelta(sympathy, cap),
        reason: 'nomination_sympathy',
        eventType: 'nomination',
        attributedToId: hohId ?? undefined,
        feedPriority: eventFeedPriority.nomination ?? 2,
      });
    }
  }

  // Suppress unused week to satisfy lint rules — it is passed for future use
  // (e.g., logging or context-sensitive rules) but not needed by current logic.
  void week;

  return results;
}

// ── Eviction reactions ─────────────────────────────────────────────────────────

export interface EvictionReactionInput {
  /** ID of the player who was evicted. */
  evicteeId: string;
  /** ID of the HOH who made the nominations that led to this eviction. */
  hohId: string | null;
  /**
   * ID of the POV holder if they used the veto (and thus affected the block).
   * Null if the POV was not used or the holder is unknown.
   */
  povHolderId: string | null;
  /** Current approval map: playerId → approval (0–100). */
  approvals: Record<string, number>;
  week: number;
}

/**
 * Compute immediate approval reactions triggered when a player is evicted.
 *
 * Rules:
 * - Responsible actors (HOH, POV holder) are boosted when a disliked/hated
 *   player is evicted, and penalised when a beloved/liked player is evicted.
 * - The evicted player themselves receives a final delta: extra penalty if
 *   they were beloved (fan outrage at their exit), or a small sympathy boost
 *   if they were disliked/hated (underdog narrative on departure).
 */
export function computeEvictionReactions(input: EvictionReactionInput): ReactionDelta[] {
  const { evicteeId, hohId, povHolderId, approvals, week } = input;
  const { evictionReactions, maxDeltaPerEvent, eventFeedPriority } = publicOpinionConfig;
  const cap = maxDeltaPerEvent.eviction_reaction;
  const results: ReactionDelta[] = [];

  const evicteeApproval = approvals[evicteeId] ?? publicOpinionConfig.DEFAULT_APPROVAL;
  const band = getApprovalBand(evicteeApproval);

  // ── Responsible-actor reactions ──────────────────────────────────────────
  const responsibleIds = [hohId, povHolderId].filter(
    (id): id is string => id !== null && id !== evicteeId,
  );
  // De-duplicate (e.g. HOH won POV and used it on the same player)
  const uniqueResponsible = [...new Set(responsibleIds)];

  for (const actorId of uniqueResponsible) {
    let actorDelta = 0;
    if (band === 'beloved') {
      actorDelta = evictionReactions.belovedEvictedResponsiblePenalty;
    } else if (band === 'liked') {
      actorDelta = evictionReactions.likedEvictedResponsiblePenalty;
    } else if (band === 'hated') {
      actorDelta = evictionReactions.hatedEvictedResponsibleBoost;
    } else if (band === 'disliked') {
      actorDelta = evictionReactions.dislikedEvictedResponsibleBoost;
    }
    if (actorDelta !== 0) {
      results.push({
        playerId: actorId,
        delta: clampDelta(actorDelta, cap),
        reason: 'eviction_reaction',
        eventType: 'eviction',
        attributedToId: evicteeId,
        feedPriority: eventFeedPriority.eviction ?? 3,
      });
    }
  }

  // ── Evicted player final delta ───────────────────────────────────────────
  let evicteeDelta = 0;
  if (band === 'beloved') {
    evicteeDelta = evictionReactions.evictedBelovedFinalPenalty;
  } else if (band === 'disliked' || band === 'hated') {
    evicteeDelta = evictionReactions.evictedDislikedFinalBoost;
  }
  if (evicteeDelta !== 0) {
    results.push({
      playerId: evicteeId,
      delta: clampDelta(evicteeDelta, cap),
      reason: band === 'beloved' ? 'eviction_beloved' : 'eviction_villain_gone',
      eventType: 'eviction',
      feedPriority: eventFeedPriority.eviction ?? 3,
    });
  }

  void week;

  return results;
}

// ── POV / Public-save reactions ───────────────────────────────────────────────

export interface PovSaveReactionInput {
  /** ID of the player who was saved (by POV or public vote). */
  savedPlayerId: string;
  /** ID of the player who saved them (POV holder). Null for public-save twists. */
  saviorId: string | null;
  /** Current approval map: playerId → approval (0–100). */
  approvals: Record<string, number>;
  week: number;
  /** Whether this is a public-save twist (vs a normal POV save). */
  isPublicSave?: boolean;
}

/**
 * Compute approval reactions triggered when the POV is used to save a player,
 * or when a public-save twist fires.
 *
 * Rules:
 * - The saved player gets a boost (audience sympathy / gratitude).
 * - The savior (if any) gets a boost when saving a liked/beloved player, or a
 *   slight penalty when saving a disliked/hated player.
 */
export function computePovSaveReactions(input: PovSaveReactionInput): ReactionDelta[] {
  const { savedPlayerId, saviorId, approvals, week, isPublicSave = false } = input;
  const { povSaveReactions, maxDeltaPerEvent, eventFeedPriority } = publicOpinionConfig;
  const cap = isPublicSave
    ? maxDeltaPerEvent.public_save_reaction
    : maxDeltaPerEvent.pov_save_reaction;
  const eventType = isPublicSave ? 'public_save' : 'pov_save';
  const priority = isPublicSave
    ? (eventFeedPriority.public_save ?? 2)
    : (eventFeedPriority.pov_save ?? 1);
  const results: ReactionDelta[] = [];

  const savedApproval = approvals[savedPlayerId] ?? publicOpinionConfig.DEFAULT_APPROVAL;
  const band = getApprovalBand(savedApproval);

  // Saved player boost
  results.push({
    playerId: savedPlayerId,
    delta: clampDelta(povSaveReactions.savedPlayerBoost, cap),
    reason: isPublicSave ? 'public_save' : 'pov_save',
    eventType,
    attributedToId: saviorId ?? undefined,
    feedPriority: priority,
  });

  // Savior reactions (only for POV, not public save)
  if (saviorId && !isPublicSave) {
    let saviorDelta = 0;
    if (band === 'beloved' || band === 'liked') {
      saviorDelta = povSaveReactions.saveLikedPlayerBoost;
    } else if (band === 'disliked' || band === 'hated') {
      saviorDelta = povSaveReactions.saveDislikedPlayerPenalty;
    }
    if (saviorDelta !== 0) {
      results.push({
        playerId: saviorId,
        delta: clampDelta(saviorDelta, cap),
        reason: 'pov_save_reaction',
        eventType,
        attributedToId: savedPlayerId,
        feedPriority: priority,
      });
    }
  }

  void week;

  return results;
}
