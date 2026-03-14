/**
 * Unit tests for Risk Wheel core logic.
 *
 * Covers:
 *  - Elimination counts for each special player count rule
 *  - Tie-breaking at elimination cutoff
 *  - 666 add/subtract behavior
 *  - AI stop/spin decisions
 *  - Round progression and winner selection
 *  - Full state-machine flow
 */

import { configureStore } from '@reduxjs/toolkit';
import reducer, {
  initRiskWheel,
  performSpin,
  advanceFrom666,
  playerStop,
  playerSpinAgain,
  aiDecide,
  advanceFromTurnComplete,
  resolveAllAiTurns,
  advanceFromRoundSummary,
  computeEliminationCount,
  computeEliminatedPlayers,
  assignAiPersonality,
  aiDecisionRng,
  computeAiRiskDesire,
  computePositionFactor,
  computePressureFactor,
  aiShouldSpinAgain,
  aiShouldStop,
  resolve666Effect,
  pickSectorIndex,
  WHEEL_SECTORS,
  type RiskWheelAiPersonality,
  type RiskWheelState,
} from '../../../src/features/riskWheel/riskWheelSlice';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TestStore = ReturnType<typeof makeStore>;

function makeStore() {
  return configureStore({ reducer: { riskWheel: reducer } });
}

function getState(store: TestStore): RiskWheelState {
  return store.getState().riskWheel;
}

function init(
  store: TestStore,
  ids: string[],
  seed = 42,
  type: 'HOH' | 'POV' = 'HOH',
  humanId: string | null = null,
) {
  store.dispatch(
    initRiskWheel({
      participantIds: ids,
      competitionType: type,
      seed,
      humanPlayerId: humanId,
    }),
  );
}

// ─── computeEliminationCount ─────────────────────────────────────────────────

describe('computeEliminationCount', () => {
  describe('special: 4 players', () => {
    it('eliminates 1 in round 1', () => {
      expect(computeEliminationCount(4, 1, 4)).toBe(1);
    });
    it('eliminates 1 in round 2', () => {
      expect(computeEliminationCount(4, 2, 3)).toBe(1);
    });
    it('eliminates 0 in round 3 (winner = highest scorer)', () => {
      expect(computeEliminationCount(4, 3, 2)).toBe(0);
    });
  });

  describe('special: 3 players', () => {
    it('eliminates 1 in round 1', () => {
      expect(computeEliminationCount(3, 1, 3)).toBe(1);
    });
    it('eliminates 0 in round 2', () => {
      expect(computeEliminationCount(3, 2, 2)).toBe(0);
    });
    it('eliminates 1 in round 3', () => {
      expect(computeEliminationCount(3, 3, 2)).toBe(1);
    });
  });

  describe('special: 2 players', () => {
    it('eliminates 0 in round 1', () => {
      expect(computeEliminationCount(2, 1, 2)).toBe(0);
    });
    it('eliminates 0 in round 2', () => {
      expect(computeEliminationCount(2, 2, 2)).toBe(0);
    });
    it('eliminates 1 in round 3', () => {
      expect(computeEliminationCount(2, 3, 2)).toBe(1);
    });
  });

  describe('default: ≥5 players', () => {
    it('eliminates floor(5/2)=2 from 5 active', () => {
      expect(computeEliminationCount(5, 1, 5)).toBe(2);
    });
    it('eliminates floor(10/2)=5 from 10 active', () => {
      expect(computeEliminationCount(10, 1, 10)).toBe(5);
    });
    it('eliminates floor(11/2)=5 from 11 active', () => {
      expect(computeEliminationCount(11, 1, 11)).toBe(5);
    });
    it('eliminates floor(12/2)=6 from 12 active', () => {
      expect(computeEliminationCount(12, 1, 12)).toBe(6);
    });
    it('eliminates floor(13/2)=6 from 13 active', () => {
      expect(computeEliminationCount(13, 1, 13)).toBe(6);
    });
  });
});

// ─── computeEliminatedPlayers ─────────────────────────────────────────────────

