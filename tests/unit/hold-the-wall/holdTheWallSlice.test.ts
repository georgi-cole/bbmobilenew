/**
 * Unit tests: holdTheWallSlice state machine and AI drop schedule.
 *
 * Verifies that:
 *  1. Initial state is idle.
 *  2. startHoldTheWall transitions to active and computes a deterministic
 *     AI drop schedule.
 *  3. dropPlayer eliminates a player and transitions to complete when one
 *     player remains.
 *  4. dropPlayer is idempotent — dropping the same player twice is a no-op.
 *  5. outcomeResolved / markHoldTheWallOutcomeResolved idempotency.
 *  6. resetHoldTheWall returns to initial state.
 *  7. buildAiDropSchedule produces consistent values for the same seed.
 *  8. Human player is excluded from the AI drop schedule.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import holdTheWallReducer, {
  startHoldTheWall,
  dropPlayer,
  markHoldTheWallOutcomeResolved,
  resetHoldTheWall,
  buildAiDropSchedule,
  AI_DROP_MIN_MS,
  AI_DROP_MAX_MS,
} from '../../../src/features/holdTheWall/holdTheWallSlice';

function makeStore() {
  return configureStore({ reducer: { holdTheWall: holdTheWallReducer } });
}

describe('holdTheWallSlice — initial state', () => {
  it('status is idle', () => {
    const store = makeStore();
    expect(store.getState().holdTheWall.status).toBe('idle');
  });

  it('outcomeResolved is false', () => {
    const store = makeStore();
    expect(store.getState().holdTheWall.outcomeResolved).toBe(false);
  });
});

describe('holdTheWallSlice — startHoldTheWall', () => {
  it('transitions status to active', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 42,
      }),
    );
    expect(store.getState().holdTheWall.status).toBe('active');
  });

  it('stores participantIds', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 42,
      }),
    );
    expect(store.getState().holdTheWall.participantIds).toEqual(['human', 'ai1', 'ai2']);
  });

  it('creates aiDropSchedule for AI players only (not human)', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 42,
      }),
    );
    const { aiDropSchedule } = store.getState().holdTheWall;
    expect('human' in aiDropSchedule).toBe(false);
    expect('ai1' in aiDropSchedule).toBe(true);
    expect('ai2' in aiDropSchedule).toBe(true);
  });

  it('resets droppedIds and winnerId', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(dropPlayer('ai1'));
    // Now restart
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 2,
      }),
    );
    const state = store.getState().holdTheWall;
    expect(state.droppedIds).toEqual([]);
    expect(state.winnerId).toBeNull();
    expect(state.outcomeResolved).toBe(false);
  });
});

describe('holdTheWallSlice — dropPlayer', () => {
  it('adds player to droppedIds', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(dropPlayer('ai1'));
    expect(store.getState().holdTheWall.droppedIds).toContain('ai1');
  });

  it('transitions to complete and sets winnerId when one player remains', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(dropPlayer('ai1'));
    const state = store.getState().holdTheWall;
    expect(state.status).toBe('complete');
    expect(state.winnerId).toBe('human');
  });

  it('does not transition until only one player remains', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(dropPlayer('ai1'));
    expect(store.getState().holdTheWall.status).toBe('active');
    store.dispatch(dropPlayer('ai2'));
    expect(store.getState().holdTheWall.status).toBe('complete');
    expect(store.getState().holdTheWall.winnerId).toBe('human');
  });

  it('is idempotent — dropping the same player twice does not double-add', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(dropPlayer('ai1'));
    store.dispatch(dropPlayer('ai1'));
    const dropped = store.getState().holdTheWall.droppedIds;
    expect(dropped.filter((id) => id === 'ai1').length).toBe(1);
  });

  it('is a no-op when status is not active', () => {
    const store = makeStore();
    // idle state
    store.dispatch(dropPlayer('nobody'));
    expect(store.getState().holdTheWall.droppedIds).toEqual([]);
  });

  it('human wins when all AI drop', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2', 'ai3'],
        humanId: 'human',
        prizeType: 'POV',
        seed: 999,
      }),
    );
    store.dispatch(dropPlayer('ai1'));
    store.dispatch(dropPlayer('ai2'));
    store.dispatch(dropPlayer('ai3'));
    const state = store.getState().holdTheWall;
    expect(state.status).toBe('complete');
    expect(state.winnerId).toBe('human');
  });

  it('AI wins when human drops first and only one AI remains', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1', 'ai2'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(dropPlayer('human'));
    store.dispatch(dropPlayer('ai1'));
    const state = store.getState().holdTheWall;
    expect(state.status).toBe('complete');
    expect(state.winnerId).toBe('ai2');
  });
});

describe('holdTheWallSlice — outcomeResolved idempotency', () => {
  it('markHoldTheWallOutcomeResolved sets outcomeResolved to true', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(markHoldTheWallOutcomeResolved());
    expect(store.getState().holdTheWall.outcomeResolved).toBe(true);
  });

  it('resetHoldTheWall resets outcomeResolved to false', () => {
    const store = makeStore();
    store.dispatch(markHoldTheWallOutcomeResolved());
    store.dispatch(resetHoldTheWall());
    expect(store.getState().holdTheWall.outcomeResolved).toBe(false);
  });
});

describe('holdTheWallSlice — resetHoldTheWall', () => {
  it('returns status to idle', () => {
    const store = makeStore();
    store.dispatch(
      startHoldTheWall({
        participantIds: ['human', 'ai1'],
        humanId: 'human',
        prizeType: 'HOH',
        seed: 1,
      }),
    );
    store.dispatch(resetHoldTheWall());
    expect(store.getState().holdTheWall.status).toBe('idle');
  });
});

describe('buildAiDropSchedule', () => {
  it('is deterministic — same seed produces same schedule', () => {
    const a = buildAiDropSchedule(42, ['human', 'ai1', 'ai2'], 'human');
    const b = buildAiDropSchedule(42, ['human', 'ai1', 'ai2'], 'human');
    expect(a).toEqual(b);
  });

  it('different seeds produce different schedules', () => {
    const a = buildAiDropSchedule(1, ['human', 'ai1', 'ai2'], 'human');
    const b = buildAiDropSchedule(2, ['human', 'ai1', 'ai2'], 'human');
    // Extremely unlikely to be equal with different seeds
    expect(a.ai1 !== b.ai1 || a.ai2 !== b.ai2).toBe(true);
  });

  it('all AI drop times are within [AI_DROP_MIN_MS, AI_DROP_MAX_MS)', () => {
    const schedule = buildAiDropSchedule(99, ['h', 'ai1', 'ai2', 'ai3', 'ai4'], 'h');
    for (const ms of Object.values(schedule)) {
      expect(ms).toBeGreaterThanOrEqual(AI_DROP_MIN_MS);
      expect(ms).toBeLessThan(AI_DROP_MAX_MS);
    }
  });

  it('excludes the human player', () => {
    const schedule = buildAiDropSchedule(7, ['human', 'ai1'], 'human');
    expect('human' in schedule).toBe(false);
    expect('ai1' in schedule).toBe(true);
  });

  it('includes all participants when humanId is null', () => {
    const schedule = buildAiDropSchedule(7, ['p1', 'p2', 'p3'], null);
    expect(Object.keys(schedule)).toHaveLength(3);
  });
});
