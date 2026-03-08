/**
 * tests/unit/castle-rescue/subroom.test.ts
 *
 * Unit tests for Castle Rescue subroom platform solidity, pipe clearance
 * validation, and the factory helpers in castleRescueUtils.ts.
 *
 * Tested:
 *  - buildBonusRoom()  : elevated platforms must be FULL_SOLID (oneWay !== true)
 *  - buildAmbushRoom() : elevated platforms must be FULL_SOLID (oneWay !== true)
 *  - resolveFullSolidCollision prevents upward passage through room platforms
 *  - validateAndFixPipeClearance adjusts platform y when clearance is insufficient
 *  - makePlatform factory defaults to FULL_SOLID (no oneWay)
 *  - makePipe factory produces correct PipeDef with FULL_SOLID defaults
 */

import { describe, it, expect } from 'vitest';
import { buildBonusRoom, buildAmbushRoom } from '../../../src/minigames/castleRescue/castleRescueRooms';
import { resolveFullSolidCollision } from '../../../src/minigames/castleRescue/castleRescueEngine';
import type { CollisionRect } from '../../../src/minigames/castleRescue/castleRescueEngine';
import {
  makePlatform,
  makePipe,
  validateAndFixPipeClearance,
  REQUIRED_PIPE_CLEARANCE,
  PIPE_WIDTH,
  PIPE_HEIGHT,
} from '../../../src/minigames/castleRescue/castleRescueUtils';
import type { PlatformDef, PipeDef, LevelGeomDef } from '../../../src/minigames/castleRescue/castleRescueUtils';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PW = 28;
const PH = 40;

function player(x: number, y: number): CollisionRect {
  return { x, y, w: PW, h: PH };
}