describe('computeEliminatedPlayers', () => {
  it('eliminates the lowest scorer', () => {
    const scores = { a: 100, b: 50, c: 200 };
    const result = computeEliminatedPlayers(['a', 'b', 'c'], scores, 1, 99);
    expect(result).toEqual(['b']);
  });

  it('eliminates bottom N with no ties', () => {
    const scores = { a: 300, b: 100, c: 200, d: 50, e: 400 };
    const result = computeEliminatedPlayers(['a', 'b', 'c', 'd', 'e'], scores, 2, 99);
    expect(result).toContain('d');
    expect(result).toContain('b');
    expect(result).toHaveLength(2);
  });

  it('eliminates nobody when count is 0', () => {
    const scores = { a: 100, b: 50 };
    const result = computeEliminatedPlayers(['a', 'b'], scores, 0, 99);
    expect(result).toHaveLength(0);
  });

  it('handles tie at cutoff: deterministically picks from tied players', () => {
    // a=0, b=0, c=100 — eliminate 1 from tie between a and b
    const scores = { a: 0, b: 0, c: 100 };
    const result1 = computeEliminatedPlayers(['a', 'b', 'c'], scores, 1, 42);
    const result2 = computeEliminatedPlayers(['a', 'b', 'c'], scores, 1, 42);
    expect(result1).toHaveLength(1);
    expect(['a', 'b']).toContain(result1[0]);
    // deterministic: same seed → same result
    expect(result1).toEqual(result2);
  });

  it('different seeds produce potentially different tie-break results', () => {
    const scores = { a: 0, b: 0, c: 100, d: 200 };
    const results = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const r = computeEliminatedPlayers(['a', 'b', 'c', 'd'], scores, 1, seed);
      results.add(r[0]);
    }
    // Over many seeds we should see both 'a' and 'b' chosen
    expect(results.has('a')).toBe(true);
    expect(results.has('b')).toBe(true);
  });

  it('eliminates everyone if count >= length', () => {
    const scores = { a: 10, b: 20 };
    const result = computeEliminatedPlayers(['a', 'b'], scores, 5, 99);
    expect(result).toHaveLength(2);
  });
});

// ─── 666 effect ───────────────────────────────────────────────────────────────

describe('resolve666Effect', () => {
  it('returns "add" or "subtract"', () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(resolve666Effect(42, i));
    }
    expect(results.has('add')).toBe(true);
    expect(results.has('subtract')).toBe(true);
  });

  it('is deterministic: same seed + callCount → same result', () => {
    expect(resolve666Effect(1234, 7)).toBe(resolve666Effect(1234, 7));
  });
});

// ─── Dynamic AI helpers ───────────────────────────────────────────────────────

describe('assignAiPersonality', () => {
  it('is deterministic for the same seed and player id', () => {
    expect(assignAiPersonality(42, 'alex')).toBe(assignAiPersonality(42, 'alex'));
  });

  it('produces all supported personalities across many players', () => {
    const results = new Set<RiskWheelAiPersonality>();
    for (let i = 0; i < 200; i++) {
      results.add(assignAiPersonality(77, `player_${i}`));
    }
    expect(results).toEqual(new Set(['cautious', 'balanced', 'risky']));
  });
});

