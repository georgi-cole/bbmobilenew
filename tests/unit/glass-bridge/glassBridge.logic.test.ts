/**
 * Unit tests: Glass Bridge — Brutal Mode logic.
 *
 * Covers:
 *  1. Bridge generation is deterministic given the same seed.
 *  2. buildAiNumberChoices produces valid, unique picks.
 *  3. aiDecideStep inference: one broken tile → infers safe side (≥ 99.9% accuracy).
 *  4. aiDecideStep: no broken tiles → random (50/50 distribution).
 *  5. aiDecideStep: both broken → recover safely (no crash).
 *  6. resolveStep: safe tile advances progress.
 *  7. resolveStep: wrong tile breaks tile and eliminates player.
 *  8. Broken tile persistence across turns.
 *  9. resolveStep: safe step sets revealedSafeSide on the row.
 * 10. aiDecideStep: revealedSafeSide → picks revealed side ~95%.
 * 11. buildPlacements: finished players rank before non-finishers.
 * 12. buildPlacements: no finishers → rank by furthestRowReached DESC.
 * 13. buildPlacements: tie on row → rank by timeReachedFurthestRowMs ASC.
 * 14. buildPlacements: full tie → turn order ASC.
 * 15. completeGame sets phase to 'complete' and populates placements.
 * 16. Timer expiry eliminates remaining players.
 * 17. Full deterministic simulation: same seed produces same outcome.
 * 18. initGlassBridge: state shape is correct.
 * 19. recordNumberChoice: validates range and uniqueness.
 * 20. finaliseOrderSelection: produces correct turn order.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import glassBridgeReducer, {
  initGlassBridge,
  recordNumberChoice,
  finaliseOrderSelection,
  startPlaying,
  resolveStep,
  advanceTurn,
  expireTimer,
  completeGame,
  setHumanSpectating,
  resetGlassBridge,
  generateBridgeRows,
  buildPlacements,
  buildAiNumberChoices,
  aiDecideStep,
  simulateAiTurn,
  type BridgeRow,
  type GlassBridgePlayerProgress,
} from '../../../src/features/glassBridge/glassBridgeSlice';
import { mulberry32 } from '../../../src/store/rng';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { glassBridge: glassBridgeReducer } });
}

const T0 = 1_700_000_000_000;

function startGame(
  ids: string[],
  seed = 42,
  humanPlayerId: string | null = null,
) {
  const store = makeStore();
  store.dispatch(
    initGlassBridge({
      participantIds: ids,
      participants: ids.map(id => ({
        id,
        name: id,
        isHuman: id === humanPlayerId,
      })),
      competitionType: 'HOH',
      seed,
      humanPlayerId,
    }),
  );
  return store;
}

function allAiPickNumbers(store: ReturnType<typeof makeStore>, seed = 42) {
  const gb = store.getState().glassBridge;
  const rng = mulberry32(seed + 100);
  const choices = buildAiNumberChoices(
    gb.participants.map(p => p.id),
    gb.humanPlayerId,
    gb.chosenNumbers,
    rng,
  );
  for (const [pid, num] of Object.entries(choices)) {
    store.dispatch(recordNumberChoice({ playerId: pid, number: num }));
  }
}

function completeOrderPhase(store: ReturnType<typeof makeStore>, seed = 42) {
  allAiPickNumbers(store, seed);
  store.dispatch(finaliseOrderSelection());
  store.dispatch(startPlaying({ now: T0 }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateBridgeRows', () => {
  it('produces deterministic rows from the same seed', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    const rows1 = generateBridgeRows(rng1, 16);
    const rows2 = generateBridgeRows(rng2, 16);
    expect(rows1).toEqual(rows2);
  });

  it('produces different rows for different seeds', () => {
    const rows1 = generateBridgeRows(mulberry32(1), 16);
    const rows2 = generateBridgeRows(mulberry32(2), 16);
    // Very unlikely to be identical with 16 rows.
    expect(rows1.map(r => r.safeSide)).not.toEqual(rows2.map(r => r.safeSide));
  });

  it('initialises all tiles as intact', () => {
    const rows = generateBridgeRows(mulberry32(99), 10);
    for (const r of rows) {
      expect(r.leftBroken).toBe(false);
      expect(r.rightBroken).toBe(false);
      expect(r.revealedSafeSide).toBeNull();
    }
  });

  it('produces exactly the requested row count', () => {
    expect(generateBridgeRows(mulberry32(1), 5)).toHaveLength(5);
    expect(generateBridgeRows(mulberry32(1), 20)).toHaveLength(20);
  });
});

describe('buildAiNumberChoices', () => {
  it('assigns unique numbers to each AI participant', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const rng = mulberry32(7);
    const choices = buildAiNumberChoices(ids, null, {}, rng);
    const nums = Object.values(choices);
    expect(nums).toHaveLength(4);
    expect(new Set(nums).size).toBe(4);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('skips the human player', () => {
    const ids = ['user', 'b', 'c'];
    const rng = mulberry32(7);
    const choices = buildAiNumberChoices(ids, 'user', {}, rng);
    expect(choices).not.toHaveProperty('user');
  });

  it('respects already-chosen numbers', () => {
    const ids = ['a', 'b', 'c'];
    const rng = mulberry32(7);
    const choices = buildAiNumberChoices(ids, null, { a: 2 }, rng);
    expect(choices).not.toHaveProperty('a'); // already chose
    const allNums = [2, ...Object.values(choices)];
    expect(new Set(allNums).size).toBe(allNums.length); // all unique
  });

  it('is deterministic', () => {
    const ids = ['a', 'b', 'c'];
    const c1 = buildAiNumberChoices(ids, null, {}, mulberry32(42));
    const c2 = buildAiNumberChoices(ids, null, {}, mulberry32(42));
    expect(c1).toEqual(c2);
  });
});

describe('aiDecideStep', () => {
  it('infers right tile when left is broken (with high accuracy)', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: true,
      rightBroken: false,
      revealedSafeSide: null,
    };
    // Run 100 times, expect the vast majority to choose 'right'.
    let rightCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = mulberry32(i * 13 + 1);
      if (aiDecideStep(row, rng) === 'right') rightCount++;
    }
    // With 0.999 accuracy, expect > 90 correct out of 100.
    expect(rightCount).toBeGreaterThan(90);
  });

  it('infers left tile when right is broken (with high accuracy)', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: false,
      rightBroken: true,
      revealedSafeSide: null,
    };
    let leftCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = mulberry32(i * 7 + 2);
      if (aiDecideStep(row, rng) === 'left') leftCount++;
    }
    expect(leftCount).toBeGreaterThan(90);
  });

  it('chooses randomly when no tiles are broken', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken'> = {
      leftBroken: false,
      rightBroken: false,
    };
    let leftCount = 0;
    for (let i = 0; i < 200; i++) {
      const rng = mulberry32(i * 3 + 5);
      if (aiDecideStep(row, rng) === 'left') leftCount++;
    }
    // Should be roughly 50/50 ±15%.
    expect(leftCount).toBeGreaterThan(70);
    expect(leftCount).toBeLessThan(130);
  });

  it('does not crash when both tiles are broken', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: true,
      rightBroken: true,
      revealedSafeSide: null,
    };
    const rng = mulberry32(1);
    expect(() => aiDecideStep(row, rng)).not.toThrow();
    const side = aiDecideStep(row, rng);
    expect(['left', 'right']).toContain(side);
  });

  it('is deterministic for the same RNG state', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: false,
      rightBroken: false,
      revealedSafeSide: null,
    };
    const rng1 = mulberry32(999);
    const rng2 = mulberry32(999);
    expect(aiDecideStep(row, rng1)).toBe(aiDecideStep(row, rng2));
  });

  it('picks revealedSafeSide ~95% of the time when set (left)', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: false,
      rightBroken: false,
      revealedSafeSide: 'left',
    };
    let leftCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = mulberry32(i * 17 + 3);
      if (aiDecideStep(row, rng) === 'left') leftCount++;
    }
    // 95% probability → expect > 85 out of 100.
    expect(leftCount).toBeGreaterThan(85);
    // Should not be 100% (some variance expected).
    expect(leftCount).toBeLessThan(100);
  });

  it('picks revealedSafeSide ~95% of the time when set (right)', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: false,
      rightBroken: false,
      revealedSafeSide: 'right',
    };
    let rightCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = mulberry32(i * 11 + 7);
      if (aiDecideStep(row, rng) === 'right') rightCount++;
    }
    expect(rightCount).toBeGreaterThan(85);
  });

  it('picks revealedSafeSide with deterministic behaviour for a given seed', () => {
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: false,
      rightBroken: false,
      revealedSafeSide: 'right',
    };
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    expect(aiDecideStep(row, rng1)).toBe(aiDecideStep(row, rng2));
  });

  it('uses revealedSafeSide even when a tile is broken (revealed takes priority over broken-tile inference)', () => {
    // revealedSafeSide takes priority over broken-tile inference.
    const row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'> = {
      leftBroken: true,
      rightBroken: false,
      revealedSafeSide: 'right', // consistent: right is safe and was revealed
    };
    // With revealedSafeSide = 'right' and 95% probability, should pick right most of the time.
    let rightCount = 0;
    for (let i = 0; i < 100; i++) {
      const rng = mulberry32(i * 5 + 9);
      if (aiDecideStep(row, rng) === 'right') rightCount++;
    }
    expect(rightCount).toBeGreaterThan(85);
  });
});

describe('glassBridgeSlice — resolveStep', () => {
  it('advances furthestRowReached on a safe step', () => {
    const store = startGame(['a', 'b'], 42);
    completeOrderPhase(store, 42);
    const gb = store.getState().glassBridge;

    const activeId = gb.turnOrder[0];
    const row = gb.rows[0];

    store.dispatch(resolveStep({ chosenSide: row.safeSide, now: T0 + 1000 }));

    const updated = store.getState().glassBridge;
    expect(updated.progress[activeId].furthestRowReached).toBe(1);
    expect(updated.progress[activeId].eliminated).toBe(false);
  });

  it('eliminates the player on a wrong step', () => {
    const store = startGame(['a', 'b'], 42);
    completeOrderPhase(store, 42);
    const gb = store.getState().glassBridge;

    const activeId = gb.turnOrder[0];
    const row = gb.rows[0];
    const wrongSide = row.safeSide === 'left' ? 'right' : 'left';

    store.dispatch(resolveStep({ chosenSide: wrongSide, now: T0 + 1000 }));

    const updated = store.getState().glassBridge;
    expect(updated.progress[activeId].eliminated).toBe(true);
    expect(updated.progress[activeId].furthestRowReached).toBe(0);
  });

  it('marks the broken tile on a wrong step', () => {
    const store = startGame(['a', 'b'], 42);
    completeOrderPhase(store, 42);
    const gb = store.getState().glassBridge;

    const row = gb.rows[0];
    const wrongSide = row.safeSide === 'left' ? 'right' : 'left';

    store.dispatch(resolveStep({ chosenSide: wrongSide, now: T0 + 1000 }));

    const updatedRow = store.getState().glassBridge.rows[0];
    if (wrongSide === 'left') {
      expect(updatedRow.leftBroken).toBe(true);
      expect(updatedRow.rightBroken).toBe(false);
    } else {
      expect(updatedRow.rightBroken).toBe(true);
      expect(updatedRow.leftBroken).toBe(false);
    }
  });

  it('sets revealedSafeSide on the row after a correct step', () => {
    const store = startGame(['a', 'b'], 42);
    completeOrderPhase(store, 42);
    const gb = store.getState().glassBridge;

    const row = gb.rows[0];
    store.dispatch(resolveStep({ chosenSide: row.safeSide, now: T0 + 1000 }));

    const updatedRow = store.getState().glassBridge.rows[0];
    // revealedSafeSide should be set to the safe side so subsequent AI players can use it.
    expect(updatedRow.revealedSafeSide).toBe(row.safeSide);
    // Neither tile should be marked broken — the safe tile stays intact.
    expect(updatedRow.leftBroken).toBe(false);
    expect(updatedRow.rightBroken).toBe(false);
  });

  it('records finishTimeMs when the final row is crossed safely', () => {
    // Create a 2-row bridge so we can finish quickly.
    const store = makeStore();
    store.dispatch(
      initGlassBridge({
        participantIds: ['a'],
        competitionType: 'HOH',
        seed: 42,
        rowsCount: 2,
      }),
    );
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 1 }));
    store.dispatch(finaliseOrderSelection());
    store.dispatch(startPlaying({ now: T0 }));

    const gb = store.getState().glassBridge;
    const row0 = gb.rows[0];
    const row1 = gb.rows[1];

    store.dispatch(resolveStep({ chosenSide: row0.safeSide, now: T0 + 1000 }));
    store.dispatch(resolveStep({ chosenSide: row1.safeSide, now: T0 + 2000 }));

    const updated = store.getState().glassBridge;
    expect(updated.progress['a'].finishTimeMs).toBe(2000);
  });
});

describe('buildPlacements', () => {
  const makeProgress = (
    overrides: Partial<GlassBridgePlayerProgress>,
    id: string,
  ): GlassBridgePlayerProgress => ({
    playerId: id,
    furthestRowReached: 0,
    timeReachedFurthestRowMs: 0,
    eliminated: false,
    ...overrides,
  });

  it('finished players rank before non-finishers', () => {
    const progress: Record<string, GlassBridgePlayerProgress> = {
      a: makeProgress({ furthestRowReached: 5, eliminated: false }, 'a'),
      b: makeProgress({ furthestRowReached: 16, finishTimeMs: 30000 }, 'b'),
    };
    const placements = buildPlacements(progress, ['a', 'b']);
    expect(placements[0]).toBe('b');
    expect(placements[1]).toBe('a');
  });

  it('sorts finished players by finishTimeMs ASC', () => {
    const progress: Record<string, GlassBridgePlayerProgress> = {
      a: makeProgress({ finishTimeMs: 50000, furthestRowReached: 16 }, 'a'),
      b: makeProgress({ finishTimeMs: 30000, furthestRowReached: 16 }, 'b'),
      c: makeProgress({ finishTimeMs: 40000, furthestRowReached: 16 }, 'c'),
    };
    const placements = buildPlacements(progress, ['a', 'b', 'c']);
    expect(placements).toEqual(['b', 'c', 'a']);
  });

  it('sorts non-finishers by furthestRowReached DESC', () => {
    const progress: Record<string, GlassBridgePlayerProgress> = {
      a: makeProgress({ furthestRowReached: 3, eliminated: true }, 'a'),
      b: makeProgress({ furthestRowReached: 8, eliminated: true }, 'b'),
      c: makeProgress({ furthestRowReached: 1, eliminated: true }, 'c'),
    };
    const placements = buildPlacements(progress, ['a', 'b', 'c']);
    expect(placements[0]).toBe('b');
    expect(placements[1]).toBe('a');
    expect(placements[2]).toBe('c');
  });

  it('breaks row tie by timeReachedFurthestRowMs ASC', () => {
    const progress: Record<string, GlassBridgePlayerProgress> = {
      a: makeProgress({ furthestRowReached: 5, timeReachedFurthestRowMs: 5000, eliminated: true }, 'a'),
      b: makeProgress({ furthestRowReached: 5, timeReachedFurthestRowMs: 3000, eliminated: true }, 'b'),
    };
    const placements = buildPlacements(progress, ['a', 'b']);
    expect(placements[0]).toBe('b'); // earlier time wins
  });

  it('breaks time tie by turn order (earlier turn first)', () => {
    const progress: Record<string, GlassBridgePlayerProgress> = {
      a: makeProgress({ furthestRowReached: 5, timeReachedFurthestRowMs: 3000, eliminated: true }, 'a'),
      b: makeProgress({ furthestRowReached: 5, timeReachedFurthestRowMs: 3000, eliminated: true }, 'b'),
    };
    // 'b' goes first in turn order.
    const placements = buildPlacements(progress, ['b', 'a']);
    expect(placements[0]).toBe('b');
  });
});

describe('glassBridgeSlice — completeGame', () => {
  it('sets phase to complete and populates placements', () => {
    const store = startGame(['a', 'b'], 42);
    completeOrderPhase(store, 42);

    // Eliminate both players.
    let gb = store.getState().glassBridge;
    const wrongSide0 = gb.rows[0].safeSide === 'left' ? 'right' : 'left';
    store.dispatch(resolveStep({ chosenSide: wrongSide0, now: T0 + 1000 }));
    gb = store.getState().glassBridge;
    const wrongSide1 = gb.rows[0].safeSide === 'left' ? 'right' : 'left';
    store.dispatch(resolveStep({ chosenSide: wrongSide1, now: T0 + 2000 }));

    store.dispatch(completeGame());
    const final = store.getState().glassBridge;
    expect(final.phase).toBe('complete');
    expect(final.placements).toHaveLength(2);
    expect(final.winnerId).not.toBeNull();
  });
});

describe('glassBridgeSlice — expireTimer', () => {
  it('eliminates all unfinished players on timer expiry', () => {
    const store = startGame(['a', 'b', 'c'], 42);
    completeOrderPhase(store, 42);

    store.dispatch(expireTimer());
    const gb = store.getState().glassBridge;
    for (const p of Object.values(gb.progress)) {
      expect(p.eliminated).toBe(true);
    }
    expect(gb.timerExpired).toBe(true);
  });

  it('is idempotent — dispatching twice does not duplicate eliminationOrder', () => {
    const store = startGame(['a', 'b'], 42);
    completeOrderPhase(store, 42);

    store.dispatch(expireTimer());
    store.dispatch(expireTimer());

    const gb = store.getState().glassBridge;
    // Each player should appear at most once in eliminationOrder.
    const counts: Record<string, number> = {};
    for (const pid of gb.eliminationOrder) {
      counts[pid] = (counts[pid] ?? 0) + 1;
    }
    for (const count of Object.values(counts)) {
      expect(count).toBe(1);
    }
  });
});

describe('glassBridgeSlice — spectator', () => {
  it('setHumanSpectating updates humanSpectating flag', () => {
    const store = startGame(['user', 'a'], 42, 'user');
    store.dispatch(setHumanSpectating(true));
    expect(store.getState().glassBridge.humanSpectating).toBe(true);
    store.dispatch(setHumanSpectating(false));
    expect(store.getState().glassBridge.humanSpectating).toBe(false);
  });
});

describe('glassBridgeSlice — resetGlassBridge', () => {
  it('returns to idle state', () => {
    const store = startGame(['a', 'b'], 42);
    store.dispatch(resetGlassBridge());
    expect(store.getState().glassBridge.phase).toBe('idle');
    expect(store.getState().glassBridge.participants).toHaveLength(0);
  });
});

describe('glassBridgeSlice — initGlassBridge', () => {
  it('sets up correct initial state shape', () => {
    const store = startGame(['a', 'b', 'c'], 7);
    const gb = store.getState().glassBridge;
    expect(gb.phase).toBe('order_selection');
    expect(gb.participants).toHaveLength(3);
    expect(gb.rows).toHaveLength(16); // default
    expect(gb.chosenNumbers).toEqual({});
    expect(gb.turnOrder).toEqual([]);
    expect(gb.progress['a']).toBeDefined();
    expect(gb.progress['a'].furthestRowReached).toBe(0);
    expect(gb.progress['a'].eliminated).toBe(false);
  });
});

describe('glassBridgeSlice — recordNumberChoice', () => {
  it('accepts a valid number choice', () => {
    const store = startGame(['a', 'b'], 42);
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 1 }));
    expect(store.getState().glassBridge.chosenNumbers['a']).toBe(1);
  });

  it('rejects an out-of-range number', () => {
    const store = startGame(['a', 'b'], 42);
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 99 }));
    expect(store.getState().glassBridge.chosenNumbers['a']).toBeUndefined();
  });

  it('rejects a number already taken by another player', () => {
    const store = startGame(['a', 'b'], 42);
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 1 }));
    store.dispatch(recordNumberChoice({ playerId: 'b', number: 1 }));
    expect(store.getState().glassBridge.chosenNumbers['b']).toBeUndefined();
  });

  it('rejects an unknown playerId not in participants', () => {
    const store = startGame(['a', 'b'], 42);
    store.dispatch(recordNumberChoice({ playerId: 'nobody', number: 1 }));
    expect(store.getState().glassBridge.chosenNumbers['nobody']).toBeUndefined();
  });

  it('prevents a player from overwriting their own pick', () => {
    const store = startGame(['a', 'b'], 42);
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 1 }));
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 2 }));
    // First pick stays; second is ignored.
    expect(store.getState().glassBridge.chosenNumbers['a']).toBe(1);
  });
});

describe('glassBridgeSlice — finaliseOrderSelection', () => {
  it('produces a valid turn order from chosen numbers', () => {
    const store = startGame(['a', 'b', 'c'], 42);
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 3 }));
    store.dispatch(recordNumberChoice({ playerId: 'b', number: 1 }));
    store.dispatch(recordNumberChoice({ playerId: 'c', number: 2 }));
    store.dispatch(finaliseOrderSelection());
    const gb = store.getState().glassBridge;
    expect(gb.phase).toBe('order_reveal');
    expect(gb.turnOrder).toHaveLength(3);
    expect(gb.turnOrder).toContain('a');
    expect(gb.turnOrder).toContain('b');
    expect(gb.turnOrder).toContain('c');
  });

  it('is deterministic — same seed produces same order', () => {
    function runOrder(seed: number) {
      const store = makeStore();
      store.dispatch(initGlassBridge({ participantIds: ['a', 'b', 'c'], competitionType: 'HOH', seed }));
      store.dispatch(recordNumberChoice({ playerId: 'a', number: 3 }));
      store.dispatch(recordNumberChoice({ playerId: 'b', number: 1 }));
      store.dispatch(recordNumberChoice({ playerId: 'c', number: 2 }));
      store.dispatch(finaliseOrderSelection());
      return store.getState().glassBridge.turnOrder;
    }
    expect(runOrder(42)).toEqual(runOrder(42));
  });
});

describe('simulateAiTurn', () => {
  it('returns steps array that ends on break or completion', () => {
    const rows = generateBridgeRows(mulberry32(1), 5);
    const rng = mulberry32(2);
    const steps = simulateAiTurn(rows, rng);
    // Steps should end on a 'break' OR equal to rowsCount (full completion).
    const lastStep = steps[steps.length - 1];
    if (lastStep.result === 'break') {
      expect(steps.length).toBeLessThanOrEqual(rows.length);
    } else {
      // All steps safe → must have completed all rows.
      expect(steps.length).toBe(rows.length);
    }
  });

  it('is deterministic for the same seed and rows', () => {
    const rows = generateBridgeRows(mulberry32(7), 8);
    const s1 = simulateAiTurn(rows, mulberry32(3));
    const s2 = simulateAiTurn(rows, mulberry32(3));
    expect(s1).toEqual(s2);
  });
});

describe('Full deterministic simulation', () => {
  it('produces identical results for the same seed and participants', () => {
    function runSimulation(seed: number) {
      const store = makeStore();
      store.dispatch(
        initGlassBridge({
          participantIds: ['a', 'b', 'c', 'd'],
          competitionType: 'HOH',
          seed,
          rowsCount: 6,
        }),
      );

      // AI picks numbers.
      const rng = mulberry32(seed + 100);
      const choices = buildAiNumberChoices(['a', 'b', 'c', 'd'], null, {}, rng);
      for (const [pid, num] of Object.entries(choices)) {
        store.dispatch(recordNumberChoice({ playerId: pid, number: num }));
      }
      store.dispatch(finaliseOrderSelection());
      store.dispatch(startPlaying({ now: T0 }));

      // Simulate all turns using AI decisions.
      const aiStepRng = mulberry32(seed + 9999);
      let gb = store.getState().glassBridge;

      let safetyCounter = 0;
      while (gb.phase === 'playing' && safetyCounter < 200) {
        safetyCounter++;
        const activeId = gb.turnOrder[gb.currentTurnIndex];
        if (!activeId) break;
        const prog = gb.progress[activeId];
        if (!prog || prog.eliminated || prog.finishTimeMs !== undefined) {
          // Player is already done — advance turn index directly without processing a step.
          store.dispatch(advanceTurn());
          gb = store.getState().glassBridge;
          continue;
        }
        const rowIdx = gb.currentPlayerRow - 1;
        if (rowIdx < 0 || rowIdx >= gb.rows.length) break;
        const row = gb.rows[rowIdx];
        const side = aiDecideStep(row, aiStepRng);
        store.dispatch(resolveStep({ chosenSide: side, now: T0 + safetyCounter * 100 }));
        gb = store.getState().glassBridge;
      }

      store.dispatch(completeGame());
      return store.getState().glassBridge;
    }

    const result1 = runSimulation(100);
    const result2 = runSimulation(100);

    expect(result1.placements).toEqual(result2.placements);
    expect(result1.winnerId).toEqual(result2.winnerId);
    expect(result1.eliminationOrder).toEqual(result2.eliminationOrder);
  });
});

describe('Broken tile persistence', () => {
  it('broken tile from player 1 is visible to player 2', () => {
    const store = makeStore();
    store.dispatch(
      initGlassBridge({
        participantIds: ['a', 'b'],
        competitionType: 'HOH',
        seed: 42,
        rowsCount: 4,
      }),
    );
    // Force both to pick specific numbers.
    store.dispatch(recordNumberChoice({ playerId: 'a', number: 1 }));
    store.dispatch(recordNumberChoice({ playerId: 'b', number: 2 }));
    store.dispatch(finaliseOrderSelection());
    store.dispatch(startPlaying({ now: T0 }));

    let gb = store.getState().glassBridge;
    // Player a is first.  Choose the wrong tile on row 1.
    const row0 = gb.rows[0];
    const wrongSide = row0.safeSide === 'left' ? 'right' : 'left';
    store.dispatch(resolveStep({ chosenSide: wrongSide, now: T0 + 1000 }));

    gb = store.getState().glassBridge;
    // Row 0 should have the broken tile.
    if (wrongSide === 'left') {
      expect(gb.rows[0].leftBroken).toBe(true);
    } else {
      expect(gb.rows[0].rightBroken).toBe(true);
    }

    // Player b is now active — they can see the broken tile state.
    expect(gb.turnOrder[gb.currentTurnIndex]).toBe('b');
    // The broken tile state is visible in gb.rows[0].
  });
});
