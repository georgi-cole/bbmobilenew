import { describe, expect, it } from 'vitest';
import gameReducer, {
  advance,
  createInitialGameState,
  queueForcedShock,
  submitPovDecision,
  submitPovSaveTarget,
  submitTwinShockAnswer,
} from '../../src/store/gameSlice';
import { classifyTwinShockAnswer } from '../../src/bb/twinShock';
import type { GameState } from '../../src/types';
import { resolveSkinAssetPathWithFallback } from '../../src/utils/skinAssets';

const TWIN_SHOCK_COMBINED_AVATAR = resolveSkinAssetPathWithFallback(
  'Ali_lia_avatar.webp',
  'Lia_Ali_avatar.webp',
);
const TWIN_SHOCK_LIA_FLIP_AVATAR = resolveSkinAssetPathWithFallback(
  'Lia_flip_avatar.webp',
  'Lia_avatar.webp',
);

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
    const lia = next.players.find((player) => player.id === 'lia');

    expect(next.phase).toBe('eviction_results');
    expect(next.twinShock?.status).toBe('day4_pending');
    expect(next.twinShock?.promptStage).toBe('day4_initial');
    expect(next.twinShockConsumed).toBe(true);
    expect(next.twinShockActivatedSeason).toBe(next.season);
    expect(lia?.avatar).toBe('assets/skins/Lia_avatar.webp');
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
    expect(lia?.avatar).toBe(TWIN_SHOCK_COMBINED_AVATAR);
    expect(lia?.twinMode).toBe('combined');
    expect(state.players.some((player) => player.id === 'ali')).toBe(false);
    expect(state.twinShockResolution).toBe('discovered');
    expect(state.twinShockDiscoveredByUser).toBe(true);
    expect(state.twinShock?.pendingRevealAnimation).toMatchObject({
      type: 'combined',
      playerId: 'lia',
      toAvatar: TWIN_SHOCK_COMBINED_AVATAR,
    });
  });

  it('continues the debug-forced prompt on the next day after the first answer', () => {
    let state = reduce(makeTwinShockState({ week: 1 }), queueForcedShock('twinShock'));
    state = reduce(state, advance());
    state = reduce(state, submitTwinShockAnswer('No idea'));

    expect(state.twinShock?.status).toBe('day4_asked_no_correct_guess');
    expect(state.twinShock?.queuedDay).toBe(1);

    state = {
      ...state,
      week: 2,
      phase: 'eviction_results',
    };
    state = reduce(state, advance());

    expect(state.phase).toBe('eviction_results');
    expect(state.twinShock?.promptStage).toBe('day5_final');
  });

  it('secretly flips Lia to the hint avatar after the first failed confessional', () => {
    let state = reduce(makeTwinShockState({ week: 1 }), queueForcedShock('twinShock'));
    state = reduce(state, advance());
    state = reduce(state, submitTwinShockAnswer('No idea'));

    const lia = state.players.find((player) => player.id === 'lia');
    expect(lia?.name).toBe('Lia');
    expect(lia?.avatar).toBe(TWIN_SHOCK_LIA_FLIP_AVATAR);
    expect(state.twinShock?.status).toBe('day4_asked_no_correct_guess');
    expect(state.twinShock?.promptStage).toBeNull();
  });

  it('lets the player expose the twins later without waiting for the next Big Eye call', () => {
    let state = reduce(makeTwinShockState({ week: 1 }), queueForcedShock('twinShock'));
    state = reduce(state, advance());
    state = reduce(state, submitTwinShockAnswer('No idea'));
    state = reduce(state, submitTwinShockAnswer('Wait, Lia has a twin sister'));

    const lia = state.players.find((player) => player.id === 'lia');
    expect(lia?.name).toBe('Lia & Ali');
    expect(lia?.avatar).toBe(TWIN_SHOCK_COMBINED_AVATAR);
    expect(lia?.twinMode).toBe('combined');
    expect(state.twinShockDiscoveredByUser).toBe(true);
    expect(state.twinShockResolution).toBe('discovered');
    expect(state.players.some((player) => player.id === 'ali')).toBe(false);
  });

  it('replaces the first evicted housemate with Ali when the next-day mission succeeds', () => {
    const base = makeTwinShockState();
    const evicted = base.players.find((player) => !player.isUser && player.id !== 'lia');
    if (!evicted) throw new Error('expected a non-user housemate to evict');
    const originalLength = base.players.length;
    const replacedId = evicted.id;

    const state = makeTwinShockState({
      week: 2,
      players: base.players.map((player) =>
        player.id === replacedId
          ? {
            ...player,
            status: 'evicted',
            evictedAtWeek: 1,
            seasonPlacement: originalLength,
          }
          : player,
      ),
      twinShockConsumed: true,
      twinShockActivatedSeason: 1,
      twinShock: {
        status: 'day4_asked_no_correct_guess',
        promptStage: null,
        queuedDay: 1,
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

    expect(next.players).toHaveLength(originalLength);
    expect(next.players.some((player) => player.id === replacedId)).toBe(false);
    expect(ali?.name).toBe('Ali');
    expect(ali?.avatar).toBe('assets/skins/Ali_avatar.webp');
    expect(ali?.status).toBe('active');
    expect(ali?.lateEntrant).toBe(true);
    expect(lia?.name).toBe('Lia');
    expect(next.twinShockResolution).toBe('mission_success');
    expect(next.twinShock?.pendingRevealAnimation).toMatchObject({
      type: 'ali_enters',
      replacedPlayerId: replacedId,
      incomingPlayerId: 'ali',
      incomingAvatar: 'assets/skins/Ali_avatar.webp',
    });
  });

  it('keeps Lia and Ali from nominating each other after the mission succeeds', () => {
    const base = makeTwinShockState({
      phase: 'nomination_results',
      lohId: 'lia',
      twinShockResolution: 'mission_success',
      players: [
        ...makeTwinShockState().players.map((player) => ({
          ...player,
          status: player.id === 'lia' || player.isUser ? 'active' as const : player.status,
        })),
        {
          id: 'ali',
          name: 'Ali',
          avatar: 'assets/skins/Ali_avatar.webp',
          status: 'active' as const,
          lateEntrant: true,
        },
      ],
    });

    const next = reduce(base, advance());

    expect(next.nomineeIds).not.toContain('ali');
  });

  it('forces a twin safety holder to save her nominated sister', () => {
    const base = makeTwinShockState({
      awaitingPovDecision: true,
      phase: 'pos_ceremony_results',
      posWinnerId: 'lia',
      lohId: 'user',
      nomineeIds: ['ali', 'zed'],
      twinShockResolution: 'mission_success',
      players: [
        ...makeTwinShockState().players.map((player) =>
          player.id === 'zed'
            ? { ...player, status: 'nominated' as const }
            : {
              ...player,
              status: player.id === 'lia' || player.isUser ? 'active' as const : player.status,
            },
        ),
        {
          id: 'ali',
          name: 'Ali',
          avatar: 'assets/skins/Ali_avatar.webp',
          status: 'nominated' as const,
          lateEntrant: true,
        },
      ],
    });

    let next = reduce(base, submitPovDecision(false));
    expect(next.awaitingPovSaveTarget).toBe(true);

    next = reduce(next, submitPovSaveTarget('zed'));
    expect(next.nomineeIds).toContain('ali');
    expect(next.nomineeIds).toContain('zed');

    next = reduce(next, submitPovSaveTarget('ali'));
    expect(next.nomineeIds).not.toContain('ali');
    expect(next.povSavedId).toBe('ali');
  });
});