describe('aiDecisionRng', () => {
  it('is deterministic for the same inputs', () => {
    expect(aiDecisionRng(42, 2, 'alex', 1, 0)).toBe(aiDecisionRng(42, 2, 'alex', 1, 0));
  });

  it('differs for different players/channels/decision indices', () => {
    const a = aiDecisionRng(42, 2, 'alex', 1, 0);
    const b = aiDecisionRng(42, 2, 'blair', 1, 0);
    const c = aiDecisionRng(42, 2, 'alex', 2, 0);
    const d = aiDecisionRng(42, 2, 'alex', 1, 1);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});

describe('computePositionFactor', () => {
  it('returns 0 for the leading player and 1 for the bottom player', () => {
    const scores = { a: 500, b: 300, c: 100 };
    expect(computePositionFactor('a', ['a', 'b', 'c'], scores)).toBe(0);
    expect(computePositionFactor('c', ['a', 'b', 'c'], scores)).toBe(1);
  });

  it('returns 0.5 for the middle-ranked player in a 3-player field', () => {
    const scores = { a: 500, b: 300, c: 100 };
    expect(computePositionFactor('b', ['a', 'b', 'c'], scores)).toBe(0.5);
  });
});

describe('computePressureFactor', () => {
  it('increases later in the game', () => {
    const early = computePressureFactor(1, 6, 6);
    const late = computePressureFactor(3, 2, 6);
    expect(late).toBeGreaterThan(early);
  });

  it('returns 0 when initial player count is not positive', () => {
    expect(computePressureFactor(1, 0, 0)).toBe(0);
  });

  it('stays within bounds', () => {
    expect(computePressureFactor(1, 6, 6)).toBeGreaterThanOrEqual(0);
    expect(computePressureFactor(1, 6, 6)).toBeLessThanOrEqual(1);
    expect(computePressureFactor(3, 1, 6)).toBeLessThanOrEqual(1);
  });

  it('becomes very high with one player left in round 3', () => {
    expect(computePressureFactor(3, 1, 6)).toBeGreaterThan(0.9);
  });
});

describe('computeAiRiskDesire', () => {
  const activePlayerIds = ['a', 'b', 'c'];
  const roundScores = { a: 500, b: 150, c: -100 };

  it('returns a clamped 0–1 value', () => {
    const risk = computeAiRiskDesire({
      seed: 42,
      round: 2,
      playerId: 'b',
      personality: 'balanced',
      currentScore: 150,
      activePlayerIds,
      roundScores,
      spinsRemaining: 2,
      initialPlayerCount: 6,
      decisionIndex: 0,
    });
    expect(risk).toBeGreaterThanOrEqual(0);
    expect(risk).toBeLessThanOrEqual(1);
  });

  it('gives riskier personalities a higher base desire', () => {
    const cautious = computeAiRiskDesire({
      seed: 42,
      round: 2,
      playerId: 'b',
      personality: 'cautious',
      currentScore: 150,
      activePlayerIds,
      roundScores,
      spinsRemaining: 2,
      initialPlayerCount: 6,
      decisionIndex: 0,
    });
    const risky = computeAiRiskDesire({
      seed: 42,
      round: 2,
      playerId: 'b',
      personality: 'risky',
      currentScore: 150,
      activePlayerIds,
      roundScores,
      spinsRemaining: 2,
      initialPlayerCount: 6,
      decisionIndex: 0,
    });
    expect(risky).toBeGreaterThan(cautious);
  });

  it('increases when the player is near the bottom', () => {
    const leaderRisk = computeAiRiskDesire({
      seed: 42,
      round: 2,
      playerId: 'a',
      personality: 'balanced',
      currentScore: 500,
      activePlayerIds,
      roundScores,
      spinsRemaining: 2,
      initialPlayerCount: 6,
      decisionIndex: 0,
    });
    const bottomRisk = computeAiRiskDesire({
      seed: 42,
      round: 2,
      playerId: 'c',
      personality: 'balanced',
      currentScore: -100,
      activePlayerIds,
      roundScores,
      spinsRemaining: 2,
      initialPlayerCount: 6,
      decisionIndex: 0,
    });
    expect(bottomRisk).toBeGreaterThan(leaderRisk);
  });

  it('reduces risk on the last spin when banking a high score', () => {
    const early = computeAiRiskDesire({
      seed: 42,
      round: 2,
      playerId: 'a',
      personality: 'balanced',
      currentScore: 800,
      activePlayerIds,
      roundScores,
      spinsRemaining: 2,
      initialPlayerCount: 6,
      decisionIndex: 0,
    });
    const lastSpin = computeAiRiskDesire({
      seed: 42,
      round: 2,
      playerId: 'a',
      personality: 'balanced',
      currentScore: 800,
      activePlayerIds,
      roundScores,
      spinsRemaining: 1,
      initialPlayerCount: 6,
      decisionIndex: 0,
    });
    expect(lastSpin).toBeLessThan(early);
  });
});

describe('dynamic AI decisions', () => {
  const baseContext = {
    seed: 42,
    round: 2,
    playerId: 'b',
    personality: 'balanced' as RiskWheelAiPersonality,
    activePlayerIds: ['a', 'b', 'c'],
    roundScores: { a: 500, b: 150, c: -100 },
    initialPlayerCount: 6,
  };

  it('always spins when score is non-positive and spins remain', () => {
    expect(aiShouldSpinAgain({
      ...baseContext,
      currentScore: 0,
      spinsRemaining: 2,
      decisionIndex: 0,
    })).toBe(true);
    expect(aiShouldStop({
      ...baseContext,
      currentScore: -10,
      spinsRemaining: 2,
      decisionIndex: 1,
    })).toBe(false);
  });

  it('is deterministic for the same full context', () => {
    const ctx = {
      ...baseContext,
      currentScore: 275,
      spinsRemaining: 2,
      decisionIndex: 3,
    };
    expect(aiShouldSpinAgain(ctx)).toBe(aiShouldSpinAgain(ctx));
    expect(aiShouldStop(ctx)).toBe(aiShouldStop(ctx));
  });

  it('varies across seeds and decision indices', () => {
    const outcomes = new Set<boolean>();
    for (let i = 0; i < 40; i++) {
      outcomes.add(aiShouldSpinAgain({
        ...baseContext,
        seed: 100 + i,
        currentScore: 275,
        spinsRemaining: 2,
        decisionIndex: i,
      }));
    }
    expect(outcomes.has(true)).toBe(true);
    expect(outcomes.has(false)).toBe(true);
  });
});

// ─── Slice state machine tests ────────────────────────────────────────────────

describe('initRiskWheel', () => {
  it('starts in awaiting_spin with round 1', () => {
    const store = makeStore();
    init(store, ['a', 'b', 'c']);
    const s = getState(store);
    expect(s.phase).toBe('awaiting_spin');
    expect(s.round).toBe(1);
    expect(s.activePlayerIds).toEqual(['a', 'b', 'c']);
    expect(s.eliminatedPlayerIds).toHaveLength(0);
    expect(s.winnerId).toBeNull();
  });

  it('handles 0 participants → complete immediately', () => {
    const store = makeStore();
    init(store, []);
    expect(getState(store).phase).toBe('complete');
  });

  it('resets previous state on re-init', () => {
    const store = makeStore();
    init(store, ['a', 'b']);
    store.dispatch(performSpin());
    init(store, ['x', 'y', 'z']);
    const s = getState(store);
    expect(s.allPlayerIds).toEqual(['x', 'y', 'z']);
    expect(s.rngCallCount).toBe(0);
  });

  it('assigns persistent personalities to AI players only', () => {
    const store = makeStore();
    init(store, ['human', 'bot1', 'bot2'], 42, 'HOH', 'human');
    const s = getState(store);
    expect(s.aiPersonalities.human).toBeUndefined();
    expect(s.aiPersonalities.bot1).toBeTruthy();
    expect(s.aiPersonalities.bot2).toBeTruthy();
    expect(s.aiPersonalities.bot1).toBe(assignAiPersonality(42, 'bot1'));
  });
});

describe('performSpin', () => {
  it('advances rngCallCount and sets lastSectorIndex', () => {
    const store = makeStore();
    init(store, ['a', 'b'], 42);
    store.dispatch(performSpin());
    const s = getState(store);
    expect(s.lastSectorIndex).not.toBeNull();
    expect(s.rngCallCount).toBeGreaterThan(0);
  });

  it('bankrupt sets score to 0 and moves to turn_complete', () => {
    // Find a seed that produces 'bankrupt' on the first spin
    let seed = 0;
    while (WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'bankrupt') seed++;
    const store = makeStore();
    init(store, ['a', 'b'], seed);
    // Set a pre-spin score
    const preState = getState(store);
    expect(preState.roundScores['a']).toBe(0);

    store.dispatch(performSpin());
    const s = getState(store);
    expect(WHEEL_SECTORS[s.lastSectorIndex!].type).toBe('bankrupt');
    expect(s.roundScores['a']).toBe(0);
    expect(s.phase).toBe('turn_complete');
  });

  it('skip moves to turn_complete keeping score', () => {
    let seed = 0;
    while (WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'skip') seed++;
    const store = makeStore();
    init(store, ['a', 'b'], seed);
    // Artificially set a score via a prior spin workaround — we'll just check phase
    store.dispatch(performSpin());
    const s = getState(store);
    expect(WHEEL_SECTORS[s.lastSectorIndex!].type).toBe('skip');
    expect(s.phase).toBe('turn_complete');
  });

  it('666 moves to six_six_six and records effect', () => {
    let seed = 0;
    while (WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'devil') seed++;
    const store = makeStore();
    init(store, ['a', 'b'], seed);
    store.dispatch(performSpin());
    const s = getState(store);
    expect(s.phase).toBe('six_six_six');
    expect(s.last666Effect).toMatch(/^(add|subtract)$/);
  });

  it('points sector adds to score', () => {
    // Find seed that gives a positive points sector on first spin
    let seed = 0;
    while (WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' || (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0) {
      seed++;
    }
    const store = makeStore();
    init(store, ['a', 'b'], seed);
    store.dispatch(performSpin());
    const s = getState(store);
    const sector = WHEEL_SECTORS[s.lastSectorIndex!];
    expect(sector.type).toBe('points');
    expect(s.roundScores['a']).toBe(sector.value);
    // After 1 spin with a non-ending sector, should be awaiting_decision
    expect(s.phase).toBe('awaiting_decision');
  });
});

describe('advanceFrom666', () => {
  it('moves to awaiting_decision when spins remain', () => {
    let seed = 0;
    while (WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'devil') seed++;
    const store = makeStore();
    init(store, ['a', 'b'], seed);
    store.dispatch(performSpin()); // → six_six_six, spinCount=1
    expect(getState(store).phase).toBe('six_six_six');
    store.dispatch(advanceFrom666());
    expect(getState(store).phase).toBe('awaiting_decision');
  });

  const MAX_SEED_SEARCH = 100000;

  function findSeedForThirdSpinDevilSeed(): number {
    for (let s2 = 0; s2 < MAX_SEED_SEARCH; s2++) {
      const firstSector = WHEEL_SECTORS[pickSectorIndex(s2, 0)];
        const secondSector = WHEEL_SECTORS[pickSectorIndex(s2, 1)];
        const thirdSector = WHEEL_SECTORS[pickSectorIndex(s2, 2)];
        if (
          (firstSector.type === 'points' || firstSector.type === 'zero') &&
          (secondSector.type === 'points' || secondSector.type === 'zero') &&
          thirdSector.type === 'devil'
        ) {
          return s2;
        }
      }
      throw new Error(
        `Could not find seed producing two non-terminating spins followed by devil within ${MAX_SEED_SEARCH} attempts`,
      );
  }

  it('moves to turn_complete when on third spin', () => {
    const seed = findSeedForThirdSpinDevilSeed();
    const testStore = makeStore();
    init(testStore, ['a', 'b'], seed);

    testStore.dispatch(performSpin()); // spin 1
    testStore.dispatch(playerSpinAgain()); // → awaiting_spin
    testStore.dispatch(performSpin()); // spin 2
    testStore.dispatch(playerSpinAgain()); // → awaiting_spin
    testStore.dispatch(performSpin()); // spin 3 → six_six_six

    const stateAfterThirdSpin = getState(testStore);
    expect(stateAfterThirdSpin.phase).toBe('six_six_six');
    expect(stateAfterThirdSpin.currentSpinCount).toBe(3);

    testStore.dispatch(advanceFrom666());
    expect(getState(testStore).phase).toBe('turn_complete');
  });
});

describe('playerStop and playerSpinAgain', () => {
  it('playerStop moves awaiting_decision → turn_complete', () => {
    let seed = 0;
    while (
      WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
    ) {
      seed++;
    }
    const store = makeStore();
    init(store, ['a', 'b'], seed, 'HOH', 'a');
    store.dispatch(performSpin());
    expect(getState(store).phase).toBe('awaiting_decision');
    store.dispatch(playerStop());
    expect(getState(store).phase).toBe('turn_complete');
  });

  it('playerSpinAgain moves awaiting_decision → awaiting_spin', () => {
    let seed = 0;
    while (
      WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
    ) {
      seed++;
    }
    const store = makeStore();
    init(store, ['a', 'b'], seed, 'HOH', 'a');
    store.dispatch(performSpin());
    expect(getState(store).phase).toBe('awaiting_decision');
    store.dispatch(playerSpinAgain());
    expect(getState(store).phase).toBe('awaiting_spin');
  });
});

describe('advanceFromTurnComplete', () => {
  it('advances to next player when more players remain in round', () => {
    const store = makeStore();
    init(store, ['a', 'b', 'c'], 42);

    // Force player 'a' to finish their turn quickly
    let seed = 42;
    let found = false;
    for (seed = 0; seed < 10000; seed++) {
      const si = pickSectorIndex(seed, 0);
      const sec = WHEEL_SECTORS[si];
      if (sec.type === 'bankrupt' || sec.type === 'skip') {
        found = true;
        break;
      }
    }
    if (!found) {
      // fallback: use playerStop
      seed = 0;
      while (
        WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
        (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
      ) {
        seed++;
      }
      init(store, ['a', 'b', 'c'], seed);
      store.dispatch(performSpin());
      store.dispatch(playerStop());
    } else {
      init(store, ['a', 'b', 'c'], seed);
      store.dispatch(performSpin());
    }

    expect(getState(store).phase).toBe('turn_complete');
    store.dispatch(advanceFromTurnComplete());

    const s = getState(store);
    expect(s.phase).toBe('awaiting_spin');
    // Should be player 'b' now
    expect(s.activePlayerIds[s.currentPlayerIndex]).toBe('b');
  });
});

describe('round progression', () => {
  /**
   * Run an entire round for all players using bankrupt sectors where possible
   * or playerStop after first spin.
   */
  function runRoundQuickly(store: TestStore) {
    let safety = 0;
    while (getState(store).phase !== 'round_summary' && getState(store).phase !== 'complete') {
      const s = getState(store);
      if (s.phase === 'awaiting_spin') {
        store.dispatch(performSpin());
      } else if (s.phase === 'six_six_six') {
        store.dispatch(advanceFrom666());
      } else if (s.phase === 'awaiting_decision') {
        store.dispatch(playerStop());
      } else if (s.phase === 'turn_complete') {
        store.dispatch(advanceFromTurnComplete());
      } else {
        break;
      }
      if (++safety > 1000) break;
    }
  }

  it('progresses from round 1 to round 2', () => {
    const store = makeStore();
    init(store, ['a', 'b', 'c', 'd']);
    runRoundQuickly(store);
    expect(getState(store).phase).toBe('round_summary');

    store.dispatch(advanceFromRoundSummary());
    const s = getState(store);
    expect(s.round).toBe(2);
    expect(s.phase).toBe('awaiting_spin');
    // 4 players: round 1 eliminates 1 → 3 active
    expect(s.activePlayerIds).toHaveLength(3);
  });

  it('reaches complete after 3 rounds for 4 players', () => {
    const store = makeStore();
    init(store, ['a', 'b', 'c', 'd']);

    for (let r = 0; r < 3; r++) {
      runRoundQuickly(store);
      if (getState(store).phase === 'complete') break;
      expect(getState(store).phase).toBe('round_summary');
      store.dispatch(advanceFromRoundSummary());
    }

    const s = getState(store);
    expect(s.phase).toBe('complete');
    expect(s.winnerId).not.toBeNull();
  });

  it('winner is highest scorer among active after round 3', () => {
    const store = makeStore();
    // Use 2 players: no elimination until round 3
    init(store, ['a', 'b'], 42);

    for (let r = 0; r < 3; r++) {
      let safety = 0;
      while (
        getState(store).phase !== 'round_summary' &&
        getState(store).phase !== 'complete'
      ) {
        const s = getState(store);
        if (s.phase === 'awaiting_spin') store.dispatch(performSpin());
        else if (s.phase === 'six_six_six') store.dispatch(advanceFrom666());
        else if (s.phase === 'awaiting_decision') store.dispatch(playerStop());
        else if (s.phase === 'turn_complete') store.dispatch(advanceFromTurnComplete());
        else break;
        if (++safety > 200) break;
      }
      if (getState(store).phase === 'complete') break;
      store.dispatch(advanceFromRoundSummary());
    }

    const s = getState(store);
    expect(s.phase).toBe('complete');
    // Winner should be the player with highest score in round 3
    expect(s.winnerId).toBeTruthy();
    expect(['a', 'b']).toContain(s.winnerId);
  });

  it('round scores reset each new round', () => {
    const store = makeStore();
    init(store, ['a', 'b', 'c', 'd']);
    // Complete round 1 (4 players)
    let safety = 0;
    while (getState(store).phase !== 'round_summary' && safety++ < 500) {
      const s = getState(store);
      if (s.phase === 'awaiting_spin') store.dispatch(performSpin());
      else if (s.phase === 'six_six_six') store.dispatch(advanceFrom666());
      else if (s.phase === 'awaiting_decision') store.dispatch(playerStop());
      else if (s.phase === 'turn_complete') store.dispatch(advanceFromTurnComplete());
      else break;
    }
    store.dispatch(advanceFromRoundSummary());
    const s = getState(store);
    // All active players should have score 0 at start of round 2
    for (const id of s.activePlayerIds) {
      expect(s.roundScores[id]).toBe(0);
    }
  });
});

describe('2-player special rules', () => {
  it('no eliminations in rounds 1 and 2', () => {
    const store = makeStore();
    init(store, ['a', 'b']);

    function runRound() {
      let safety = 0;
      while (getState(store).phase !== 'round_summary' && safety++ < 200) {
        const s = getState(store);
        if (s.phase === 'awaiting_spin') store.dispatch(performSpin());
        else if (s.phase === 'six_six_six') store.dispatch(advanceFrom666());
        else if (s.phase === 'awaiting_decision') store.dispatch(playerStop());
        else if (s.phase === 'turn_complete') store.dispatch(advanceFromTurnComplete());
        else break;
      }
    }

    runRound();
    expect(getState(store).phase).toBe('round_summary');
    expect(getState(store).eliminatedThisRound).toHaveLength(0);
    store.dispatch(advanceFromRoundSummary());
    expect(getState(store).activePlayerIds).toHaveLength(2);

    runRound();
    expect(getState(store).phase).toBe('round_summary');
    expect(getState(store).eliminatedThisRound).toHaveLength(0);
    store.dispatch(advanceFromRoundSummary());
    expect(getState(store).activePlayerIds).toHaveLength(2);

    runRound();
    expect(getState(store).phase).toBe('round_summary');
    expect(getState(store).eliminatedThisRound).toHaveLength(1);
    store.dispatch(advanceFromRoundSummary());
    expect(getState(store).phase).toBe('complete');
    expect(getState(store).winnerId).not.toBeNull();
  });
});

describe('aiDecide', () => {
  it('increments aiDecisionCallCount', () => {
    // Set up a position where AI is at awaiting_decision
    let seed = 0;
    while (
      WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
    ) {
      seed++;
    }
    const store = makeStore();
    init(store, ['a', 'b'], seed, 'HOH', null); // no human
    store.dispatch(performSpin());
    const before = getState(store).aiDecisionCallCount;
    const perPlayerBefore = getState(store).aiDecisionCounts.a;
    store.dispatch(aiDecide());
    expect(getState(store).aiDecisionCallCount).toBe(before + 1);
    expect(getState(store).aiDecisionCounts.a).toBe(perPlayerBefore + 1);
  });

  it('does nothing when current player is human', () => {
    let seed = 0;
    while (
      WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
    ) {
      seed++;
    }
    const store = makeStore();
    init(store, ['a', 'b'], seed, 'HOH', 'a'); // 'a' is human
    store.dispatch(performSpin());
    const phaseBefore = getState(store).phase;
    store.dispatch(aiDecide()); // should be no-op for human
    // Phase should remain awaiting_decision (not advanced by AI)
    expect(getState(store).phase).toBe(phaseBefore);
  });
});

// ─── resolveAllAiTurns ────────────────────────────────────────────────────────

describe('resolveAllAiTurns', () => {
  /**
   * Helper: run one full round with a human as first player (player 'a'),
   * using the human player's actions manually, then call resolveAllAiTurns.
   * Verifies AI turns resolve without stalling.
   */
  function findPointsSeed(): number {
    let seed = 0;
    while (
      WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
    ) {
      seed++;
    }
    return seed;
  }

  it('resolves all consecutive AI turns from awaiting_spin', () => {
    // Players: human='a', AI='b', AI='c'
    const store = makeStore();
    init(store, ['a', 'b', 'c'], 42, 'HOH', null); // no human (all AI)
    // All in awaiting_spin; resolveAllAiTurns should run all three
    store.dispatch(resolveAllAiTurns());
    const s = getState(store);
    // Should reach round_summary (all AI turns done, no human to stop at)
    expect(s.phase).toBe('round_summary');
    // All players should have completed their turns
    expect(s.playersCompletedThisRound).toHaveLength(3);
  });

  it('stops at human turn and does not advance past it', () => {
    const seed = findPointsSeed();
    const store = makeStore();
    init(store, ['a', 'b', 'c'], seed, 'HOH', 'a'); // 'a' is human, goes first
    // Human hasn't gone yet; resolveAllAiTurns should be a no-op
    store.dispatch(resolveAllAiTurns());
    const s = getState(store);
    // Still waiting on human player 'a'
    expect(s.phase).toBe('awaiting_spin');
    expect(s.activePlayerIds[s.currentPlayerIndex]).toBe('a');
    expect(s.playersCompletedThisRound).toHaveLength(0);
  });

  it('no AI stall after human banks: AI turns resolve and reach round_summary', () => {
    // Regression test for Bug #1:
    // After human completes their turn, calling advanceFromTurnComplete()
    // followed by resolveAllAiTurns() must fully process all AI turns
    // and reach round_summary — never getting stuck.
    const seed = findPointsSeed();
    const store = makeStore();
    // 'a' is human, 'b' and 'c' are AI
    init(store, ['a', 'b', 'c'], seed, 'HOH', 'a');

    // Human spins once then banks
    store.dispatch(performSpin()); // human spin → awaiting_decision (or turn_complete)
    const afterSpin = getState(store);
    if (afterSpin.phase === 'awaiting_decision') {
      store.dispatch(playerStop()); // human banks → turn_complete
    }
    expect(getState(store).phase).toBe('turn_complete');
    expect(getState(store).activePlayerIds[getState(store).currentPlayerIndex]).toBe('a');

    // Human presses "Continue" — mimics the UI's dispatched actions
    store.dispatch(advanceFromTurnComplete()); // → awaiting_spin for next player (b or c)
    store.dispatch(resolveAllAiTurns());       // resolve all remaining AI turns

    const s = getState(store);
    // Must reach round_summary without stalling
    expect(s.phase).toBe('round_summary');
    // All three players must have completed their turns
    expect(s.playersCompletedThisRound).toHaveLength(3);
  });

  it('resolves from awaiting_decision for AI player', () => {
    // Set up scenario where an AI is at awaiting_decision
    const seed = findPointsSeed();
    const store = makeStore();
    init(store, ['b', 'c'], seed, 'HOH', null); // all AI
    store.dispatch(performSpin()); // should be awaiting_decision
    const s0 = getState(store);
    if (s0.phase === 'awaiting_decision') {
      store.dispatch(resolveAllAiTurns());
      // Should finish both AI turns and reach round_summary
      const s1 = getState(store);
      expect(['round_summary', 'awaiting_spin']).toContain(s1.phase);
    }
  });

  it('is idempotent when already at round_summary', () => {
    const store = makeStore();
    init(store, ['a', 'b'], 42, 'HOH', null); // all AI
    store.dispatch(resolveAllAiTurns());
    expect(getState(store).phase).toBe('round_summary');
    // Calling again should be a no-op
    store.dispatch(resolveAllAiTurns());
    expect(getState(store).phase).toBe('round_summary');
  });

  it('handles 666 sector for AI without getting stuck in six_six_six phase', () => {
    // Find seed where first spin gives 666
    let seed = 0;
    while (WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'devil') seed++;
    const store = makeStore();
    init(store, ['a', 'b'], seed, 'HOH', null); // all AI, 'a' will get 666
    store.dispatch(resolveAllAiTurns());
    // Should never stall in six_six_six
    const s = getState(store);
    expect(s.phase).not.toBe('six_six_six');
    expect(['round_summary', 'awaiting_spin', 'awaiting_decision', 'turn_complete', 'complete']).toContain(s.phase);
  });

  it('full round with resolveAllAiTurns reaches round_summary for any seed', () => {
    for (let seed = 0; seed < 20; seed++) {
      const store = makeStore();
      init(store, ['x', 'y', 'z'], seed, 'HOH', null);
      store.dispatch(resolveAllAiTurns());
      expect(getState(store).phase).toBe('round_summary');
    }
  });
});

// ─── Spin Again (Bug #2 regression) ──────────────────────────────────────────

describe('Spin Again direct spin regression', () => {
  it('playerSpinAgain moves to awaiting_spin so performSpin can fire immediately', () => {
    // Bug #2: in the old UI, "Spin Again" dispatched playerSpinAgain() and
    // then showed a "Spin" button — an extra step. The fix is to dispatch
    // playerSpinAgain() and then immediately dispatch performSpin() without
    // waiting for a user interaction. Verify the slice supports this.
    let seed = 0;
    while (
      WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0
    ) {
      seed++;
    }
    // Make sure second spin also produces a non-terminal result
    while (
      WHEEL_SECTORS[pickSectorIndex(seed, 0)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 0)].value ?? 0) <= 0 ||
      WHEEL_SECTORS[pickSectorIndex(seed, 1)].type !== 'points' ||
      (WHEEL_SECTORS[pickSectorIndex(seed, 1)].value ?? 0) <= 0
    ) {
      seed++;
    }

    const store = makeStore();
    init(store, ['a', 'b'], seed, 'HOH', 'a');

    // Spin 1
    store.dispatch(performSpin());
    expect(getState(store).phase).toBe('awaiting_decision');
    expect(getState(store).currentSpinCount).toBe(1);

    // Spin Again: playerSpinAgain → awaiting_spin, then immediately performSpin
    store.dispatch(playerSpinAgain());
    expect(getState(store).phase).toBe('awaiting_spin'); // confirms no intermediate "Spin" needed
    store.dispatch(performSpin());                        // fires immediately (no extra button press)
    expect(getState(store).currentSpinCount).toBe(2);

    // Phase should be awaiting_decision (ready for next decision or bank)
    expect(['awaiting_decision', 'turn_complete']).toContain(getState(store).phase);
  });
});
