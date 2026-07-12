import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import glassBridgeReducer, {
  COLLISION_OVERRIDE_THRESHOLD_MS,
  chooseParallelAiSide,
  finaliseOrderSelection,
  initGlassBridge,
  recordNumberChoice,
  resolveParallelStep,
  startParallelPlayers,
  startPlaying,
  shouldStartParallelPlayers,
  type BridgeRow,
} from '../../../src/features/glassBridge/glassBridgeSlice';

const T0 = 1_700_000_000_000;

function startedStore() {
  const store = configureStore({ reducer: { glassBridge: glassBridgeReducer } });
  store.dispatch(initGlassBridge({
    participantIds: ['a', 'b', 'c'],
    competitionType: 'LOH',
    seed: 7,
  }));
  store.dispatch(recordNumberChoice({ playerId: 'a', number: 1 }));
  store.dispatch(recordNumberChoice({ playerId: 'b', number: 2 }));
  store.dispatch(recordNumberChoice({ playerId: 'c', number: 3 }));
  store.dispatch(finaliseOrderSelection());
  store.dispatch(startPlaying({ now: T0 }));
  return store;
}

describe('Glass Bridge low-time parallel play', () => {
  it('starts at one minute, but not above it', () => {
    expect(shouldStartParallelPlayers(60_001)).toBe(false);
    expect(shouldStartParallelPlayers(60_000)).toBe(true);
  });

  it('starts every waiting player without duplicating the current player', () => {
    const store = startedStore();
    const activeId = store.getState().glassBridge.turnOrder[0];
    store.dispatch(startParallelPlayers());
    expect(store.getState().glassBridge.parallelPlayerIds).toEqual(
      store.getState().glassBridge.turnOrder.filter((id) => id !== activeId),
    );
  });

  it('advances a released player independently of the main turn', () => {
    const store = startedStore();
    store.dispatch(startParallelPlayers());
    const before = store.getState().glassBridge;
    const parallelId = before.parallelPlayerIds[0];
    const safeSide = before.rows[0].safeSide;
    store.dispatch(resolveParallelStep({ playerId: parallelId, chosenSide: safeSide, now: T0 + 1_000 }));
    const after = store.getState().glassBridge;
    expect(after.progress[parallelId].furthestRowReached).toBe(1);
    expect(after.currentTurnIndex).toBe(before.currentTurnIndex);
  });

  it('avoids an occupied preferred tile until the final 15 seconds', () => {
    const row: BridgeRow = {
      safeSide: 'left',
      leftBroken: false,
      rightBroken: false,
      revealedSafeSide: 'left',
    };
    expect(chooseParallelAiSide(row, ['left'], 15_000, () => 0)).toBe('right');
    expect(chooseParallelAiSide(
      row,
      ['left'],
      COLLISION_OVERRIDE_THRESHOLD_MS - 1,
      () => 0,
    )).toBe('left');
  });

  it('enforces occupied-tile avoidance when simultaneous steps resolve', () => {
    const store = startedStore();
    store.dispatch(startParallelPlayers());
    const [firstId, secondId] = store.getState().glassBridge.parallelPlayerIds;
    const safeSide = store.getState().glassBridge.rows[0].safeSide;
    store.dispatch(resolveParallelStep({
      playerId: firstId,
      chosenSide: safeSide,
      now: T0 + 1_000,
      remainingMs: 30_000,
    }));
    store.dispatch(resolveParallelStep({
      playerId: secondId,
      chosenSide: safeSide,
      now: T0 + 1_001,
      remainingMs: 30_000,
    }));

    const progress = store.getState().glassBridge.progress;
    expect(progress[firstId].currentSide).toBe(safeSide);
    expect(progress[secondId].currentSide).not.toBe(safeSide);
  });
});
