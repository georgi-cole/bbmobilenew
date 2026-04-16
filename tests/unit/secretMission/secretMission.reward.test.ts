/**
 * secretMission.reward.test.ts — Unit tests for the PR 2 reward layer.
 *
 * Covers:
 *  1. rewardPending → box-selection flow (claimMissionReward reducer)
 *  2. Exactly 4 mystery box choices in MYSTERY_BOX_POOL
 *  3. Reward assignment persists correctly in state
 *  4. Empty box grants no power (eligible = false)
 *  5. plus1000Influence reward marks eligible = true (influence applied by caller)
 *  6. Stored vote-related rewards persist correctly for future use
 *  7. Rewards expire / become unusable at Final 4 (expireMissionReward reducer)
 *  8. Turkish blue badge selector for reward states
 *  9. claimMissionReward is a no-op when not in rewardPending
 * 10. expireMissionReward is a no-op when reward is already consumed
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
  hydrateGame,
} from '../../../src/store/gameSlice';
import settingsReducer from '../../../src/store/settingsSlice';
import {
  MYSTERY_BOX_POOL,
  SECRET_MISSION_BOX_REWARDS,
  createMissionReward,
  type MissionRewardType,
} from '../../../src/bb/secretMission';
import { selectConfessionalMissionBadge } from '../../../src/store/selectors';
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

/** Drive the mission to rewardPending status. */
function setupRewardPending() {
  const store = makeStore();
  store.dispatch(triggerSecretMission(5));
  store.dispatch(offerSecretMission(5));
  store.dispatch(acceptSecretMission());
  store.dispatch(completeMission());
  expect(store.getState().game.secretMission?.status).toBe('rewardPending');
  return store;
}

// ── 1 & 2. rewardPending → box-selection + pool size ─────────────────────────

describe('MYSTERY_BOX_POOL', () => {
  it('contains exactly 4 outcomes', () => {
    expect(MYSTERY_BOX_POOL).toHaveLength(4);
  });

  it('contains plus1000Influence, doubleVote, voteDeduction, and emptyBox', () => {
    expect(MYSTERY_BOX_POOL).toContain('plus1000Influence');
    expect(MYSTERY_BOX_POOL).toContain('doubleVote');
    expect(MYSTERY_BOX_POOL).toContain('voteDeduction');
    expect(MYSTERY_BOX_POOL).toContain('emptyBox');
  });

  it('has no duplicates', () => {
    const unique = new Set(MYSTERY_BOX_POOL);
    expect(unique.size).toBe(MYSTERY_BOX_POOL.length);
  });
});

describe('SECRET_MISSION_BOX_REWARDS', () => {
  it('contains the 4 live reward-box outcomes with immunity replacing emptyBox', () => {
    expect(SECRET_MISSION_BOX_REWARDS).toEqual([
      'plus1000Influence',
      'doubleVote',
      'voteDeduction',
      'immunity',
    ]);
  });
});

describe('claimMissionReward — rewardPending → rewardClaimed', () => {
  const allOutcomes: MissionRewardType[] = ['plus1000Influence', 'doubleVote', 'voteDeduction', 'emptyBox'];

  for (const outcome of allOutcomes) {
    it(`transitions to rewardClaimed when claiming "${outcome}"`, () => {
      const store = setupRewardPending();
      store.dispatch(claimMissionReward(outcome));
      const sm = store.getState().game.secretMission!;
      expect(sm.status).toBe('rewardClaimed');
    });
  }
});

// ── 3. Reward assignment persists correctly ───────────────────────────────────

describe('claimMissionReward — reward storage', () => {
  it('stores the claimed reward type in secretMission.reward', () => {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward('doubleVote'));
    const reward = store.getState().game.secretMission!.reward;
    expect(reward).toBeDefined();
    expect(reward!.type).toBe('doubleVote');
  });

  it('reward starts as not consumed and not expired', () => {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward('voteDeduction'));
    const reward = store.getState().game.secretMission!.reward;
    expect(reward!.consumed).toBe(false);
    expect(reward!.expired).toBe(false);
  });

  it('reward is persisted in Redux state after claim', () => {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward('plus1000Influence'));
    const sm1 = store.getState().game.secretMission!;
    // Re-read same store reference — data must persist
    const sm2 = store.getState().game.secretMission!;
    expect(sm1.reward).toEqual(sm2.reward);
  });
});

