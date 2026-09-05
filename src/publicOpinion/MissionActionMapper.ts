/**
 * MissionActionMapper
 *
 * Translates concrete gameplay events into mission-progress signals for active
 * PublicDirection missions.  Supports direct and indirect action contributions,
 * weighted partial progress, and multiple event types satisfying the same
 * mission.
 *
 * Architecture:
 *  - Each DirectionType has a list of MissionTrigger rules.
 *  - A trigger fires when a MissionGameEvent matches its eventType and,
 *    optionally, the relatedPlayerId of the direction.
 *  - Each trigger carries a `weight` (0–100) representing how much it
 *    contributes toward the 100-point completion threshold.
 *  - One trigger may fire per event; the first matching rule wins.
 *  - The mapper returns a MissionProgressSignal for each affected direction.
 */

import { publicOpinionConfig } from './publicOpinionConfig'
import type { DirectionType, PublicDirection } from './types'

// ── Game-event vocabulary ─────────────────────────────────────────────────────

export type MissionGameEventType =
  | 'hoh_win'
  | 'pov_win'
  | 'nominated_target' // acted as LOH / influencer and nominated targetId
  | 'voted_to_evict' // cast a vote to evict targetId
  | 'saved_from_block' // used veto / campaign to save targetId
  | 'influenced_hoh' // persuaded/pressured LOH (targetId = LOH)
  | 'formed_alliance' // entered alliance with targetId
  | 'broke_alliance' // severed alliance with targetId
  | 'confronted_player' // publicly confronted targetId
  | 'spread_rumor' // spread rumor about targetId
  | 'apologized_to' // apologized to targetId
  | 'showed_loyalty' // demonstrated loyalty to an ally (targetId = ally)
  | 'positive_social' // positive social interaction with targetId
  | 'negative_social' // negative social interaction with targetId
  | 'betrayal' // betrayed targetId
  | 'bold_move' // made a bold strategic move (no specific target)
  | 'chaos_action' // created chaos / escalated drama
  | 'won_competition' // won any competition (generic)

export interface MissionGameEvent {
  type: MissionGameEventType
  /** The player who performed the action. */
  actorId: string
  /** Optional: the player who was the target of the action. */
  targetId?: string
  week: number
}

// ── Trigger rule ──────────────────────────────────────────────────────────────

interface MissionTrigger {
  eventType: MissionGameEventType
  /**
   * If true, the event's targetId must match the direction's relatedPlayerId
   * for this trigger to fire.  If false (default) any target matches.
   */
  requiresRelatedTarget?: boolean
  /** 0–100 progress contribution. */
  weight: number
}

// ── Mission map ───────────────────────────────────────────────────────────────

