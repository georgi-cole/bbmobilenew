import { describe, expect, it } from 'vitest';

import {
  createInitialRunState,
  finalizeRunState,
  getLiveScore,
  playerHitsBrickFromBelow,
  playerHitsSurfaceFromBelow,
  playerLandsOnSurfaceTop,
  playerOverlapsPipeSide,
  resolveFullSolidCollision,
  startRun,
  tryEnterPipe,
} from '../src/minigames/castleRescue/castleRescueEngine';
import {
  applyPipeEntry,
  computePlatformerFinalScore,
} from '../src/minigames/castleRescue/castleRescuePlatformerLogic';
import {
  areAdjacent,
  cellKey,
  inBounds,
  isConnectedPath,
  makePipe,
  makePlatform,
  posEqual,
  validateAndFixPipeClearance,
} from '../src/minigames/castleRescue/castleRescueUtils';

describe('Castle Rescue rules', () => {
  it('initialises, starts, and finalizes run state safely', () => {
    const initial = createInitialRunState();
    expect(initial.status).toBe('idle');
    expect(initial.outcomeResolved).toBe(false);

    const map = { source: { x: 12, y: 34 } } as Parameters<typeof startRun>[1];
    const started = startRun(initial, map, 1_000);
    expect(started.status).toBe('active');
    expect(started.currentHeadPos).toEqual({ x: 12, y: 34 });

    const secondStart = startRun(started, { source: { x: 1, y: 2 } } as Parameters<typeof startRun>[1], 2_000);
    expect(secondStart.currentHeadPos).toEqual({ x: 12, y: 34 });

    const finalised = finalizeRunState(started, 5_000);
    expect(finalised.status).toBe('complete');
    expect(finalised.outcomeResolved).toBe(true);
    expect(finalised.score).not.toBeNull();
    expect(finalizeRunState(finalised, 6_000)).toBe(finalised);
    expect(getLiveScore(createInitialRunState(), 10_000)).toBeNull();
  });

  it('keeps pipe and grid geometry deterministic', () => {
    const platform = makePlatform('platform', 0, 10, 100, 20, { oneWay: true });
    expect(platform.oneWay).toBe(true);

    const pipe = makePipe('pipe-1', 100, 200, 0, 0, 'correct');
    expect(pipe.width).toBeGreaterThan(0);

    const level = {
      pipes: [pipe],
      platforms: [makePlatform('ceiling', 100, 170, 80, 20)],
    } as Parameters<typeof validateAndFixPipeClearance>[0];
    validateAndFixPipeClearance(level);
    expect(level.platforms[0].y).toBeLessThan(170);

    expect(cellKey({ row: 2, col: 3 })).toBe('2,3');
    expect(posEqual({ row: 2, col: 3 }, { row: 2, col: 3 })).toBe(true);
    expect(areAdjacent({ row: 2, col: 3 }, { row: 2, col: 4 })).toBe(true);
    expect(inBounds({ row: 0, col: 0 })).toBe(true);
    expect(isConnectedPath([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ])).toBe(true);
    expect(isConnectedPath([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ])).toBe(false);
  });

  it('applies pipe-entry and physics helpers according to the rules', () => {
    const state = {
      pipesComplete: 0,
      wrongPipes: 0,
      score: 100,
      pipeFlashType: 'correct',
      pipeFlashTimer: 0,
      phase: 'idle',
      gateOpen: false,
    } as Parameters<typeof applyPipeEntry>[0];

    const correctPipe = { done: false, pipeType: 'correct', routeIndex: 0 } as Parameters<typeof applyPipeEntry>[1];
    expect(applyPipeEntry(state, correctPipe)).toBe('handled');
    expect(state.pipesComplete).toBe(1);
    expect(correctPipe.done).toBe(true);
    expect(state.phase).toBe('pipe_flash');

    const setbackPipe = { done: false, pipeType: 'setback', routeIndex: 1 } as Parameters<typeof applyPipeEntry>[1];
    expect(applyPipeEntry(state, setbackPipe)).toBe('handled');
    expect(state.wrongPipes).toBeGreaterThan(0);
    expect(state.score).toBeLessThan(100);

    const bonusPipe = { done: false, pipeType: 'bonus', routeIndex: 2 } as Parameters<typeof applyPipeEntry>[1];
    expect(applyPipeEntry(state, bonusPipe)).toBe('enter_bonus');

    const ambushPipe = { done: false, pipeType: 'ambush', routeIndex: 2 } as Parameters<typeof applyPipeEntry>[1];
    expect(applyPipeEntry(state, ambushPipe)).toBe('enter_ambush');

    const surface = { x: 0, y: 10, w: 100, h: 10 };
    expect(playerLandsOnSurfaceTop({ x: 10, y: 0, w: 10, h: 10 }, 0, 3, surface)).toBe(true);
    expect(playerHitsSurfaceFromBelow({ x: 10, y: 15, w: 10, h: 10 }, 25, -3, surface)).toBe(true);
    expect(playerOverlapsPipeSide({ x: 5, y: 10, w: 10, h: 10 }, 0, 0, 20, 20)).toBe(true);
    expect(tryEnterPipe(20, 94, 10, 10, true, 0, true, 10, 104, 40)).toBe(true);

    const collision = resolveFullSolidCollision(
      { x: 5, y: 15, w: 10, h: 10 },
      5,
      0,
      0,
      15,
      { x: 0, y: 20, w: 100, h: 10 },
    );
    expect(collision.onGround).toBe(true);
    expect(collision.y).toBe(10);

    expect(
      playerHitsBrickFromBelow(
        { x: 10, y: 110, w: 10, h: 10 },
        118,
        -3,
        0,
        100,
        40,
        20,
        true,
        false,
      ),
    ).toBe(true);
  });

  it('keeps the platformer score helpers monotonic and idempotent', () => {
    const base = computePlatformerFinalScore({ score: 100, princessRescued: false }, 10_000);
    const rescued = computePlatformerFinalScore({ score: 100, princessRescued: true }, 10_000);

    expect(base).toBeGreaterThanOrEqual(0);
    expect(rescued).toBeGreaterThanOrEqual(base);

    const liveIdle = getLiveScore(createInitialRunState(), 10_000);
    expect(liveIdle).toBeNull();
  });
});