// ── 4. Empty box grants no power ──────────────────────────────────────────────

describe('emptyBox outcome', () => {
  it('eligible is false for emptyBox', () => {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward('emptyBox'));
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.eligible).toBe(false);
  });

  it('createMissionReward emptyBox is not eligible', () => {
    const r = createMissionReward('emptyBox');
    expect(r.eligible).toBe(false);
    expect(r.type).toBe('emptyBox');
    expect(r.consumed).toBe(false);
    expect(r.expired).toBe(false);
  });

  it('emptyBox does not affect other mission state fields', () => {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward('emptyBox'));
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('rewardClaimed');
    expect(sm.tasks.every((t) => t.completed)).toBe(true);
  });
});

// ── 5. plus1000Influence grants eligible = true ──────────────────────────────

describe('plus1000Influence reward', () => {
  it('eligible is true for plus1000Influence', () => {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward('plus1000Influence'));
    expect(store.getState().game.secretMission!.reward!.eligible).toBe(true);
  });

  it('createMissionReward plus1000Influence is eligible', () => {
    const r = createMissionReward('plus1000Influence');
    expect(r.eligible).toBe(true);
    expect(r.type).toBe('plus1000Influence');
  });
});

// ── 6. Vote-related rewards persist correctly for future use ─────────────────

describe('doubleVote and voteDeduction — stored only, not activated', () => {
  const voteRewards: MissionRewardType[] = ['doubleVote', 'voteDeduction'];

  for (const rewardType of voteRewards) {
    describe(`${rewardType}`, () => {
      it('is stored with eligible = true', () => {
        const store = setupRewardPending();
        store.dispatch(claimMissionReward(rewardType));
        const reward = store.getState().game.secretMission!.reward!;
        expect(reward.type).toBe(rewardType);
        expect(reward.eligible).toBe(true);
      });

      it('is not consumed', () => {
        const store = setupRewardPending();
        store.dispatch(claimMissionReward(rewardType));
        expect(store.getState().game.secretMission!.reward!.consumed).toBe(false);
      });

      it('is not expired', () => {
        const store = setupRewardPending();
        store.dispatch(claimMissionReward(rewardType));
        expect(store.getState().game.secretMission!.reward!.expired).toBe(false);
      });
    });
  }
});

// ── 7. Final 4 expiry ─────────────────────────────────────────────────────────

describe('expireMissionReward — Final 4 restriction', () => {
  function setupClaimedReward(rewardType: MissionRewardType) {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward(rewardType));
    return store;
  }

  it('marks eligible reward as expired when Final 4 is reached', () => {
    const store = setupClaimedReward('doubleVote');
    store.dispatch(expireMissionReward());
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.expired).toBe(true);
    expect(reward.eligible).toBe(false);
  });

  it('marks voteDeduction as expired at Final 4', () => {
    const store = setupClaimedReward('voteDeduction');
    store.dispatch(expireMissionReward());
    expect(store.getState().game.secretMission!.reward!.expired).toBe(true);
  });

  it('marks plus1000Influence as expired at Final 4 (already applied, but eligible flag updated)', () => {
    const store = setupClaimedReward('plus1000Influence');
    store.dispatch(expireMissionReward());
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.expired).toBe(true);
    expect(reward.eligible).toBe(false);
  });

  it('is a no-op when no mission exists', () => {
    const store = makeStore();
    // Should not throw
    store.dispatch(expireMissionReward());
    expect(store.getState().game.secretMission).toBeUndefined();
  });

  it('is a no-op when mission has no reward yet (rewardPending)', () => {
    const store = setupRewardPending();
    store.dispatch(expireMissionReward());
    // reward is still undefined, no crash
    expect(store.getState().game.secretMission!.reward).toBeUndefined();
    expect(store.getState().game.secretMission!.status).toBe('rewardPending');
  });

  it('is idempotent (calling twice does not change result)', () => {
    const store = setupClaimedReward('doubleVote');
    store.dispatch(expireMissionReward());
    store.dispatch(expireMissionReward());
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.expired).toBe(true);
    expect(reward.eligible).toBe(false);
  });

  it('does NOT expire a reward that is already consumed', () => {
    // Set up a consumed reward via hydrateGame (consumed = true, expired = false)
    const store = makeStore();
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
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
            consumed: true,
            expired: false,
            eligible: false,
          },
        },
      }),
    );
    store.dispatch(expireMissionReward());
    // consumed already true — expired should remain false (reducer guards on consumed)
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.consumed).toBe(true);
    expect(reward.expired).toBe(false);
  });

  it('does NOT expire an emptyBox reward (ineligible)', () => {
    const store = setupClaimedReward('emptyBox');
    store.dispatch(expireMissionReward());
    // emptyBox is not eligible so the guard skips it — expired stays false
    const reward = store.getState().game.secretMission!.reward!;
    expect(reward.expired).toBe(false);
    expect(reward.eligible).toBe(false);
  });
});