const MISSION_TRIGGER_MAP: Record<DirectionType, MissionTrigger[]> = {
  // ── Target a player for nomination / eviction ───────────────────────────
  target_player: [
    {
      eventType: 'nominated_target',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'voted_to_evict',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'influenced_hoh',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'negative_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'spread_rumor',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'betrayal',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
  ],

  // ── Protect / save a player ─────────────────────────────────────────────
  protect_player: [
    {
      eventType: 'saved_from_block',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'pov_win',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'positive_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'formed_alliance',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'showed_loyalty',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'influenced_hoh',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Get closer to a player ──────────────────────────────────────────────
  get_closer: [
    { eventType: 'positive_social', requiresRelatedTarget: true, weight: 100 },
    {
      eventType: 'formed_alliance',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'showed_loyalty',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'apologized_to',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Expose a liar / stir distrust ───────────────────────────────────────
  expose_player: [
    {
      eventType: 'spread_rumor',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'confronted_player',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'negative_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'betrayal',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Repair a relationship / apologize ───────────────────────────────────
  apologize: [
    {
      eventType: 'apologized_to',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'positive_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Repair relationship (standalone type alias) ─────────────────────────
  repair_relationship: [
    { eventType: 'apologized_to', requiresRelatedTarget: true, weight: 100 },
    {
      eventType: 'positive_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'formed_alliance',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Make a bold move ────────────────────────────────────────────────────
  make_bold_move: [
    {
      eventType: 'bold_move',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'confronted_player',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'hoh_win',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'nominated_target',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'chaos_action',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Win a competition ───────────────────────────────────────────────────
  win_competition: [
    { eventType: 'hoh_win', requiresRelatedTarget: false, weight: 100 },
    { eventType: 'pov_win', requiresRelatedTarget: false, weight: 100 },
    { eventType: 'won_competition', requiresRelatedTarget: false, weight: 100 },
  ],

  // ── Win the Power of Safety ───────────────────────────────────────────────
  win_veto: [{ eventType: 'pov_win', requiresRelatedTarget: false, weight: 100 }],

  // ── Show loyalty ────────────────────────────────────────────────────────
  show_loyalty: [
    {
      eventType: 'showed_loyalty',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'positive_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'saved_from_block',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'voted_to_evict',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Break up an alliance ────────────────────────────────────────────────
  break_alliance: [
    { eventType: 'broke_alliance', requiresRelatedTarget: true, weight: 100 },
    { eventType: 'betrayal', requiresRelatedTarget: true, weight: 100 },
    {
      eventType: 'negative_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'spread_rumor',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Reinforce an alliance ───────────────────────────────────────────────
  reinforce_alliance: [
    { eventType: 'formed_alliance', requiresRelatedTarget: true, weight: 100 },
    { eventType: 'showed_loyalty', requiresRelatedTarget: true, weight: 100 },
    {
      eventType: 'positive_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'saved_from_block',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Align with a player ─────────────────────────────────────────────────
  align_with: [
    { eventType: 'formed_alliance', requiresRelatedTarget: true, weight: 100 },
    {
      eventType: 'positive_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'showed_loyalty',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Confront a rival ────────────────────────────────────────────────────
  confront_player: [
    { eventType: 'confronted_player', requiresRelatedTarget: true, weight: 100 },
    {
      eventType: 'negative_social',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'spread_rumor',
      requiresRelatedTarget: true,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Influence the LOH ───────────────────────────────────────────────────
  influence_hoh: [
    {
      eventType: 'influenced_hoh',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'positive_social',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'negative_social',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'nominated_target',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Flip a vote ─────────────────────────────────────────────────────────
  // A "flip" is about voting unexpectedly, not targeting a pre-defined player,
  // so voted_to_evict does not require the relatedPlayerId to match.
  flip_vote: [
    {
      eventType: 'voted_to_evict',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'betrayal',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'influenced_hoh',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'negative_social',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Start drama / create chaos ──────────────────────────────────────────
  start_drama: [
    {
      eventType: 'chaos_action',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'confronted_player',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'spread_rumor',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'negative_social',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'betrayal',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],

  // ── Create chaos (alias) ────────────────────────────────────────────────
  create_chaos: [
    {
      eventType: 'chaos_action',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionDirectProgressWeight,
    },
    {
      eventType: 'confronted_player',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'spread_rumor',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'betrayal',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
    {
      eventType: 'bold_move',
      requiresRelatedTarget: false,
      weight: publicOpinionConfig.missionIndirectProgressWeight,
    },
  ],
}

// ── Progress signal ───────────────────────────────────────────────────────────

export interface MissionProgressSignal {
  directionId: string
  /** Cumulative progress 0–100 after this event. */
  newProgress: number
  /** True when progress has reached the completion threshold. */
  isComplete: boolean
  /** The triggering event type for logging / UI. */
  triggeredBy: MissionGameEventType
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Given a gameplay event and the set of active mission directions for the
 * acting player, return progress signals for every direction that is advanced
 * by this event.
 *
 * Only directions whose `playerId` matches `event.actorId` are evaluated.
 * The caller is responsible for applying the returned signals (updating
 * `progressPercent` and potentially calling `resolveDirection`).
 */
export function resolveEventMissionProgress(
  event: MissionGameEvent,
  activeDirections: PublicDirection[]
): MissionProgressSignal[] {
  const signals: MissionProgressSignal[] = []
  const threshold = publicOpinionConfig.missionCompletionThreshold

  for (const direction of activeDirections) {
    if (direction.status !== 'active') continue
    if (direction.playerId !== event.actorId) continue

    const triggers = MISSION_TRIGGER_MAP[direction.type]
    if (!triggers) continue

    // Find the first matching trigger
    const match = triggers.find((trigger) => {
      if (trigger.eventType !== event.type) return false
      if (trigger.requiresRelatedTarget) {
        // Must have a relatedPlayerId and targetId, and they must match
        return (
          direction.relatedPlayerId !== undefined &&
          event.targetId !== undefined &&
          direction.relatedPlayerId === event.targetId
        )
      }
      return true
    })

    if (!match) continue

    const currentProgress = direction.progressPercent ?? 0
    const newProgress = Math.min(100, currentProgress + match.weight)
    const isComplete = newProgress >= threshold

    signals.push({
      directionId: direction.id,
      newProgress,
      isComplete,
      triggeredBy: event.type,
    })
  }

  return signals
}
