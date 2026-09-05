import { describe, it, expect } from 'vitest';
import {
  resolveEventMissionProgress,
  type MissionGameEvent,
} from '../../../src/publicOpinion/MissionActionMapper';
import type { PublicDirection } from '../../../src/publicOpinion/types';
import { publicOpinionConfig } from '../../../src/publicOpinion/publicOpinionConfig';

function makeDirection(overrides: Partial<PublicDirection> = {}): PublicDirection {
  return {
    id: 'dir-1',
    type: 'target_player',
    playerId: 'actor',
    relatedPlayerId: 'target',
    description: 'Target someone',
    status: 'active',
    createdWeek: 1,
    expiresAtWeek: 3,
    approvalDelta: 5,
    progressPercent: 0,
    ...overrides,
  };
}

describe('resolveEventMissionProgress', () => {
  // ── target_player ──────────────────────────────────────────────────────────

  it('target_player: nominated_target with matching relatedPlayerId advances mission', () => {
    const direction = makeDirection({ type: 'target_player', relatedPlayerId: 'rae' });
    const event: MissionGameEvent = {
      type: 'nominated_target',
      actorId: 'actor',
      targetId: 'rae',
      week: 2,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBe(publicOpinionConfig.missionDirectProgressWeight);
  });

  it('target_player: nominated_target with wrong targetId does NOT advance', () => {
    const direction = makeDirection({ type: 'target_player', relatedPlayerId: 'rae' });
    const event: MissionGameEvent = {
      type: 'nominated_target',
      actorId: 'actor',
      targetId: 'kian',  // not the mission target
      week: 2,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(0);
  });

  it('target_player: voted_to_evict the mission target advances mission', () => {
    const direction = makeDirection({ type: 'target_player', relatedPlayerId: 'rae' });
    const event: MissionGameEvent = { type: 'voted_to_evict', actorId: 'actor', targetId: 'rae', week: 2 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBeGreaterThan(0);
  });

  it('target_player: indirect negative_social with target advances mission partially', () => {
    const direction = makeDirection({ type: 'target_player', relatedPlayerId: 'rae' });
    const event: MissionGameEvent = {
      type: 'negative_social',
      actorId: 'actor',
      targetId: 'rae',
      week: 2,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBe(publicOpinionConfig.missionIndirectProgressWeight);
  });

  // ── win_competition ────────────────────────────────────────────────────────

  it('win_competition: hoh_win immediately completes the mission', () => {
    const direction = makeDirection({ type: 'win_competition' });
    const event: MissionGameEvent = { type: 'hoh_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].isComplete).toBe(true);
    expect(signals[0].newProgress).toBe(100);
  });

  it('win_competition: pov_win immediately completes the mission', () => {
    const direction = makeDirection({ type: 'win_competition' });
    const event: MissionGameEvent = { type: 'pov_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals[0].isComplete).toBe(true);
  });

  it('win_veto: pov_win immediately completes the mission', () => {
    const direction = makeDirection({ type: 'win_veto' });
    const event: MissionGameEvent = { type: 'pov_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals[0].isComplete).toBe(true);
  });

  // ── protect_player ─────────────────────────────────────────────────────────

  it('protect_player: saved_from_block with matching target advances mission directly', () => {
    const direction = makeDirection({ type: 'protect_player', relatedPlayerId: 'echo' });
    const event: MissionGameEvent = {
      type: 'saved_from_block',
      actorId: 'actor',
      targetId: 'echo',
      week: 2,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBe(publicOpinionConfig.missionDirectProgressWeight);
  });

  it('protect_player: pov_win (no target) advances mission indirectly', () => {
    const direction = makeDirection({ type: 'protect_player', relatedPlayerId: 'echo' });
    const event: MissionGameEvent = { type: 'pov_win', actorId: 'actor', week: 2 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBe(publicOpinionConfig.missionIndirectProgressWeight);
  });

  // ── get_closer ─────────────────────────────────────────────────────────────

  it('get_closer: positive_social with related player advances mission', () => {
    const direction = makeDirection({ type: 'get_closer', relatedPlayerId: 'kian' });
    const event: MissionGameEvent = {
      type: 'positive_social',
      actorId: 'actor',
      targetId: 'kian',
      week: 1,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBeGreaterThan(0);
  });

  it('get_closer: positive_social with wrong player does NOT advance', () => {
    const direction = makeDirection({ type: 'get_closer', relatedPlayerId: 'kian' });
    const event: MissionGameEvent = {
      type: 'positive_social',
      actorId: 'actor',
      targetId: 'rae',  // not the mission's related player
      week: 1,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(0);
  });

  // ── Partial progress accumulates ───────────────────────────────────────────

  it('progress accumulates across multiple events', () => {
    const direction = makeDirection({
      type: 'target_player',
      relatedPlayerId: 'rae',
      progressPercent: 30,
    });
    const event: MissionGameEvent = {
      type: 'negative_social',
      actorId: 'actor',
      targetId: 'rae',
      week: 2,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals[0].newProgress).toBe(
      30 + publicOpinionConfig.missionIndirectProgressWeight,
    );
  });

  it('progress is capped at 100', () => {
    const direction = makeDirection({
      type: 'win_competition',
      progressPercent: 90,
    });
    const event: MissionGameEvent = { type: 'hoh_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals[0].newProgress).toBe(100);
    expect(signals[0].isComplete).toBe(true);
  });

  // ── Inactive directions are skipped ───────────────────────────────────────

  it('completed direction is not re-advanced', () => {
    const direction = makeDirection({ status: 'completed' });
    const event: MissionGameEvent = { type: 'hoh_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(0);
  });

  it('expired direction is not advanced', () => {
    const direction = makeDirection({ status: 'expired' });
    const event: MissionGameEvent = { type: 'hoh_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(0);
  });

  // ── Only matching actor ────────────────────────────────────────────────────

  it('does not advance a different player\'s direction', () => {
    const direction = makeDirection({ type: 'win_competition', playerId: 'other-player' });
    const event: MissionGameEvent = { type: 'hoh_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(0);
  });

  // ── Multiple directions ────────────────────────────────────────────────────

  it('advances multiple matching directions in one pass', () => {
    const d1 = makeDirection({ id: 'd1', type: 'win_competition' });
    const d2 = makeDirection({ id: 'd2', type: 'make_bold_move' });
    const event: MissionGameEvent = { type: 'hoh_win', actorId: 'actor', week: 1 };
    const signals = resolveEventMissionProgress(event, [d1, d2]);
    // hoh_win satisfies win_competition directly and make_bold_move indirectly
    expect(signals.length).toBeGreaterThanOrEqual(1);
    const ids = signals.map((s) => s.directionId);
    expect(ids).toContain('d1');
  });

  // ── create_chaos / start_drama ─────────────────────────────────────────────

  it('create_chaos: chaos_action directly advances the mission', () => {
    const direction = makeDirection({ type: 'create_chaos' });
    const event: MissionGameEvent = { type: 'chaos_action', actorId: 'actor', week: 3 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBe(publicOpinionConfig.missionDirectProgressWeight);
  });

  it('flip_vote: voted_to_evict (any target) advances the mission', () => {
    const direction = makeDirection({ type: 'flip_vote' });
    const event: MissionGameEvent = { type: 'voted_to_evict', actorId: 'actor', targetId: 'anyone', week: 2 };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
  });

  it('repair_relationship: apologized_to related player completes mission directly', () => {
    const direction = makeDirection({
      type: 'repair_relationship',
      relatedPlayerId: 'rae',
      progressPercent: 30,
    });
    const event: MissionGameEvent = {
      type: 'apologized_to',
      actorId: 'actor',
      targetId: 'rae',
      week: 2,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals).toHaveLength(1);
    expect(signals[0].newProgress).toBe(100);
    expect(signals[0].isComplete).toBe(true);
  });

  it('break_alliance: the exact break event completes the request in one action', () => {
    const direction = makeDirection({ type: 'break_alliance', relatedPlayerId: 'nova' });
    const event: MissionGameEvent = {
      type: 'broke_alliance',
      actorId: 'actor',
      targetId: 'nova',
      week: 2,
    };
    const signals = resolveEventMissionProgress(event, [direction]);
    expect(signals[0].newProgress).toBe(100);
    expect(signals[0].isComplete).toBe(true);
  });
});