// ── 8. Turkish blue badge selector ───────────────────────────────────────────

describe('selectConfessionalMissionBadge — reward states', () => {
  function stateWith(
    missionPartial: Partial<import('../../../src/bb/secretMission').SecretMissionState>,
  ): RootState {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    const baseState = store.getState() as RootState;
    return {
      ...baseState,
      game: {
        ...baseState.game,
        secretMission: { ...baseState.game.secretMission!, ...missionPartial },
      },
    } as RootState;
  }

  it('returns true when status is rewardPending', () => {
    expect(selectConfessionalMissionBadge(stateWith({ status: 'rewardPending' }))).toBe(true);
  });

  it('returns true when status is rewardClaimed and reward is eligible', () => {
    const s = stateWith({
      status: 'rewardClaimed',
      reward: createMissionReward('doubleVote'),
    });
    expect(selectConfessionalMissionBadge(s)).toBe(true);
  });

  it('returns false when status is rewardClaimed and reward is emptyBox (not eligible)', () => {
    const s = stateWith({
      status: 'rewardClaimed',
      reward: createMissionReward('emptyBox'),
    });
    expect(selectConfessionalMissionBadge(s)).toBe(false);
  });

  it('returns false when status is rewardClaimed and reward is expired', () => {
    const s = stateWith({
      status: 'rewardClaimed',
      reward: { type: 'doubleVote', consumed: false, expired: true, eligible: false },
    });
    expect(selectConfessionalMissionBadge(s)).toBe(false);
  });

  it('returns false when status is rewardClaimed and reward is consumed', () => {
    const s = stateWith({
      status: 'rewardClaimed',
      reward: { type: 'doubleVote', consumed: true, expired: false, eligible: false },
    });
    expect(selectConfessionalMissionBadge(s)).toBe(false);
  });
});

// ── 9. claimMissionReward no-op guards ───────────────────────────────────────

describe('claimMissionReward — no-op guards', () => {
  it('is a no-op when no mission exists', () => {
    const store = makeStore();
    store.dispatch(claimMissionReward('doubleVote'));
    expect(store.getState().game.secretMission).toBeUndefined();
  });

  it('is a no-op when status is accepted (not rewardPending)', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    store.dispatch(claimMissionReward('doubleVote'));
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('accepted');
    expect(sm.reward).toBeUndefined();
  });

  it('is a no-op when status is already rewardClaimed', () => {
    const store = setupRewardPending();
    store.dispatch(claimMissionReward('doubleVote'));
    const rewardBefore = store.getState().game.secretMission!.reward;
    store.dispatch(claimMissionReward('emptyBox')); // attempt second claim
    const rewardAfter = store.getState().game.secretMission!.reward;
    expect(rewardAfter).toEqual(rewardBefore); // unchanged
  });
});

// ── 10. createMissionReward helper ───────────────────────────────────────────

describe('createMissionReward', () => {
  const eligibleRewards: MissionRewardType[] = ['plus1000Influence', 'doubleVote', 'voteDeduction'];

  for (const type of eligibleRewards) {
    it(`"${type}" starts eligible`, () => {
      const r = createMissionReward(type);
      expect(r.type).toBe(type);
      expect(r.eligible).toBe(true);
      expect(r.consumed).toBe(false);
      expect(r.expired).toBe(false);
    });
  }

  it('"emptyBox" starts ineligible', () => {
    const r = createMissionReward('emptyBox');
    expect(r.eligible).toBe(false);
    expect(r.consumed).toBe(false);
    expect(r.expired).toBe(false);
  });
});
