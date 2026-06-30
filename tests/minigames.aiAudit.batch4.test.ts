import { describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import tetrisReducer, {
  initTetris,
  setHumanScore,
} from '../src/features/tetris/tetrisSlice';
import { resolveTetrisOutcome } from '../src/features/tetris/thunks';
import { getGame } from '../src/minigames/registry';
import { minigameAiRegistry } from '../src/ai/competition/minigameAiRegistry';

import holdTheWallReducer, {
  AI_DROP_MIN_MS,
  AI_DROP_MAX_MS,
  buildAiDropSchedule,
  dropPlayer,
  startHoldTheWall,
} from '../src/features/holdTheWall/holdTheWallSlice';
import { resolveHoldTheWallOutcome } from '../src/features/holdTheWall/thunks';
import {
  HoldTheWallGameController,
  INITIAL_HOLD_DEADLINE_MS,
} from '../src/games/hold-the-wall/GameController';

function createPhaseGameReducer(initialGamePhase: 'loh_comp' | 'pos_comp') {
  return (
    state = {
      phase: initialGamePhase,
      lohId: null as string | null,
      posWinnerId: null as string | null,
      lastHohCompFinisherId: null as string | null,
    },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      const payload = action.payload as {
        winnerId: string;
        lastPlaceId?: string;
      };
      if (initialGamePhase === 'loh_comp') {
        return {
          ...state,
          lohId: payload.winnerId,
          lastHohCompFinisherId: payload.lastPlaceId ?? null,
          phase: 'loh_results',
        };
      }
      return {
        ...state,
        posWinnerId: payload.winnerId,
        phase: 'pos_results',
      };
    }
    return state;
  };
}

function makeTetrisStore(initialGamePhase = 'loh_comp') {
  return configureStore({
    reducer: { tetris: tetrisReducer, game: createPhaseGameReducer(initialGamePhase) },
  });
}

describe('Tetris audit', () => {
  it('is registered as a reactive, authoritative minigame with AI support', () => {
    expect(getGame('tetris')?.implementation).toBe('react');
    expect(getGame('tetris')?.authoritative).toBe(true);
    expect(minigameAiRegistry['tetris']?.scoreDirection).toBe('higher-is-better');
  });

  it('stores AI scores and computes winner/last place from the full score table', () => {
    const store = makeTetrisStore();
    store.dispatch(
      initTetris({
        participantIds: ['alice', 'bob', 'carol'],
        participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
        humanPlayerId: 'alice',
        competitionType: 'LOH',
        seed: 11,
        aiScores: { bob: 800, carol: 300 },
      }),
    );

    store.dispatch(setHumanScore(1200));
    const state = store.getState().tetris;

    expect(state.phase).toBe('complete');
    expect(state.winnerId).toBe('alice');
    expect(state.lastPlaceId).toBe('carol');
    expect(state.finalScores).toEqual({ bob: 800, carol: 300, alice: 1200 });
  });

  it('treats the lowest score as last place even when the human loses', () => {
    const store = makeTetrisStore();
    store.dispatch(
      initTetris({
        participantIds: ['alice', 'bob', 'carol'],
        participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
        humanPlayerId: 'alice',
        competitionType: 'LOH',
        seed: 12,
        aiScores: { bob: 800, carol: 300 },
      }),
    );

    store.dispatch(setHumanScore(100));
    const state = store.getState().tetris;

    expect(state.winnerId).toBe('bob');
    expect(state.lastPlaceId).toBe('alice');
  });

  it('keeps resolveTetrisOutcome gated by matching game phase and idempotency', () => {
    const store = makeTetrisStore('loh_comp');
    store.dispatch(
      initTetris({
        participantIds: ['alice', 'bob', 'carol'],
        participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
        humanPlayerId: 'alice',
        competitionType: 'LOH',
        seed: 13,
        aiScores: { bob: 800, carol: 300 },
      }),
    );
    store.dispatch(setHumanScore(1200));
    store.dispatch(resolveTetrisOutcome());
    store.dispatch(resolveTetrisOutcome());

    const state = store.getState();
    expect(state.tetris.outcomeResolved).toBe(true);
    expect(state.game.lohId).toBe('alice');
    expect(state.game.lastHohCompFinisherId).toBe('carol');
  });

  it('does not resolve when the competition phase does not match the game phase', () => {
    const store = makeTetrisStore('pos_comp');
    store.dispatch(
      initTetris({
        participantIds: ['alice', 'bob', 'carol'],
        participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
        humanPlayerId: 'alice',
        competitionType: 'LOH',
        seed: 14,
        aiScores: { bob: 800, carol: 300 },
      }),
    );
    store.dispatch(setHumanScore(1200));
    store.dispatch(resolveTetrisOutcome());

    expect(store.getState().tetris.outcomeResolved).toBe(false);
    expect(store.getState().game.lohId).toBeNull();
  });

  it('can award POS results through the same score flow', () => {
    const store = makeTetrisStore('pos_comp');
    store.dispatch(
      initTetris({
        participantIds: ['alice', 'bob', 'carol'],
        participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
        humanPlayerId: 'alice',
        competitionType: 'POS',
        seed: 15,
        aiScores: { bob: 800, carol: 300 },
      }),
    );
    store.dispatch(setHumanScore(1200));
    store.dispatch(resolveTetrisOutcome());

    expect(store.getState().tetris.outcomeResolved).toBe(true);
    expect(store.getState().game.posWinnerId).toBe('alice');
  });
});

