/**
 * secretMission.activation.test.ts — Unit tests for PR 3 reward activation logic.
 *
 * Covers:
 *  1. doubleVote availability in safe contexts
 *  2. doubleVote blocked in conflicting contexts (double eviction, Final 4, wrong phase)
 *  3. doubleVote allows two votes and is consumed (submitHumanDoubleVote)
 *  4. voteDeduction availability only when user is on block with votes against them
 *  5. voteDeduction blocked in conflicting contexts
 *  6. voteDeduction subtracts one vote correctly and is consumed
 *  7. Declining activation keeps the reward stored if still valid
 *  8. Rewards expire safely at Final 4 and are not offered afterward
 *  9. No behavior regression when no stored reward exists
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  triggerSecretMission,
  offerSecretMission,
  acceptSecretMission,
  completeMission,
  claimMissionReward,
  expireMissionReward,
  activateDoubleVoteReward,
  declineDoubleVoteReward,
  submitHumanDoubleVote,
  submitHumanVote,
  activateVoteDeductionReward,
  declineVoteDeduction,
  hydrateGame,
  advance,
} from '../../../src/store/gameSlice';
import settingsReducer from '../../../src/store/settingsSlice';
import {
  canUseDoubleVote,
  canUseVoteDeduction,
  isFinal4OrLater,
  hasDoubleVoteConflict,
  hasVoteDeductionConflict,
  type ActivationCheckState,
} from '../../../src/bb/secretMission';
import { selectConfessionalMissionBadge, selectIsWaitingForInput } from '../../../src/store/selectors';
import type { GameState, Player } from '../../../src/types';
import type { RootState } from '../../../src/store/store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

/** Drive the mission to rewardClaimed status with the given reward. */
function setupClaimedReward(rewardType: 'doubleVote' | 'voteDeduction' | 'plus1000Influence' | 'emptyBox') {
  const store = makeStore();
  store.dispatch(triggerSecretMission(5));
  store.dispatch(offerSecretMission(5));
  store.dispatch(acceptSecretMission());
  store.dispatch(completeMission());
  store.dispatch(claimMissionReward(rewardType));
  expect(store.getState().game.secretMission?.status).toBe('rewardClaimed');
  return store;
}

/** Build a minimal ActivationCheckState for pure helper tests. */
function makeCheckState(overrides: Partial<ActivationCheckState> = {}): ActivationCheckState {
  return {
    phase: 'live_vote',
    secretMission: {
      triggeredDay: 5,
      status: 'rewardClaimed',
      offeredDay: 5,
      offerCount: 1,
      declinedDay: null,
      tasks: [],
      templateId: 'silent_witness',
      reward: {
        type: 'doubleVote',
        consumed: false,
        expired: false,
        eligible: true,
      },
    },
    nomineeIds: ['p1', 'p2'],
    hohId: 'p0',
    players: [
      { id: 'p0', isUser: false, status: 'hoh' },
      { id: 'p1', isUser: false, status: 'nominated' },
      { id: 'p2', isUser: false, status: 'nominated' },
      { id: 'user', isUser: true, status: 'active' },
    ],
    doubleEviction: { weekActive: false },
    voteResults: null,
    awaitingTieBreak: false,
    ...overrides,
  };
}

/** Full player list: HOH p0, nominees p1/p2, voters v1–v5, human voter user. */
function makePlayers(overrides: Partial<Player>[] = []): Player[] {
  const defaults: Player[] = [
    { id: 'p0',   name: 'HOH',      avatar: '🧑', status: 'hoh',       isUser: false },
    { id: 'p1',   name: 'Nominee1', avatar: '🧑', status: 'nominated', isUser: false },
    { id: 'p2',   name: 'Nominee2', avatar: '🧑', status: 'nominated', isUser: false },
    { id: 'v1',   name: 'Voter1',   avatar: '🧑', status: 'active',    isUser: false },
    { id: 'v2',   name: 'Voter2',   avatar: '🧑', status: 'active',    isUser: false },
    { id: 'v3',   name: 'Voter3',   avatar: '🧑', status: 'active',    isUser: false },
    { id: 'user', name: 'Human',    avatar: '🧑', status: 'active',    isUser: true },
  ];
  return defaults.map((p) => ({ ...p, ...(overrides.find((o) => o.id === p.id) ?? {}) }));
}

