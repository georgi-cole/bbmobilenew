import { describe, expect, it } from 'vitest';
import gameReducer, {
  advance,
  createInitialGameState,
  queueForcedShock,
  submitTwinShockAnswer,
} from '../../src/store/gameSlice';
import { classifyTwinShockAnswer } from '../../src/bb/twinShock';
import type { GameState } from '../../src/types';

function reduce(state: GameState, action: { type: string; payload?: unknown }): GameState {
  return gameReducer(state, action);
}

function makeTwinShockState(overrides: Partial<GameState> = {}): GameState {
  const state = createInitialGameState();
  return {
    ...state,
    week: 4,
    phase: 'eviction_results',
    pendingEviction: null,
    voteResults: null,
    players: state.players.map((player) => ({
      ...player,
      status: player.id === 'lia' || player.isUser ? 'active' : player.status,
    })),
    ...overrides,
  };
}

describe('Twin Shock classifier', () => {
  it('counts direct and late twin guesses as correct', () => {
    expect(classifyTwinShockAnswer('Wait, is she a twin?')).toBe('correct_twin_guess');
    expect(classifyTwinShockAnswer('I give up, unless she has a twin?')).toBe('correct_twin_guess');
    expect(classifyTwinShockAnswer('Ali')).toBe('correct_twin_guess');
  });

  it('does not count a negated twin guess as correct', () => {
    expect(classifyTwinShockAnswer("I don't think she has a twin")).toBe('unclear');
  });
});

describe('Twin Shock reducer flow', () => {
  it('queues the mandatory Day 4 Confessional after eviction results when Lia survived', () => {
    const next = reduce(makeTwinShockState(), advance());

    expect(next.phase).toBe('eviction_results');
    expect(next.twinShock?.status).toBe('day4_pending');
    expect(next.twinShock?.promptStage).toBe('day4_initial');
    expect(next.twinShockConsumed).toBe(true);
    expect(next.twinShockActivatedSeason).toBe(next.season);
  });

  it('does not consume the twist if Lia left before the Day 4 post-eviction check', () => {
    const state = makeTwinShockState({
      players: makeTwinShockState().players.map((player) =>
        player.id === 'lia' ? { ...player, status: 'evicted' } : player,
      ),
    });
    const next = reduce(state, advance());

    expect(next.phase).toBe('week_end');
    expect(next.twinShockConsumed).toBe(false);
    expect(next.twinShock?.status).toBe('inactive');
  });

  it('can be queued from the debug forced shock menu', () => {
    let state = reduce(makeTwinShockState({ week: 2 }), queueForcedShock('twinShock'));
    state = reduce(state, advance());

    expect(state.phase).toBe('eviction_results');
    expect(state.pendingForcedShock).toBeNull();
    expect(state.twinShock?.promptStage).toBe('day4_initial');
    expect(state.twinShockConsumed).toBe(true);
  });

  it('turns Lia into Lia & Ali when the player exposes the secret', () => {
    let state = reduce(makeTwinShockState(), advance());
    state = reduce(state, submitTwinShockAnswer('Maybe she has a twin sister?'));

    const lia = state.players.find((player) => player.id === 'lia');
    expect(lia?.name).toBe('Lia & Ali');
    expect(lia?.avatar).toBe('Lia_Ali');
    expect(lia?.twinMode).toBe('combined');
    expect(state.players.some((player) => player.id === 'ali')).toBe(false);
    expect(state.twinShockResolution).toBe('discovered');
    expect(state.twinShockDiscoveredByUser).toBe(true);
  });

  it('adds Ali as a late entrant when the Day 5 mission succeeds', () => {
    const state = makeTwinShockState({
      week: 5,
      twinShockConsumed: true,
      twinShockActivatedSeason: 1,
      twinShock: {
        status: 'day4_asked_no_correct_guess',
        promptStage: null,
        queuedDay: null,
        retryCount: 0,
        cluesShownDays: [],
        pendingRevealAnimation: null,
      },
    });

    let next = reduce(state, advance());
    expect(next.twinShock?.promptStage).toBe('day5_final');

    next = reduce(next, submitTwinShockAnswer('No idea'));
    expect(next.twinShock?.promptStage).toBe('day5_give_up');

    next = reduce(next, submitTwinShockAnswer('I give up'));
    const ali = next.players.find((player) => player.id === 'ali');
    const lia = next.players.find((player) => player.id === 'lia');

    expect(ali?.name).toBe('Ali');
    expect(ali?.status).toBe('active');
    expect(ali?.lateEntrant).toBe(true);
    expect(lia?.name).toBe('Lia');
    expect(next.twinShockResolution).toBe('mission_success');
  });
});
