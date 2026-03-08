/**
 * castleRescueRooms.ts
 *
 * Factory functions for Castle Rescue side-room instances (bonus room, ambush
 * room).  Exported from a non-component file to satisfy the
 * react-refresh/only-export-components lint rule that governs CastleRescueGame.tsx.
 *
 * Types defined here are structurally compatible with the corresponding
 * interfaces in CastleRescueGame.tsx (TypeScript structural typing).
 */

import { makePlatform } from './castleRescueUtils';
import type { PlatformDef } from './castleRescueUtils';

// ── Shared geometry constants (must match CastleRescueGame.tsx) ───────────────

const CH          = 450;   // canvas height
const HUD_H       = 50;    // HUD strip height
const PLAY_H      = CH - HUD_H;          // 400
const GROUND_TOP  = PLAY_H - 32;         // 368
const PIPE_H      = 64;
const PIPE_W      = 48;
const EH          = 28;    // enemy height
const ENEMY_SPD   = 1.8;
const BRICK       = 32;

// ── Types (structurally compatible with CastleRescueGame.tsx locals) ──────────

type Platform = PlatformDef;

interface Brick {
  id: string; x: number; y: number;
  width: number; height: number;
  breakableFromBelow: boolean;
  broken: boolean; bounceTimer: number;
}

interface Coin {
  id: string; x: number; y: number; collected: boolean;
}

interface Enemy {
  id: string; x: number; y: number;
  vx: number; alive: boolean; squishTimer: number;
  patrolLeft: number; patrolRight: number;
}

export interface RoomInstance {
  type: 'bonus' | 'ambush';
  width: number;
  platforms: Platform[];
  bricks: Brick[];
  enemies: Enemy[];
  coins: Coin[];
  exitX: number;
  exitY: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOM_EXIT_PIPE_Y = GROUND_TOP - PIPE_H; // 304

/**
 * Returns the brick top-edge y coordinate that satisfies MIN_CLEARANCE (42 px)
 * above a reference platform at `platformY`.
 */
function brickTop(platformY: number): number {
  return platformY - 42 - BRICK;
}

// ── Room builders ─────────────────────────────────────────────────────────────

/**
 * A cosy treasure room filled with coins and breakable bricks.
 * No enemies — a reward for curious explorers.
 *
 * All elevated platforms are FULL_SOLID (no oneWay flag).
 */
export function buildBonusRoom(): RoomInstance {
  const platforms: Platform[] = [
    makePlatform('', 0,   GROUND_TOP, 800, 32), // ground (full-solid)
    makePlatform('', 100, 280,        130, 16), // elevated platform — full-solid
    makePlatform('', 310, 250,        150, 16), // elevated platform — full-solid
    makePlatform('', 530, 265,        130, 16), // elevated platform — full-solid
  ];
  const brickDefs: [number, number][] = [
    [115, brickTop(280)], [147, brickTop(280)],
    [325, brickTop(250)], [357, brickTop(250)],
    [545, brickTop(265)], [577, brickTop(265)],
  ];
  const bricks: Brick[] = brickDefs.map(([bx, by], i) => ({
    id: `rb-${i}`, x: bx, y: by,
    width: BRICK, height: BRICK,
    breakableFromBelow: true,
    broken: false, bounceTimer: 0,
  }));
  const coinDefs: [number, number][] = [
    [130, brickTop(280) - 2], [162, brickTop(280) - 2],
    [340, brickTop(250) - 2], [372, brickTop(250) - 2], [404, brickTop(250) - 2],
    [560, brickTop(265) - 2], [592, brickTop(265) - 2],
    [140, 265], [340, 235], [560, 250],
  ];
  const coins: Coin[] = coinDefs.map(([cx, cy], i) => ({
    id: `rc-${i}`, x: cx, y: cy, collected: false,
  }));
  return {
    type: 'bonus', width: 800, platforms, bricks, enemies: [], coins,
    exitX: 720, exitY: ROOM_EXIT_PIPE_Y,
  };
}

/**
 * A dark trap room swarming with 5 enemies.
 * Stomp them for points, then escape through the exit pipe.
 *
 * All elevated platforms are FULL_SOLID (no oneWay flag).
 */
export function buildAmbushRoom(): RoomInstance {
  const platforms: Platform[] = [
    makePlatform('', 0,   GROUND_TOP, 800, 32), // ground (full-solid)
    makePlatform('', 200, 295,        110, 16), // elevated platform — full-solid
    makePlatform('', 450, 275,        110, 16), // elevated platform — full-solid
  ];
  const enemies: Enemy[] = [
    { id:'are-0', x:80,  y:GROUND_TOP-EH, vx: ENEMY_SPD,  alive:true, squishTimer:0, patrolLeft:50,  patrolRight:340 },
    { id:'are-1', x:250, y:GROUND_TOP-EH, vx:-ENEMY_SPD,  alive:true, squishTimer:0, patrolLeft:100, patrolRight:420 },
    { id:'are-2', x:420, y:GROUND_TOP-EH, vx: ENEMY_SPD,  alive:true, squishTimer:0, patrolLeft:320, patrolRight:620 },
    { id:'are-3', x:580, y:GROUND_TOP-EH, vx:-ENEMY_SPD,  alive:true, squishTimer:0, patrolLeft:480, patrolRight:730 },
    { id:'are-4', x:215, y:295-EH,        vx: ENEMY_SPD,  alive:true, squishTimer:0, patrolLeft:200, patrolRight:310 },
  ];
  const coins: Coin[] = [
    { id:'arc-0', x:215, y:275, collected:false },
    { id:'arc-1', x:460, y:255, collected:false },
    { id:'arc-2', x:600, y:268, collected:false },
  ];
  return {
    type: 'ambush', width: 800, platforms, bricks: [], enemies, coins,
    exitX: 720, exitY: ROOM_EXIT_PIPE_Y,
  };
}

// Re-export pipe geometry for use by CastleRescueGame.tsx and other callers
export { ROOM_EXIT_PIPE_Y, PIPE_W as ROOM_PIPE_W, PIPE_H as ROOM_PIPE_H };