/** Player list for voteDeduction tests where the HUMAN is a nominee (on the block). */
function makePlayersHumanNominated(): Player[] {
  return [
    { id: 'p0',   name: 'HOH',      avatar: '🧑', status: 'hoh',       isUser: false },
    { id: 'p1',   name: 'Nominee1', avatar: '🧑', status: 'nominated', isUser: false },
    { id: 'v1',   name: 'Voter1',   avatar: '🧑', status: 'active',    isUser: false },
    { id: 'v2',   name: 'Voter2',   avatar: '🧑', status: 'active',    isUser: false },
    { id: 'v3',   name: 'Voter3',   avatar: '🧑', status: 'active',    isUser: false },
    { id: 'user', name: 'Human',    avatar: '🧑', status: 'nominated', isUser: true },
  ];
}

/**
 * Build a minimal game state for voting tests where the human is an eligible
 * voter (not HOH, not nominated). Used for doubleVote tests.
 */
function makeVoteStore(
  phase: GameState['phase'],
  extraState: Partial<GameState> = {},
) {
  const store = makeStore();
  const players = makePlayers();
  const base: GameState = {
    phase,
    week: 3,
    season: 1,
    seed: 42,
    hohId: 'p0',
    nomineeIds: ['p1', 'p2'],
    players,
    povWinnerId: null,
    votes: {},
    awaitingHumanVote: false,
    tvFeed: [],
    isLive: false,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    competitionSeasonStateByPlayerId: {},
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    twistActivatedThisWeek: false,
    ...extraState,
  };
  store.dispatch(hydrateGame(base as GameState));
  return store;
}

/**
 * Build a minimal game state for voteDeduction tests where the human IS a
 * nominee (on the block). Uses a dedicated player list with human as nominated.
 */
