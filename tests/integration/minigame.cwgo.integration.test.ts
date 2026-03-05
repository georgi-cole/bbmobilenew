/**
 * CWGO minigame integration smoke test.
 *
 * Verifies:
 *  1. The registry dontGoOver entry uses implementation='react' with no
 *     estimation-game fallback (revert check).
 *  2. MinigameHost correctly routes dontGoOver to the React CWGO component
 *     (routing logic is already covered by tests/minigameHost.cwgo.test.tsx;
 *     here we verify the registry entry that drives that routing).
 *  3. The cwgoCompetitionSlice correctly initialises on startCwgoCompetition:
 *     status transitions to 'mass_input', prizeType/seed/aliveIds are set.
 *  4. Question selection is deterministic — identical seed+round always picks
 *     the same questionIdx.
 *  5. Question selection varies across seeds — different seeds produce
 *     sufficiently varied indices across the question bank.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import cwgoReducer, {
  startCwgoCompetition,
} from '../../src/features/cwgo/cwgoCompetitionSlice';
import { CWGO_QUESTIONS } from '../../src/features/cwgo/cwgoQuestions';
import { getGame } from '../../src/minigames/registry';
import { mulberry32 } from '../../src/store/rng';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { cwgo: cwgoReducer } });
}

/** Replicate the private pickQuestionIdx logic from the slice. */
function pickQuestionIdx(seed: number, round: number): number {
  const rng = mulberry32(((seed ^ (round * 0x9e3779b9)) >>> 0));
  return Math.floor(rng() * CWGO_QUESTIONS.length);
}

// ── Registry wiring ───────────────────────────────────────────────────────────

describe('Registry — dontGoOver entry', () => {
  it('uses implementation="react" (not legacy)', () => {
    const entry = getGame('dontGoOver');
    expect(entry).toBeDefined();
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });

  it('uses reactComponentKey="ClosestWithoutGoingOver"', () => {
    const entry = getGame('dontGoOver');
    expect(entry?.reactComponentKey).toBe('ClosestWithoutGoingOver');
  });

  it('does NOT reference estimation-game.js or any legacy modulePath', () => {
    const entry = getGame('dontGoOver');
    // modulePath must be absent or empty — no estimation fallback allowed
    expect(entry?.modulePath).toBeUndefined();
  });

  it('has authoritative=true and scoringAdapter="authoritative"', () => {
    const entry = getGame('dontGoOver');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
  });
});

// ── Slice initialisation ──────────────────────────────────────────────────────

describe('cwgoCompetitionSlice — startCwgoCompetition', () => {
  it('transitions status to mass_input', () => {
    const store = makeStore();
    store.dispatch(
      startCwgoCompetition({
        participantIds: ['alice', 'bob', 'carol'],
        prizeType: 'HOH',
        seed: 42,
      }),
    );
    expect(store.getState().cwgo.status).toBe('mass_input');
  });

  it('stores prizeType and seed', () => {
    const store = makeStore();
    store.dispatch(
      startCwgoCompetition({
        participantIds: ['p1', 'p2'],
        prizeType: 'POV',
        seed: 999,
      }),
    );
    const { cwgo } = store.getState();
    expect(cwgo.prizeType).toBe('POV');
    expect(cwgo.seed).toBe(999);
  });

  it('initialises aliveIds from participantIds', () => {
    const store = makeStore();
    const ids = ['alice', 'bob', 'carol', 'dave'];
    store.dispatch(startCwgoCompetition({ participantIds: ids, prizeType: 'HOH', seed: 1 }));
    expect(store.getState().cwgo.aliveIds).toEqual(ids);
  });

  it('resets guesses, revealResults, and duelPair', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['a', 'b'], prizeType: 'HOH', seed: 7 }));
    const { cwgo } = store.getState();
    expect(cwgo.guesses).toEqual({});
    expect(cwgo.revealResults).toHaveLength(0);
    expect(cwgo.duelPair).toBeNull();
  });

  it('sets a valid questionIdx within CWGO_QUESTIONS bounds', () => {
    const store = makeStore();
    store.dispatch(startCwgoCompetition({ participantIds: ['x'], prizeType: 'HOH', seed: 123 }));
    const { questionIdx } = store.getState().cwgo;
    expect(questionIdx).toBeGreaterThanOrEqual(0);
    expect(questionIdx).toBeLessThan(CWGO_QUESTIONS.length);
  });
});

// ── Question bank ─────────────────────────────────────────────────────────────

describe('CWGO question bank', () => {
  it('contains at least 30 questions', () => {
    expect(CWGO_QUESTIONS.length).toBeGreaterThanOrEqual(30);
  });

  it('every question has a numeric answer, prompt, id and difficulty', () => {
    for (const q of CWGO_QUESTIONS) {
      expect(typeof q.id).toBe('string');
      expect(typeof q.prompt).toBe('string');
      expect(typeof q.answer).toBe('number');
      expect([1, 2, 3, 4, 5]).toContain(q.difficulty);
    }
  });

  it('no duplicate question ids', () => {
    const ids = CWGO_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Question selection determinism ────────────────────────────────────────────

describe('Question selection — determinism', () => {
  it('same seed and round always picks the same questionIdx', () => {
    for (const seed of [0, 1, 42, 1337, 0xdeadbeef]) {
      for (const round of [0, 1, 2, 5]) {
        const a = pickQuestionIdx(seed, round);
        const b = pickQuestionIdx(seed, round);
        expect(a).toBe(b);
      }
    }
  });

  it('different seeds usually produce different question indices', () => {
    const indices = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      indices.add(pickQuestionIdx(seed, 0));
    }
    // With 50 different seeds and 32 questions we expect at least 10 unique picks
    expect(indices.size).toBeGreaterThan(10);
  });

  it('different rounds from the same seed usually produce different question indices', () => {
    const seed = 42;
    const indices = new Set<number>();
    for (let round = 0; round < 20; round++) {
      indices.add(pickQuestionIdx(seed, round));
    }
    // Across 20 rounds we expect at least 5 unique questions
    expect(indices.size).toBeGreaterThan(5);
  });

  it('all returned indices are within the valid question bank range', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (let round = 0; round < 10; round++) {
        const idx = pickQuestionIdx(seed, round);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(CWGO_QUESTIONS.length);
      }
    }
  });
});