// ─────────────────────────────────────────────────────────────────────────────
// makePlatform factory
// ─────────────────────────────────────────────────────────────────────────────
describe('makePlatform factory', () => {
  it('returns a platform with correct coordinates', () => {
    const p = makePlatform('', 10, 20, 100, 16);
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    expect(p.w).toBe(100);
    expect(p.h).toBe(16);
  });

  it('oneWay is undefined (not set) when options are omitted — platform is FULL_SOLID', () => {
    const p = makePlatform('', 0, 0, 100, 16);
    expect(p.oneWay).toBeUndefined();
  });

  it('sets oneWay:true only when explicitly requested', () => {
    const p = makePlatform('', 0, 0, 100, 16, { oneWay: true });
    expect(p.oneWay).toBe(true);
  });

  it('does NOT set oneWay when options.oneWay is false (same as omitting it)', () => {
    // Passing false explicitly should behave the same as omitting oneWay entirely.
    const p = makePlatform('', 0, 0, 100, 16, { oneWay: false });
    expect(p.oneWay).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// makePipe factory
// ─────────────────────────────────────────────────────────────────────────────
describe('makePipe factory', () => {
  it('returns a pipe with correct geometry', () => {
    const pipe = makePipe('p0', 100, 304, 0, -1, 'setback');
    expect(pipe.id).toBe('p0');
    expect(pipe.x).toBe(100);
    expect(pipe.y).toBe(304);
    expect(pipe.width).toBe(PIPE_WIDTH);
    expect(pipe.height).toBe(PIPE_HEIGHT);
    expect(pipe.entryZoneWidth).toBe(PIPE_WIDTH);
  });

  it('sets done:false by default (FULL_SOLID, re-enterable until done)', () => {
    const pipe = makePipe('p1', 0, 0, 0, -1, 'bonus');
    expect(pipe.done).toBe(false);
  });

  it('accepts a custom entryZoneWidth', () => {
    const pipe = makePipe('p2', 0, 0, 1, 0, 'correct', 32);
    expect(pipe.entryZoneWidth).toBe(32);
  });

  it('stores slotIndex and routeIndex', () => {
    const pipe = makePipe('p3', 0, 0, 3, 1, 'correct');
    expect(pipe.slotIndex).toBe(3);
    expect(pipe.routeIndex).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildBonusRoom — elevated platforms are FULL_SOLID
// ─────────────────────────────────────────────────────────────────────────────
describe('buildBonusRoom — subroom platform solidity', () => {
  const room = buildBonusRoom();

  it('has at least one elevated platform (index > 0)', () => {
    expect(room.platforms.length).toBeGreaterThan(1);
  });

  it('ground platform (index 0) has no oneWay flag', () => {
    expect(room.platforms[0].oneWay).toBeUndefined();
  });

  it('all elevated platforms are FULL_SOLID (oneWay is not true)', () => {
    for (let i = 1; i < room.platforms.length; i++) {
      expect(room.platforms[i].oneWay).not.toBe(true);
    }
  });

  it('resolveFullSolidCollision blocks a rising player from passing through an elevated platform', () => {
    // Use the first elevated platform (index 1) from the bonus room.
    const plat = room.platforms[1];
    const platRect: CollisionRect = { x: plat.x, y: plat.y, w: plat.w, h: plat.h };

    // Position the player rising upward with head just inside the platform bottom.
    const platBottom = plat.y + plat.h;
    const px = plat.x + 10; // horizontally overlapping
    const py = platBottom - 2; // head just clipped into platform bottom
    const prevY = platBottom + 4; // was below platform bottom last frame

    const p = player(px, py);
    const result = resolveFullSolidCollision(p, px, prevY, 0, -8, platRect);

    // Player should be pushed below the platform (y = platBottom), vy zeroed.
    expect(result.vy).toBe(0);
    expect(result.y).toBe(platBottom);
    expect(result.onGround).toBe(false);
  });

  it('resolveFullSolidCollision allows landing on top of an elevated platform', () => {
    const plat = room.platforms[1];
    const platRect: CollisionRect = { x: plat.x, y: plat.y, w: plat.w, h: plat.h };

    // Player falling, feet just past the platform top.
    const px = plat.x + 10;
    const py = plat.y - PH + 2; // feet at plat.y + 2 — just past top
    const prevY = plat.y - PH - 2; // feet at plat.y - 2 — was above

    const p = player(px, py);
    const result = resolveFullSolidCollision(p, px, prevY, 0, 3, platRect);

    expect(result.onGround).toBe(true);
    expect(result.vy).toBe(0);
    expect(result.y).toBe(plat.y - PH);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildAmbushRoom — elevated platforms are FULL_SOLID
// ─────────────────────────────────────────────────────────────────────────────
describe('buildAmbushRoom — subroom platform solidity', () => {
  const room = buildAmbushRoom();

  it('has at least one elevated platform (index > 0)', () => {
    expect(room.platforms.length).toBeGreaterThan(1);
  });

  it('ground platform (index 0) has no oneWay flag', () => {
    expect(room.platforms[0].oneWay).toBeUndefined();
  });

  it('all elevated platforms are FULL_SOLID (oneWay is not true)', () => {
    for (let i = 1; i < room.platforms.length; i++) {
      expect(room.platforms[i].oneWay).not.toBe(true);
    }
  });

  it('resolveFullSolidCollision blocks upward passage through an elevated platform', () => {
    const plat = room.platforms[1];
    const platRect: CollisionRect = { x: plat.x, y: plat.y, w: plat.w, h: plat.h };

    const platBottom = plat.y + plat.h;
    const px = plat.x + 10;
    const py = platBottom - 2;
    const prevY = platBottom + 4;

    const p = player(px, py);
    const result = resolveFullSolidCollision(p, px, prevY, 0, -8, platRect);

    expect(result.vy).toBe(0);
    expect(result.y).toBe(platBottom);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateAndFixPipeClearance
// ─────────────────────────────────────────────────────────────────────────────
describe('validateAndFixPipeClearance', () => {
  /** Build a minimal test level with one pipe and one platform. */
  function makeTestLevel(
    pipeX: number, pipeY: number,
    platX: number, platY: number, platW: number, platH: number,
  ): LevelGeomDef {
    const pipe: PipeDef = makePipe('test-pipe', pipeX, pipeY, 0, -1, 'setback');
    const plat: PlatformDef = makePlatform('', platX, platY, platW, platH);
    return { pipes: [pipe], platforms: [plat] };
  }

  it('does not modify a platform that already provides sufficient clearance', () => {
    // Platform bottom at pipeY - 50 → clearance = 50 >= 48 ✓
    const pipeY = 304;
    const platY = pipeY - 50 - 16; // bottom = pipeY - 50
    const level = makeTestLevel(400, pipeY, 380, platY, 80, 16);
    const originalY = level.platforms[0].y;

    validateAndFixPipeClearance(level);

    expect(level.platforms[0].y).toBe(originalY);
  });

  it('moves a platform upward when clearance is less than REQUIRED_PIPE_CLEARANCE', () => {
    // Platform bottom at pipeY - 20 → clearance = 20 < 48 → deficit = 28
    const pipeY = 304;
    const platH = 16;
    const platY = pipeY - 20 - platH; // bottom = pipeY - 20
    const level = makeTestLevel(400, pipeY, 380, platY, 80, platH);

    validateAndFixPipeClearance(level);

    const newPlatBottom = level.platforms[0].y + platH;
    const newClearance = pipeY - newPlatBottom;
    expect(newClearance).toBeGreaterThanOrEqual(REQUIRED_PIPE_CLEARANCE);
  });

  it('moves platform by exactly the deficit amount', () => {
    const pipeY = 304;
    const platH = 16;
    const clearanceBefore = 20; // < 48
    const platY = pipeY - clearanceBefore - platH;
    const level = makeTestLevel(400, pipeY, 380, platY, 80, platH);
    const originalPlatY = level.platforms[0].y;
    const expectedDeficit = REQUIRED_PIPE_CLEARANCE - clearanceBefore; // 28

    validateAndFixPipeClearance(level);

    expect(level.platforms[0].y).toBe(originalPlatY - expectedDeficit);
  });

  it('ignores a platform that does not horizontally overlap the pipe', () => {
    // Platform to the left of the pipe with no x-range overlap.
    const pipeX = 400; const pipeY = 304;
    const platX = 100; const platY = pipeY - 20 - 16; // would fail clearance if overlapping
    const level = makeTestLevel(pipeX, pipeY, platX, platY, 50, 16);
    const originalY = level.platforms[0].y;

    validateAndFixPipeClearance(level);

    // Platform should NOT be moved — no horizontal overlap.
    expect(level.platforms[0].y).toBe(originalY);
  });

  it('ignores a platform that is below the pipe top', () => {
    // Platform bottom at pipeY + 10 → below pipe top → not a ceiling.
    const pipeY = 304;
    const platY = pipeY + 10;
    const level = makeTestLevel(400, pipeY, 380, platY, 80, 16);
    const originalY = level.platforms[0].y;

    validateAndFixPipeClearance(level);

    expect(level.platforms[0].y).toBe(originalY);
  });

  it('handles zero clearance (platform bottom exactly at pipe top)', () => {
    const pipeY = 304;
    const platH = 16;
    const platY = pipeY - platH; // bottom = pipeY exactly, clearance = 0
    const level = makeTestLevel(400, pipeY, 380, platY, 80, platH);

    validateAndFixPipeClearance(level);

    const newClearance = pipeY - (level.platforms[0].y + platH);
    expect(newClearance).toBeGreaterThanOrEqual(REQUIRED_PIPE_CLEARANCE);
  });

  it('fixes multiple pipes with independent ceiling platforms', () => {
    const pipeY = 304;
    const platH = 16;

    const pipe1: PipeDef = makePipe('p1', 100, pipeY, 0, -1, 'setback');
    const pipe2: PipeDef = makePipe('p2', 400, pipeY, 1, -1, 'bonus');

    const plat1: PlatformDef = makePlatform('', 80,  pipeY - 20 - platH, 60,  platH); // clearance 20 → fix
    const plat2: PlatformDef = makePlatform('', 380, pipeY - 10 - platH, 60, platH); // clearance 10 → fix

    const level: LevelGeomDef = { pipes: [pipe1, pipe2], platforms: [plat1, plat2] };

    validateAndFixPipeClearance(level);

    expect(pipeY - (plat1.y + platH)).toBeGreaterThanOrEqual(REQUIRED_PIPE_CLEARANCE);
    expect(pipeY - (plat2.y + platH)).toBeGreaterThanOrEqual(REQUIRED_PIPE_CLEARANCE);
  });
});