describe('Hold the Wall audit', () => {
  it('builds a deterministic AI drop schedule inside the expected range', () => {
    const scheduleA = buildAiDropSchedule(42, ['alice', 'bob', 'carol'], 'alice');
    const scheduleB = buildAiDropSchedule(42, ['alice', 'bob', 'carol'], 'alice');

    expect(scheduleA).toEqual(scheduleB);
    for (const dropMs of Object.values(scheduleA)) {
      expect(dropMs).toBeGreaterThanOrEqual(AI_DROP_MIN_MS);
      expect(dropMs).toBeLessThan(AI_DROP_MAX_MS);
    }
  });

  it('completes as soon as one player remains and records the first drop as last place', () => {
    const store = configureStore({ reducer: { holdTheWall: holdTheWallReducer } });
    store.dispatch(
      startHoldTheWall({
        participantIds: ['alice', 'bob', 'carol'],
        humanId: 'alice',
        prizeType: 'LOH',
        seed: 21,
      }),
    );

    store.dispatch(dropPlayer('bob'));
    store.dispatch(dropPlayer('carol'));

    const state = store.getState().holdTheWall;
    expect(state.status).toBe('complete');
    expect(state.winnerId).toBe('alice');
    expect(state.droppedIds).toEqual(['bob', 'carol']);
  });

  it('keeps the outcome thunk idempotent and phase-gated', () => {
    const htwStore = configureStore({
      reducer: {
        holdTheWall: holdTheWallReducer,
        game: createPhaseGameReducer('loh_comp'),
      },
    });
    htwStore.dispatch(
      startHoldTheWall({
        participantIds: ['p0', 'p1', 'p2'],
        humanId: 'p0',
        prizeType: 'LOH',
        seed: 31,
      }),
    );
    htwStore.dispatch(dropPlayer('p1'));
    htwStore.dispatch(dropPlayer('p2'));
    htwStore.dispatch(resolveHoldTheWallOutcome());
    htwStore.dispatch(resolveHoldTheWallOutcome());

    expect(htwStore.getState().holdTheWall.outcomeResolved).toBe(true);
    expect(htwStore.getState().game.lohId).toBe('p0');
  });

  it('emits the 2-second auto-drop event when the human never holds', () => {
    vi.useFakeTimers();
    const controller = new HoldTheWallGameController('game-1');
    const eliminated: Array<{ playerId: string; reason: string }> = [];
    controller.on('PLAYER_ELIMINATED', (payload) => eliminated.push(payload));

    controller.startRound('alice', INITIAL_HOLD_DEADLINE_MS);
    vi.advanceTimersByTime(INITIAL_HOLD_DEADLINE_MS + 1);

    expect(eliminated).toEqual([{ gameId: 'game-1', playerId: 'alice', reason: 'no_initial_hold' }]);
    controller.destroy();
    vi.useRealTimers();
  });

  it('cancels the auto-drop timer once the human starts holding', () => {
    vi.useFakeTimers();
    const controller = new HoldTheWallGameController('game-2');
    const eliminated: Array<{ playerId: string; reason: string }> = [];
    controller.on('PLAYER_ELIMINATED', (payload) => eliminated.push(payload));

    controller.startRound('alice', INITIAL_HOLD_DEADLINE_MS);
    controller.onPlayerHoldStart();
    vi.advanceTimersByTime(INITIAL_HOLD_DEADLINE_MS + 1);

    expect(eliminated).toEqual([]);
    controller.destroy();
    vi.useRealTimers();
  });
});