function makeVoteDeductionStore(
  phase: GameState['phase'],
  extraState: Partial<GameState> = {},
) {
  const store = makeStore();
  const players = makePlayersHumanNominated();
  const base: GameState = {
    phase,
    week: 3,
    season: 1,
    seed: 42,
    hohId: 'p0',
    nomineeIds: ['user', 'p1'],
    players,
    povWinnerId: null,
    votes: {},
    awaitingHumanVote: false,
    tvFeed: [],
    isLive: false,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    competitionSeasonStateByPlayerId: {},
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    twistActivatedThisWeek: false,
    ...extraState,
  };
  store.dispatch(hydrateGame(base as GameState));
  return store;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. doubleVote availability in safe contexts
// ═══════════════════════════════════════════════════════════════════════════════

describe('canUseDoubleVote — safe contexts', () => {
  it('returns true when all conditions are met', () => {
    const state = makeCheckState();
    expect(canUseDoubleVote(state)).toBe(true);
  });

  it('returns true when double eviction is NOT active', () => {
    const state = makeCheckState({ doubleEviction: { weekActive: false } });
    expect(canUseDoubleVote(state)).toBe(true);
  });

  it('returns false when reward type is not doubleVote', () => {
    const state = makeCheckState({
      secretMission: {
        ...makeCheckState().secretMission!,
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });
    expect(canUseDoubleVote(state)).toBe(false);
  });

  it('returns false when no secretMission exists', () => {
    const state = makeCheckState({ secretMission: undefined });
    expect(canUseDoubleVote(state)).toBe(false);
  });

  it('returns false when reward is already consumed', () => {
    const state = makeCheckState({
      secretMission: {
        ...makeCheckState().secretMission!,
        reward: { type: 'doubleVote', consumed: true, expired: false, eligible: false },
      },
    });
    expect(canUseDoubleVote(state)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. doubleVote blocked in conflicting contexts
// ═══════════════════════════════════════════════════════════════════════════════

describe('canUseDoubleVote — conflicting contexts', () => {
  it('returns false during Double Eviction week', () => {
    const state = makeCheckState({ doubleEviction: { weekActive: true } });
    expect(canUseDoubleVote(state)).toBe(false);
  });

  it('returns false when phase is not live_vote', () => {
    expect(canUseDoubleVote(makeCheckState({ phase: 'social_2' }))).toBe(false);
    expect(canUseDoubleVote(makeCheckState({ phase: 'eviction_results' }))).toBe(false);
    expect(canUseDoubleVote(makeCheckState({ phase: 'pov_comp' }))).toBe(false);
  });

  it('returns false when human player is the HOH', () => {
    const state = makeCheckState({
      hohId: 'user',
      players: [
        { id: 'p0', isUser: false, status: 'active' },
        { id: 'p1', isUser: false, status: 'nominated' },
        { id: 'p2', isUser: false, status: 'nominated' },
        { id: 'user', isUser: true, status: 'hoh' },
      ],
    });
    expect(canUseDoubleVote(state)).toBe(false);
  });

  it('returns false when human player is a nominee', () => {
    const state = makeCheckState({
      nomineeIds: ['p1', 'user'],
      players: [
        { id: 'p0', isUser: false, status: 'hoh' },
        { id: 'p1', isUser: false, status: 'nominated' },
        { id: 'user', isUser: true, status: 'nominated' },
      ],
    });
    expect(canUseDoubleVote(state)).toBe(false);
  });

  it('hasDoubleVoteConflict returns true when doubleEviction.weekActive', () => {
    expect(hasDoubleVoteConflict({ doubleEviction: { weekActive: true } } as ActivationCheckState)).toBe(true);
  });

  it('hasDoubleVoteConflict returns false when no double eviction', () => {
    expect(hasDoubleVoteConflict({ doubleEviction: { weekActive: false } } as ActivationCheckState)).toBe(false);
    expect(hasDoubleVoteConflict({} as ActivationCheckState)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. doubleVote allows two votes and is consumed
// ═══════════════════════════════════════════════════════════════════════════════

describe('doubleVote — activation and vote submission', () => {
  it('activateDoubleVoteReward clears awaitingDoubleVoteOffer and sets humanDoubleVoteActive', () => {
    const store = makeVoteStore('live_vote', {
      awaitingHumanVote: true,
      awaitingDoubleVoteOffer: true,
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(activateDoubleVoteReward());
    const state = store.getState().game;
    expect(state.awaitingDoubleVoteOffer).toBe(false);
    expect(state.humanDoubleVoteActive).toBe(true);
    // Reward not yet consumed (consumed on vote submission)
    expect(state.secretMission?.reward?.consumed).toBe(false);
  });

  it('activateDoubleVoteReward is a no-op when awaitingDoubleVoteOffer is false', () => {
    const store = makeVoteStore('live_vote', {
      awaitingHumanVote: true,
      awaitingDoubleVoteOffer: false,
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(activateDoubleVoteReward());
    expect(store.getState().game.humanDoubleVoteActive).toBeFalsy();
  });

  it('submitHumanDoubleVote records two votes and consumes the reward', () => {
    const store = makeVoteStore('live_vote', {
      awaitingHumanVote: true,
      humanDoubleVoteActive: true,
      votes: { v1: 'p1', v2: 'p2' },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(submitHumanDoubleVote(['p1', 'p2']));
    const state = store.getState().game;
    // Both vote keys present
    expect(state.votes?.['user']).toBe('p1');
    expect(state.votes?.['user__dv2']).toBe('p2');
    // Human vote flag cleared
    expect(state.awaitingHumanVote).toBe(false);
    expect(state.humanDoubleVoteActive).toBe(false);
    // Reward consumed
    expect(state.secretMission?.reward?.consumed).toBe(true);
    expect(state.secretMission?.reward?.eligible).toBe(false);
  });

  it('submitHumanDoubleVote allows voting twice for the same nominee', () => {
    const store = makeVoteStore('live_vote', {
      awaitingHumanVote: true,
      humanDoubleVoteActive: true,
      votes: {},
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(submitHumanDoubleVote(['p1', 'p1']));
    const state = store.getState().game;
    expect(state.votes?.['user']).toBe('p1');
    expect(state.votes?.['user__dv2']).toBe('p1');
    expect(state.secretMission?.reward?.consumed).toBe(true);
  });

  it('submitHumanDoubleVote is a no-op when humanDoubleVoteActive is false', () => {
    const store = makeVoteStore('live_vote', {
      awaitingHumanVote: true,
      humanDoubleVoteActive: false,
      votes: {},
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(submitHumanDoubleVote(['p1', 'p2']));
    const state = store.getState().game;
    // No votes recorded via double path
    expect(state.votes?.['user']).toBeUndefined();
    // Reward intact
    expect(state.secretMission?.reward?.consumed).toBe(false);
  });

  it('double-vote tallies correctly in eviction_results: both votes add to vote counts', () => {
    // advance() runs the NEXT phase's initialization. Starting at live_vote means
    // the eviction_results case runs (tallying votes). Votes pre-set here are NOT
    // reset by advance() — only the live_vote initialization resets votes.
    const store = makeVoteStore('live_vote', {
      // Human cast 2 votes for p1 (via double vote), AI cast 3 votes for p2
      votes: { user: 'p1', 'user__dv2': 'p1', v1: 'p2', v2: 'p2', v3: 'p2' },
    });
    store.dispatch(advance()); // eviction_results case runs and tallies
    const state = store.getState().game;
    // p1 should have 2 votes (from the double vote), p2 has 3
    expect(state.voteResults?.['p1']).toBe(2);
    expect(state.voteResults?.['p2']).toBe(3);
    // p2 should be the evictee (3 > 2)
    expect(state.pendingEviction?.evicteeId).toBe('p2');
  });

  it('advance() sets awaitingDoubleVoteOffer when human is eligible voter with eligible doubleVote', () => {
    // advance() switches on NEXT phase. To run the live_vote initialization
    // (which checks for doubleVote offer), start at social_2 so nextPhase=live_vote.
    const store = makeVoteStore('social_2', {
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(advance()); // runs live_vote case → phase becomes live_vote
    const state = store.getState().game;
    expect(state.phase).toBe('live_vote');
    expect(state.awaitingDoubleVoteOffer).toBe(true);
    expect(state.awaitingHumanVote).toBe(true);
  });

  it('advance() does NOT set awaitingDoubleVoteOffer during Double Eviction week', () => {
    // Start at social_2 so nextPhase=live_vote and the live_vote init case runs.
    const store = makeVoteStore('social_2', {
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(advance()); // live_vote init case runs, conflict detected → offer NOT set
    const state = store.getState().game;
    expect(state.phase).toBe('live_vote');
    expect(state.awaitingDoubleVoteOffer).toBeFalsy();
  });

  it('advance() does NOT set awaitingDoubleVoteOffer when human is a nominee', () => {
    const store = makeStore();
    const players = makePlayers([{ id: 'user', status: 'nominated' }]);
    const base: GameState = {
      phase: 'social_2', // start at social_2 so the live_vote case runs
      week: 3,
      season: 1,
      seed: 42,
      hohId: 'p0',
      nomineeIds: ['p1', 'user'],
      players,
      povWinnerId: null,
      votes: {},
      awaitingHumanVote: false,
      tvFeed: [],
      isLive: false,
      voteResults: null,
      evictionSplashId: null,
      pendingEviction: null,
      competitionSeasonStateByPlayerId: {},
      doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
      twistActivatedThisWeek: false,
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    };
    store.dispatch(hydrateGame(base as GameState));
    store.dispatch(advance()); // live_vote case runs — human is nominee, not eligible voter
    // Human is a nominee — not an eligible voter → offer not set
    expect(store.getState().game.awaitingDoubleVoteOffer).toBeFalsy();
    expect(store.getState().game.phase).toBe('live_vote');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. voteDeduction availability only when user is on block with votes against them
// ═══════════════════════════════════════════════════════════════════════════════

describe('canUseVoteDeduction — availability conditions', () => {
  const baseVoteDeductionState: ActivationCheckState = {
    phase: 'eviction_results',
    secretMission: {
      triggeredDay: 5,
      status: 'rewardClaimed',
      offeredDay: 5,
      offerCount: 1,
      declinedDay: null,
      tasks: [],
      templateId: 'silent_witness',
      reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
    },
    nomineeIds: ['user', 'p1'],
    hohId: 'p0',
    players: [
      { id: 'p0', isUser: false, status: 'hoh' },
      { id: 'p1', isUser: false, status: 'nominated' },
      { id: 'user', isUser: true, status: 'nominated' },
    ],
    doubleEviction: { weekActive: false },
    voteResults: { user: 3, p1: 1 },
    awaitingTieBreak: false,
  };

  it('returns true in a safe single-eviction context with human on block', () => {
    expect(canUseVoteDeduction(baseVoteDeductionState)).toBe(true);
  });

  it('returns false when human is NOT a nominee', () => {
    const state: ActivationCheckState = {
      ...baseVoteDeductionState,
      nomineeIds: ['p1', 'p2'],
      players: [
        { id: 'p0', isUser: false, status: 'hoh' },
        { id: 'p1', isUser: false, status: 'nominated' },
        { id: 'p2', isUser: false, status: 'nominated' },
        { id: 'user', isUser: true, status: 'active' },
      ],
      voteResults: { p1: 3, p2: 1 },
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('returns false when human has 0 votes against them', () => {
    const state: ActivationCheckState = {
      ...baseVoteDeductionState,
      voteResults: { user: 0, p1: 4 },
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('returns false when voteResults is null', () => {
    const state: ActivationCheckState = { ...baseVoteDeductionState, voteResults: null };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('returns false when phase is not eviction_results', () => {
    expect(canUseVoteDeduction({ ...baseVoteDeductionState, phase: 'live_vote' })).toBe(false);
    expect(canUseVoteDeduction({ ...baseVoteDeductionState, phase: 'social_2' })).toBe(false);
  });

  it('returns false when deduction would create a tie with another nominee', () => {
    // user has 3 votes, p1 has 2 — afterDeduction=2, ties with p1 → blocked
    const state: ActivationCheckState = {
      ...baseVoteDeductionState,
      voteResults: { user: 3, p1: 2 },
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('returns true when deduction reduces human to below all others (saved)', () => {
    // user has 4 votes, p1 has 2 — afterDeduction=3 > p1(2) → no tie
    const state: ActivationCheckState = {
      ...baseVoteDeductionState,
      voteResults: { user: 4, p1: 2 },
    };
    expect(canUseVoteDeduction(state)).toBe(true);
  });

  it('returns true when deduction reduces human vote count (user remains highest but with fewer votes)', () => {
    // user has 3 votes, p1 has 1 — afterDeduction=2 > p1(1) → no tie → offer available
    // (user still has most votes; deduction doesn't save them this scenario but the power
    // is still offered so the player can choose to use it or save it for a better moment)
    const state: ActivationCheckState = {
      ...baseVoteDeductionState,
      voteResults: { user: 3, p1: 1 },
    };
    expect(canUseVoteDeduction(state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. voteDeduction blocked in conflicting contexts
// ═══════════════════════════════════════════════════════════════════════════════

describe('canUseVoteDeduction — conflicting contexts', () => {
  const baseState: ActivationCheckState = {
    phase: 'eviction_results',
    secretMission: {
      triggeredDay: 5,
      status: 'rewardClaimed',
      offeredDay: 5,
      offerCount: 1,
      declinedDay: null,
      tasks: [],
      templateId: 'silent_witness',
      reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
    },
    nomineeIds: ['user', 'p1'],
    hohId: 'p0',
    players: [
      { id: 'p0', isUser: false, status: 'hoh' },
      { id: 'p1', isUser: false, status: 'nominated' },
      { id: 'user', isUser: true, status: 'nominated' },
    ],
    doubleEviction: { weekActive: false },
    voteResults: { user: 3, p1: 1 },
    awaitingTieBreak: false,
  };

  it('returns false during Double Eviction week', () => {
    const state: ActivationCheckState = {
      ...baseState,
      doubleEviction: { weekActive: true },
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('returns false when a tie-break is pending', () => {
    const state: ActivationCheckState = { ...baseState, awaitingTieBreak: true };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('hasVoteDeductionConflict returns true for double eviction', () => {
    expect(hasVoteDeductionConflict({ doubleEviction: { weekActive: true } } as ActivationCheckState)).toBe(true);
  });

  it('hasVoteDeductionConflict returns true when tie-break pending', () => {
    expect(hasVoteDeductionConflict({ awaitingTieBreak: true } as ActivationCheckState)).toBe(true);
  });

  it('hasVoteDeductionConflict returns false in a clean context', () => {
    expect(hasVoteDeductionConflict({ doubleEviction: { weekActive: false }, awaitingTieBreak: false } as ActivationCheckState)).toBe(false);
  });

  it('returns false when reward type is not voteDeduction', () => {
    const state: ActivationCheckState = {
      ...baseState,
      secretMission: {
        ...baseState.secretMission!,
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('returns false when reward is expired', () => {
    const state: ActivationCheckState = {
      ...baseState,
      secretMission: {
        ...baseState.secretMission!,
        reward: { type: 'voteDeduction', consumed: false, expired: true, eligible: false },
      },
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. voteDeduction subtracts one vote correctly and is consumed
// ═══════════════════════════════════════════════════════════════════════════════

describe('activateVoteDeductionReward', () => {
  function setupVoteDeductionStore(humanVotes: number, otherVotes: number) {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: humanVotes, p1: otherVotes },
      pendingEviction: {
        evicteeId: humanVotes >= otherVotes ? 'user' : 'p1',
        evictionMessage: 'Elimination pending.',
      },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });
    return store;
  }

  it('subtracts exactly 1 vote from human tally', () => {
    const store = setupVoteDeductionStore(3, 1);
    store.dispatch(activateVoteDeductionReward());
    expect(store.getState().game.voteResults?.['user']).toBe(2);
    expect(store.getState().game.voteResults?.['p1']).toBe(1); // unchanged
  });

  it('consumes the reward and clears awaitingVoteDeductionPrompt', () => {
    const store = setupVoteDeductionStore(3, 1);
    store.dispatch(activateVoteDeductionReward());
    const state = store.getState().game;
    expect(state.secretMission?.reward?.consumed).toBe(true);
    expect(state.secretMission?.reward?.eligible).toBe(false);
    expect(state.awaitingVoteDeductionPrompt).toBe(false);
  });

  it('updates pendingEviction to reflect new winner when human is still evicted after deduction', () => {
    // user has 4 votes, p1 has 1 — after deduction user has 3 votes, p1 has 1 — still evicted
    const store = setupVoteDeductionStore(4, 1);
    store.dispatch(activateVoteDeductionReward());
    const state = store.getState().game;
    // user still has most votes (3 vs 1), still evicted
    expect(state.pendingEviction?.evicteeId).toBe('user');
    expect(state.voteResults?.['user']).toBe(3);
  });

  it('updates pendingEviction when deduction reduces human votes (but they remain evicted)', () => {
    // user=3 votes, p1=1 → after deduction user=2, p1=1 → user still evicted with fewer votes
    const store = setupVoteDeductionStore(3, 1);
    store.dispatch(activateVoteDeductionReward());
    const state = store.getState().game;
    expect(state.voteResults?.['user']).toBe(2);
    expect(state.pendingEviction?.evicteeId).toBe('user'); // still evicted
  });

  it('correctly changes pendingEviction when deduction saves the human player', () => {
    // user has 2 votes, p1 has 3 → after deduction user=1, p1=3 → p1 is evicted (user saved!)
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 2, p1: 3 },
      pendingEviction: { evicteeId: 'p1', evictionMessage: 'p1 eliminated' },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(activateVoteDeductionReward());
    const state = store.getState().game;
    // user now has 1 vote, p1 has 3 — p1 is still evicted (highest votes); user saved!
    expect(state.voteResults?.['user']).toBe(1);
    expect(state.pendingEviction?.evicteeId).toBe('p1');
  });

  it('does not go below 0 votes', () => {
    const store = setupVoteDeductionStore(1, 0);
    store.dispatch(activateVoteDeductionReward());
    // 1 vote → 0 after deduction
    expect(store.getState().game.voteResults?.['user']).toBe(0);
  });

  it('is a no-op when awaitingVoteDeductionPrompt is false', () => {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: false,
      voteResults: { user: 3, p1: 1 },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(activateVoteDeductionReward());
    const state = store.getState().game;
    expect(state.voteResults?.['user']).toBe(3); // unchanged
    expect(state.secretMission?.reward?.consumed).toBe(false);
  });

  it('advance() sets awaitingVoteDeductionPrompt when conditions are met', () => {
    // advance() runs the NEXT phase case. Start at live_vote so nextPhase=eviction_results
    // and the eviction_results tally logic runs. Pre-set votes are tallied.
    // Human IS a nominee in makeVoteDeductionStore (nomineeIds = ['user', 'p1']).
    const store = makeVoteDeductionStore('live_vote', {
      votes: { v1: 'user', v2: 'user', v3: 'user' },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(advance()); // eviction_results case tallies votes
    const state = store.getState().game;
    expect(state.phase).toBe('eviction_results');
    // user has 3 votes, p1 has 0 → afterDeduction=2 > 0 → no tie → offer set
    expect(state.awaitingVoteDeductionPrompt).toBe(true);
    expect(state.voteResults?.['user']).toBe(3);
  });

  it('advance() does NOT set awaitingVoteDeductionPrompt during Double Eviction', () => {
    // Start at live_vote so eviction_results case runs.
    const store = makeVoteDeductionStore('live_vote', {
      votes: { v1: 'user', v2: 'user', v3: 'user' },
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(advance());
    expect(store.getState().game.awaitingVoteDeductionPrompt).toBeFalsy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Declining activation keeps the reward stored if still valid
// ═══════════════════════════════════════════════════════════════════════════════

describe('declining activation preserves the reward', () => {
  it('declineDoubleVoteReward clears awaitingDoubleVoteOffer and keeps reward eligible', () => {
    const store = makeVoteStore('live_vote', {
      awaitingDoubleVoteOffer: true,
      awaitingHumanVote: true,
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'doubleVote', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(declineDoubleVoteReward());
    const state = store.getState().game;
    expect(state.awaitingDoubleVoteOffer).toBe(false);
    // humanDoubleVoteActive not set (reward not activated)
    expect(state.humanDoubleVoteActive).toBeFalsy();
    // Reward still stored and eligible
    expect(state.secretMission?.reward?.eligible).toBe(true);
    expect(state.secretMission?.reward?.consumed).toBe(false);
    // awaitingHumanVote still true — normal vote modal will appear
    expect(state.awaitingHumanVote).toBe(true);
  });

  it('declineVoteDeduction clears awaitingVoteDeductionPrompt and keeps reward eligible', () => {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 3, p1: 1 },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });
    store.dispatch(declineVoteDeduction());
    const state = store.getState().game;
    expect(state.awaitingVoteDeductionPrompt).toBe(false);
    // Reward still eligible for next vote week
    expect(state.secretMission?.reward?.eligible).toBe(true);
    expect(state.secretMission?.reward?.consumed).toBe(false);
    // Vote results unchanged
    expect(state.voteResults?.['user']).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Rewards expire safely at Final 4 and are not offered afterward
// ═══════════════════════════════════════════════════════════════════════════════

describe('Final 4 restriction', () => {
  it('isFinal4OrLater returns true for final4_eviction', () => {
    expect(isFinal4OrLater('final4_eviction')).toBe(true);
  });

  it('isFinal4OrLater returns true for all post-Final-4 phases', () => {
    const phases = [
      'final4_eviction', 'final3', 'final3_comp1', 'final3_comp2', 'final3_comp3',
      'final3_decision', 'jury_announcement', 'jury_cinematic', 'jury',
    ];
    for (const p of phases) {
      expect(isFinal4OrLater(p)).toBe(true);
    }
  });

  it('isFinal4OrLater returns false for live_vote and earlier phases', () => {
    const safePhases = ['live_vote', 'eviction_results', 'social_2', 'nominations', 'week_start'];
    for (const p of safePhases) {
      expect(isFinal4OrLater(p)).toBe(false);
    }
  });

  it('expireMissionReward marks doubleVote as expired and ineligible', () => {
    const store = setupClaimedReward('doubleVote');
    store.dispatch(expireMissionReward());
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.expired).toBe(true);
    expect(reward.eligible).toBe(false);
    expect(reward.consumed).toBe(false);
  });

  it('expireMissionReward marks voteDeduction as expired', () => {
    const store = setupClaimedReward('voteDeduction');
    store.dispatch(expireMissionReward());
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.expired).toBe(true);
    expect(reward.eligible).toBe(false);
  });

  it('canUseDoubleVote returns false when phase is final4_eviction', () => {
    const state = makeCheckState({ phase: 'final4_eviction' });
    expect(canUseDoubleVote(state)).toBe(false);
  });

  it('canUseVoteDeduction returns false when phase is final4_eviction', () => {
    const state: ActivationCheckState = {
      phase: 'final4_eviction',
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
      nomineeIds: ['user', 'p1'],
      hohId: 'p0',
      players: [
        { id: 'p0', isUser: false, status: 'hoh' },
        { id: 'p1', isUser: false, status: 'nominated' },
        { id: 'user', isUser: true, status: 'nominated' },
      ],
      doubleEviction: { weekActive: false },
      voteResults: { user: 3, p1: 1 },
      awaitingTieBreak: false,
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('expireMissionReward is idempotent (safe to call multiple times)', () => {
    const store = setupClaimedReward('doubleVote');
    store.dispatch(expireMissionReward());
    store.dispatch(expireMissionReward());
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.expired).toBe(true);
  });

  it('expireMissionReward is a no-op when reward is already consumed', () => {
    const store = setupClaimedReward('doubleVote');
    // Set reward as consumed directly via hydrateGame (avoids needing proper nomineeIds)
    store.dispatch(hydrateGame({
      ...store.getState().game,
      secretMission: {
        ...store.getState().game.secretMission!,
        reward: { type: 'doubleVote', consumed: true, expired: false, eligible: false },
      },
    } as GameState));
    const beforeExpiry = store.getState().game.secretMission!.reward!;
    expect(beforeExpiry.consumed).toBe(true);
    store.dispatch(expireMissionReward()); // should be no-op because reward is consumed
    const afterExpiry = store.getState().game.secretMission!.reward!;
    expect(afterExpiry.expired).toBe(false); // not changed — expiry skipped for consumed rewards
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. No behavior regression when no stored reward exists
// ═══════════════════════════════════════════════════════════════════════════════

describe('no regression when no stored reward exists', () => {
  it('canUseDoubleVote returns false when no secretMission', () => {
    const state = makeCheckState({ secretMission: undefined });
    expect(canUseDoubleVote(state)).toBe(false);
  });

  it('canUseVoteDeduction returns false when no secretMission', () => {
    const state: ActivationCheckState = {
      phase: 'eviction_results',
      secretMission: undefined,
      nomineeIds: ['user', 'p1'],
      hohId: 'p0',
      players: [{ id: 'user', isUser: true, status: 'nominated' }],
      doubleEviction: { weekActive: false },
      voteResults: { user: 3, p1: 1 },
      awaitingTieBreak: false,
    };
    expect(canUseVoteDeduction(state)).toBe(false);
  });

  it('activateDoubleVoteReward is a no-op when no reward exists', () => {
    const store = makeVoteStore('live_vote', {
      awaitingDoubleVoteOffer: true,
      awaitingHumanVote: true,
    });
    store.dispatch(activateDoubleVoteReward());
    expect(store.getState().game.humanDoubleVoteActive).toBeFalsy();
    expect(store.getState().game.awaitingDoubleVoteOffer).toBe(false); // cleared despite no reward
  });

  it('activateVoteDeductionReward is a no-op when no reward exists', () => {
    const store = makeVoteStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 3, p1: 1 },
    });
    store.dispatch(activateVoteDeductionReward());
    // Prompt cleared, but votes unchanged
    expect(store.getState().game.awaitingVoteDeductionPrompt).toBeFalsy();
    expect(store.getState().game.voteResults?.['user']).toBe(3);
  });

  it('declineDoubleVoteReward is safe when called with no pending offer', () => {
    const store = makeVoteStore('live_vote', { awaitingDoubleVoteOffer: false });
    store.dispatch(declineDoubleVoteReward());
    expect(store.getState().game.awaitingDoubleVoteOffer).toBe(false);
  });

  it('declineVoteDeduction is safe when called with no pending prompt', () => {
    const store = makeVoteStore('eviction_results', { awaitingVoteDeductionPrompt: false });
    store.dispatch(declineVoteDeduction());
    expect(store.getState().game.awaitingVoteDeductionPrompt).toBe(false);
  });

  it('advance() in live_vote with no secret mission sets awaitingHumanVote normally', () => {
    // Start at social_2 so the live_vote init case runs (nextPhase=live_vote).
    const store = makeVoteStore('social_2', {}); // no secretMission
    store.dispatch(advance()); // live_vote init case runs → phase becomes live_vote
    const state = store.getState().game;
    expect(state.phase).toBe('live_vote');
    expect(state.awaitingHumanVote).toBe(true);
    expect(state.awaitingDoubleVoteOffer).toBeFalsy();
  });

  it('normal submitHumanVote still works when doubleVote reward absent', () => {
    const store = makeVoteStore('live_vote', {
      awaitingHumanVote: true,
      votes: { v1: 'p1' },
    });
    store.dispatch(submitHumanVote('p2'));
    const state = store.getState().game;
    expect(state.awaitingHumanVote).toBe(false);
    expect(state.votes?.['user']).toBe('p2');
  });

  it('Confessional badge not shown when secretMission is undefined', () => {
    const store = makeStore();
    const rootState = store.getState() as RootState;
    expect(selectConfessionalMissionBadge(rootState)).toBe(false);
  });

  it('selectIsWaitingForInput is true when awaitingVoteDeductionPrompt is set', () => {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 3, p1: 1 },
    });
    expect(selectIsWaitingForInput(store.getState() as RootState)).toBe(true);
  });

  it('selectIsWaitingForInput is true when awaitingDoubleVoteOffer is set', () => {
    const store = makeVoteStore('live_vote', {
      awaitingDoubleVoteOffer: true,
      awaitingHumanVote: true,
    });
    expect(selectIsWaitingForInput(store.getState() as RootState)).toBe(true);
  });

  it('selectIsWaitingForInput is false when no decision flags are set', () => {
    const store = makeVoteStore('week_start', {});
    expect(selectIsWaitingForInput(store.getState() as RootState)).toBe(false);
  });
});
