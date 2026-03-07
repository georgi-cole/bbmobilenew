/**
 * CastleRescueGame.tsx
 *
 * Real-time side-scrolling platformer minigame.
 *
 * The player controls a knight navigating a 4-section castle level.  Six
 * physical pipe objects are placed in the world; three of them form a
 * secret route (determined by the seed).  Entering all three correct pipes
 * in sequence (I → II → III) opens a gate to the princess chamber.
 * Rescue her before the 2:30 timer expires.
 *
 * Controls
 * ─────────────────────────────────────────────────────────────────────────
 *  Move:        Arrow Left/Right  or  A/D
 *  Jump:        Arrow Up  or  W / Space / Z
 *  Enter pipe:  Arrow Down  or  S  (when standing at a pipe entrance)
 *
 * Scoring
 * ─────────────────────────────────────────────────────────────────────────
 *  Enemy stomped:    +20       Wrong pipe:       −100
 *  Brick broken:      +5       Enemy hit/pit:     −50
 *  Coin collected:   +25       Time penalty:  −10/s
 *  Checkpoint found: +50
 *  Princess rescued: +1000
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { generateLevelConfig } from './castleRescueGenerator';
import type { WrongPipeType } from './castleRescueGenerator';
import {
  playerLandsOnSurfaceTop,
  playerHitsSurfaceFromBelow,
  playerOverlapsPipeSide,
  tryEnterPipe,
  playerHitsBrickFromBelow,
} from './castleRescueEngine';
import type { CollisionRect } from './castleRescueEngine';
import {
  TIME_LIMIT_MS,
  SCORE_ENEMY   as S_ENEMY,
  SCORE_BRICK   as S_BRICK,
  SCORE_COIN    as S_COIN,
  SCORE_CHECKPOINT as S_CHECKPOINT,
  SCORE_RESCUE  as RESCUE_BONUS,
  PENALTY_DEATH as P_DEATH,
  RESPAWN_PENALTY as P_WRONG_PIPE,
  TIME_PENALTY_PER_SECOND as TIME_PEN,
} from './castleRescueConstants';

// ═══ Canvas geometry ══════════════════════════════════════════════════════════
const CW = 800;           // canvas width
const CH = 450;           // canvas height
const HUD_H = 50;         // HUD strip at top
const PLAY_H = CH - HUD_H; // 400 — game viewport height
const GROUND_TOP = PLAY_H - 32; // 368 — top surface of ground

// ═══ Physics ═════════════════════════════════════════════════════════════════
const GRAVITY   = 0.55;
const MAX_FALL  = 16;
const JUMP_VY   = -13.5;
const WALK      = 4.5;
const ENEMY_SPD = 1.8;

// ═══ Entity dimensions ════════════════════════════════════════════════════════
const PW = 28;  // player width
const PH = 40;  // player height
const EW = 28;  // enemy width
const EH = 28;  // enemy height
const PIPE_W = 48;
const PIPE_H = 64;
const BRICK = 32;
const COIN_R = 7;

// ═══ Game timing / feedback constants ════════════════════════════════════════
const MAX_HEARTS       =    3;
const INVINCIBLE_MS    = 1500;
const PIPE_FLASH_MS    =  700;
const DEATH_PAUSE_MS   =  900;
/** Short pause before respawning after a pit fall (no enemy death animation needed). */
const PIT_DEATH_PAUSE_MS = 200;

// ═══ Types ════════════════════════════════════════════════════════════════════
type PipeType = 'correct' | WrongPipeType; // 'correct' | 'setback' | 'bonus' | 'ambush' | 'dead'
type Phase = 'idle' | 'playing' | 'pipe_flash' | 'death_pause' | 'complete';

interface Rect { x: number; y: number; w: number; h: number; }

/**
 * A platform surface.  oneWay controls collision behaviour:
 *  - false (default) = full-solid: blocks from both above and below.
 *  - true            = one-way: only blocks when the player falls onto the top.
 */
interface Platform extends Rect { oneWay?: boolean; }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

interface Player {
  x: number; y: number;
  vx: number; vy: number;
  onGround: boolean;
  facingRight: boolean;
  invincibleUntil: number;
}

interface Enemy {
  id: string;
  x: number; y: number;
  vx: number;
  alive: boolean;
  squishTimer: number;
  patrolLeft: number; patrolRight: number;
}

interface Brick {
  id: string;
  x: number; y: number;
  /** Brick logical width (default = BRICK constant). */
  width: number;
  /** Brick logical height (default = BRICK constant). */
  height: number;
  /** When true a head-hit from below breaks this brick and awards score. */
  breakableFromBelow: boolean;
  broken: boolean;
  bounceTimer: number;
}

interface Coin {
  id: string; x: number; y: number; collected: boolean;
}

interface Pipe {
  id: string;
  x: number; y: number;
  /** Pipe collision width. */
  width: number;
  /** Pipe collision height. */
  height: number;
  /** Horizontal width of the centred entry zone at the pipe top. */
  entryZoneWidth: number;
  slotIndex: number;
  routeIndex: number; // 0/1/2 if this is correct pipe I/II/III; -1 if wrong
  pipeType: PipeType; // what happens when the player enters this pipe
  done: boolean;      // player has already used this pipe (prevents re-entry)
}

interface Checkpoint {
  id: string;
  x: number; y: number;
  activated: boolean;
  respawnX: number; respawnY: number;
}

/**
 * Geometry and entity state for a side room the player can enter via a pipe.
 * While `GameState.room` is non-null, physics and rendering use the room
 * geometry instead of the main level.  Exiting via the room's exit pipe
 * returns the player to the main level at their last spawn position.
 */
interface RoomInstance {
  type: 'bonus' | 'ambush';
  width: number;            // room width in pixels (≤ CW → no horizontal scroll)
  platforms: Platform[];    // includes the ground as index 0
  bricks: Brick[];
  enemies: Enemy[];
  coins: Coin[];
  exitX: number;            // left edge of the exit pipe in room coordinates
  exitY: number;            // top edge of the exit pipe
}

interface LevelGeom {
  width: number;
  platforms: Platform[];  // includes the ground as first entry
  bricks: Brick[];
  enemies: Enemy[];
  pipes: Pipe[];
  coins: Coin[];
  checkpoints: Checkpoint[];
  princessX: number; princessY: number;
  gateX: number;
}

interface GameState {
  phase: Phase;
  player: Player;
  geom: LevelGeom;
  camera: number;         // camera left-x pixel
  score: number;          // running in-game bonus score
  hearts: number;
  pipesComplete: number;  // 0..3
  wrongPipes: number;     // for competition ranking
  startTime: number;      // performance.now()
  finalElapsedMs: number; // set when game ends; 0 while running
  spawnX: number; spawnY: number;
  pipeFlashTimer: number;
  /** Determines flash colour/message; only meaningful during 'pipe_flash' phase. */
  pipeFlashType: 'correct' | 'setback' | 'dead';
  deathPauseTimer: number;
  princessRescued: boolean;
  gateOpen: boolean;
  finalScore: number;
  /** Non-null while the player is inside a bonus or ambush side-room. */
  room: RoomInstance | null;
}

// ═══ mulberry32 RNG (inline to keep component self-contained) ═════════════════
function rng32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ═══ Room builders ════════════════════════════════════════════════════════════
// Rooms are ≤ CW (800 px) wide so the camera is always fixed at x=0 inside them.
const ROOM_EXIT_PIPE_Y = GROUND_TOP - PIPE_H; // same pipe-top y as the main level

/**
 * A cosy treasure room filled with coins and breakable bricks.
 * No enemies — a reward for curious explorers.
 */
function buildBonusRoom(): RoomInstance {
  const platforms: Platform[] = [
    { x: 0,   y: GROUND_TOP, w: 800, h: 32 }, // ground (full-solid by default)
    { x: 100, y: 280,        w: 130, h: 16, oneWay: true },
    { x: 310, y: 250,        w: 150, h: 16, oneWay: true },
    { x: 530, y: 265,        w: 130, h: 16, oneWay: true },
  ];
  // Bricks raised 8 px above platform surfaces so there is visible air-gap
  // below them (player can stand under them and jump to hit from below).
  const brickDefs: [number, number][] = [
    [115, 240], [147, 240],   // above platform 1 (y=280) — 8 px gap
    [325, 210], [357, 210],   // above platform 2 (y=250) — 8 px gap
    [545, 225], [577, 225],   // above platform 3 (y=265) — 8 px gap
  ];
  const bricks: Brick[] = brickDefs.map(([bx, by], i) => ({
    id: `rb-${i}`, x: bx, y: by,
    width: BRICK, height: BRICK,
    breakableFromBelow: true,
    broken: false, bounceTimer: 0,
  }));
  const coinDefs: [number, number][] = [
    [130, 238], [162, 238],               // above platform-1 bricks
    [340, 208], [372, 208], [404, 208],   // above platform-2 bricks
    [560, 223], [592, 223],               // above platform-3 bricks
    [140, 265], [340, 235], [560, 250],   // on platform surfaces
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
 */
function buildAmbushRoom(): RoomInstance {
  const platforms: Platform[] = [
    { x: 0,   y: GROUND_TOP, w: 800, h: 32 }, // ground (full-solid by default)
    { x: 200, y: 295,        w: 110, h: 16, oneWay: true },
    { x: 450, y: 275,        w: 110, h: 16, oneWay: true },
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

// ═══ Level builder ════════════════════════════════════════════════════════════
function buildLevel(seed: number): LevelGeom {
  const config = generateLevelConfig(seed);
  const rand   = rng32((seed ^ 0xDEADBEEF) >>> 0); // separate RNG for enemy variation

  // Six fixed pipe-slot positions [x, y=pipe-top]
  const PIPE_GY = GROUND_TOP - PIPE_H; // 304
  const SLOTS: [number, number][] = [
    [490,  PIPE_GY],   // 0 — Entrance Hall
    [860,  PIPE_GY],   // 1 — Entrance Hall
    [1400, PIPE_GY],   // 2 — Mid Castle
    [1810, PIPE_GY],   // 3 — Mid Castle
    [2760, PIPE_GY],   // 4 — Underground
    [3110, PIPE_GY],   // 5 — Underground
  ];

  const pipes: Pipe[] = SLOTS.map(([px, py], idx) => {
    const routeIndex = config.correctPipeSlots.indexOf(idx);
    const pipeType: PipeType = routeIndex >= 0 ? 'correct' : config.wrongPipeTypes[idx];
    return {
      id: `pipe-${idx}`,
      x: px, y: py,
      width: PIPE_W, height: PIPE_H,
      entryZoneWidth: PIPE_W,  // full pipe width is enterable
      slotIndex: idx,
      routeIndex,
      pipeType,
      done: false,
    };
  });

  // Ground (full-solid) + elevated platforms (one-way from above)
  const platforms: Platform[] = [
    { x: 0,    y: GROUND_TOP, w: 4800, h: 32 }, // ground — full-solid (oneWay omitted/false)
    { x: 200,  y: 270, w: 160, h: 16, oneWay: true },
    { x: 430,  y: 228, w: 180, h: 16, oneWay: true },
    { x: 730,  y: 268, w: 150, h: 16, oneWay: true },
    { x: 950,  y: 248, w: 140, h: 16, oneWay: true },
    { x: 1150, y: 242, w: 200, h: 16, oneWay: true },
    { x: 1380, y: 196, w: 180, h: 16, oneWay: true },
    { x: 1640, y: 244, w: 160, h: 16, oneWay: true },
    { x: 1870, y: 268, w: 180, h: 16, oneWay: true },
    { x: 2080, y: 232, w: 160, h: 16, oneWay: true },
    { x: 2370, y: 280, w: 200, h: 16, oneWay: true },
    { x: 2640, y: 264, w: 180, h: 16, oneWay: true },
    { x: 2900, y: 276, w: 200, h: 16, oneWay: true },
    { x: 3140, y: 260, w: 180, h: 16, oneWay: true },
    { x: 3380, y: 280, w: 180, h: 16, oneWay: true },
    { x: 3600, y: 240, w: 200, h: 16, oneWay: true },
    { x: 3840, y: 268, w: 180, h: 16, oneWay: true },
    { x: 4060, y: 250, w: 180, h: 16, oneWay: true },
    { x: 4300, y: 264, w: 180, h: 16, oneWay: true },
    { x: 4550, y: 248, w: 230, h: 16, oneWay: true },
  ];

  // Bricks raised 8 px above their reference platform so there is a visible
  // air-gap below — the player can stand under them and jump to hit from below.
  const brickDefs: [number, number][] = [
    [218,232],[250,232],[460,188],[492,188],[760,228],
    [1170,204],[1202,204],[1410,156],[1442,156],[1660,204],
    [2100,192],[2132,192],[2400,240],[2432,240],[2660,224],
    [2692,224],[2930,236],[3162,220],[3622,200],[3654,200],[4080,210],
  ];
  const bricks: Brick[] = brickDefs.map(([bx, by], i) => ({
    id: `brick-${i}`, x: bx, y: by,
    width: BRICK, height: BRICK,
    breakableFromBelow: true,
    broken: false, bounceTimer: 0,
  }));

  // Enemy patrol definitions: [left, right, y, speed-sign]
  type EDef = [number, number, number, number];
  const eDefs: EDef[] = [
    [150, 330,  GROUND_TOP-EH,  1],
    [560, 750,  GROUND_TOP-EH, -1],
    [1180,1360, GROUND_TOP-EH,  1],
    [1440,1600, GROUND_TOP-EH, -1],
    [1720,1880, GROUND_TOP-EH,  1],
    [2100,2280, GROUND_TOP-EH, -1],
    [2440,2620, GROUND_TOP-EH,  1],
    [2800,2980, GROUND_TOP-EH, -1],
    [3220,3400, GROUND_TOP-EH,  1],
    [3650,3830, GROUND_TOP-EH, -1],
    [4130,4310, GROUND_TOP-EH,  1],
    [4570,4720, GROUND_TOP-EH, -1],
  ];
  const enemies: Enemy[] = eDefs.map(([pl, pr, ey, sgn], i) => {
    const startX = pl + Math.floor(rand() * Math.max(1, pr - pl - EW));
    return {
      id: `enemy-${i}`,
      x: startX, y: ey,
      vx: sgn * ENEMY_SPD * (0.85 + rand() * 0.3),
      alive: true, squishTimer: 0,
      patrolLeft: pl, patrolRight: pr,
    };
  });

  const coinDefs: [number, number][] = [
    [230,230],[262,230],[460,172],[492,172],[524,172],[780,228],[812,228],
    [1190,202],[1222,202],[1420,154],[1452,154],[1484,154],[1680,202],
    [2110,190],[2142,190],[2410,238],[2442,238],[2474,238],[2680,222],[2712,222],
    [2940,234],[2972,234],[3172,218],[3204,218],[3640,198],[3672,198],[3704,198],
    [4100,208],[4132,208],[4570,214],[4602,214],[4634,214],
  ];
  const coins: Coin[] = coinDefs.map(([cx,cy], i) => ({
    id: `coin-${i}`, x: cx, y: cy, collected: false,
  }));

  const SPAWN_Y = GROUND_TOP - PH;
  const checkpoints: Checkpoint[] = [
    { id:'cp-0', x:1065, y:GROUND_TOP-60, activated:false, respawnX:80,   respawnY:SPAWN_Y },
    { id:'cp-1', x:2295, y:GROUND_TOP-60, activated:false, respawnX:1075, respawnY:SPAWN_Y },
    { id:'cp-2', x:3510, y:GROUND_TOP-60, activated:false, respawnX:2305, respawnY:SPAWN_Y },
  ];

  return {
    width: 4800,
    platforms, bricks, enemies, pipes, coins, checkpoints,
    princessX: 4670, princessY: SPAWN_Y,
    gateX: 3530,
  };
}

// ═══ Compute final score ══════════════════════════════════════════════════════
// Wrong-pipe penalties are applied to gs.score as they occur (real-time
// feedback); they must NOT be subtracted again here to avoid double-counting.
// Only the rescue bonus and time penalty are applied at finalisation time.
function computeFinalScore(gs: GameState, elapsedMs: number): number {
  const rescue      = gs.princessRescued ? RESCUE_BONUS : 0;
  const timePenalty = Math.floor(elapsedMs / 1000) * TIME_PEN;
  return Math.max(0, gs.score + rescue - timePenalty);
}

// ═══ Damage player ════════════════════════════════════════════════════════════
function damagePlayer(gs: GameState, now: number, isPit: boolean): void {
  if (!isPit && now < gs.player.invincibleUntil) return;
  gs.hearts = Math.max(0, gs.hearts - 1);
  gs.score  = Math.max(0, gs.score - P_DEATH);
  if (gs.hearts === 0) { gs.hearts = MAX_HEARTS; } // soft reset hearts
  gs.player.invincibleUntil = now + INVINCIBLE_MS;
  // Always move player to spawn so they're safe during the pause
  gs.player.x  = gs.spawnX; gs.player.y  = gs.spawnY;
  gs.player.vx = 0;         gs.player.vy = 0;
  gs.deathPauseTimer = isPit ? PIT_DEATH_PAUSE_MS : DEATH_PAUSE_MS;
  gs.phase = 'death_pause';
}

// ═══ Update game state ════════════════════════════════════════════════════════
function updateGame(
  gs: GameState,
  keys: Set<string>,
  dt: number,
  now: number,
  timeLimitMs: number,
): void {
  // ── Pipe flash transition ─────────────────────────────────────────────────
  if (gs.phase === 'pipe_flash') {
    gs.pipeFlashTimer -= dt;
    if (gs.pipeFlashTimer <= 0) {
      // Setback: teleport to last spawn.  Correct / dead: stay in place.
      if (gs.pipeFlashType === 'setback') {
        gs.player.x = gs.spawnX; gs.player.y = gs.spawnY;
        gs.player.vx = 0;        gs.player.vy = 0;
      }
      gs.phase = 'playing';
    }
    return;
  }

  // ── Death pause ───────────────────────────────────────────────────────────
  if (gs.phase === 'death_pause') {
    gs.deathPauseTimer -= dt;
    if (gs.deathPauseTimer <= 0) gs.phase = 'playing';
    return;
  }

  if (gs.phase !== 'playing') return;

  // ── Timer check ───────────────────────────────────────────────────────────
  const elapsed = now - gs.startTime;
  if (elapsed >= timeLimitMs) {
    gs.finalElapsedMs = elapsed;
    gs.finalScore     = computeFinalScore(gs, elapsed);
    gs.phase = 'complete';
    return;
  }

  // ── Room mode: delegate physics/rendering to the side-room ───────────────
  if (gs.room !== null) {
    updateRoom(gs, keys, dt, now);
    return;
  }

  const sc = dt / 16.667; // frame-rate normalizer (~1.0 at 60 fps)
  const { player, geom } = gs;

  // ── Input ─────────────────────────────────────────────────────────────────
  const goLeft  = keys.has('ArrowLeft')  || keys.has('KeyA');
  const goRight = keys.has('ArrowRight') || keys.has('KeyD');
  const jump    = keys.has('ArrowUp')    || keys.has('KeyW') || keys.has('Space') || keys.has('KeyZ');
  const goDown  = keys.has('ArrowDown')  || keys.has('KeyS');

  player.vx = goLeft ? -WALK : goRight ? WALK : 0;
  if (goLeft)  player.facingRight = false;
  if (goRight) player.facingRight = true;
  if (jump && player.onGround) { player.vy = JUMP_VY; player.onGround = false; }

  // ── Physics ───────────────────────────────────────────────────────────────
  player.vy = Math.min(player.vy + GRAVITY * sc, MAX_FALL);
  const prevY  = player.y;
  player.y    += player.vy * sc;
  player.x     = Math.max(0, Math.min(geom.width - PW, player.x + player.vx * sc));
  player.onGround = false;

  // ── Platform/ground landing ───────────────────────────────────────────────
  const pRect: CollisionRect = { x: player.x, y: player.y, w: PW, h: PH };
  for (const surf of geom.platforms) {
    const sRect: CollisionRect = { x: surf.x, y: surf.y, w: surf.w, h: surf.h };
    // Land on top (both one-way and full-solid)
    if (playerLandsOnSurfaceTop(pRect, prevY, player.vy, sRect)) {
      player.y = surf.y - PH;
      player.vy = 0;
      player.onGround = true;
      pRect.y = player.y;
    }
    // Block upward motion for full-solid platforms only
    if (!surf.oneWay && playerHitsSurfaceFromBelow(pRect, prevY, player.vy, sRect)) {
      player.y = surf.y + surf.h;
      player.vy = 0;
      pRect.y = player.y;
    }
  }

  // ── Pipe solidity (pipes are full solid — top landing + side block) ───────
  for (const pipe of geom.pipes) {
    const pipeSolidRect: CollisionRect = { x: pipe.x, y: pipe.y, w: pipe.width, h: pipe.height };
    // Land on top of pipe
    if (playerLandsOnSurfaceTop(pRect, prevY, player.vy, pipeSolidRect)) {
      player.y = pipe.y - PH;
      player.vy = 0;
      player.onGround = true;
      pRect.y = player.y;
    }
    // Prevent walking through the pipe sides
    if (playerOverlapsPipeSide(pRect, pipe.x, pipe.y, pipe.width, pipe.height)) {
      // Push player out towards the nearer side
      const fromLeft = (player.x + PW / 2) < (pipe.x + pipe.width / 2);
      if (fromLeft) {
        player.x = pipe.x - PW;
      } else {
        player.x = pipe.x + pipe.width;
      }
      player.vx = 0;
      pRect.x = player.x;
    }
  }

  // ── Brick collisions ──────────────────────────────────────────────────────
  for (const brick of geom.bricks) {
    if (brick.broken) {
      if (brick.bounceTimer > 0) { brick.bounceTimer -= dt; }
      continue;
    }
    const brRect: CollisionRect = { x: brick.x, y: brick.y, w: brick.width, h: brick.height };
    // Land on top
    if (playerLandsOnSurfaceTop(pRect, prevY, player.vy, brRect)) {
      player.y = brick.y - PH; player.vy = 0; player.onGround = true;
      pRect.y = player.y;
    }
    // Head-hit from below → break if breakableFromBelow
    if (playerHitsBrickFromBelow(pRect, prevY, player.vy,
          brick.x, brick.y, brick.width, brick.height,
          brick.breakableFromBelow, brick.broken)) {
      brick.broken = true; brick.bounceTimer = 300;
      gs.score += S_BRICK;
      player.vy = Math.abs(player.vy) * 0.3;
    }
    if (brick.bounceTimer > 0) brick.bounceTimer -= dt;
  }

  // ── Pit death ─────────────────────────────────────────────────────────────
  if (player.y > PLAY_H + 60) { damagePlayer(gs, now, true); return; }

  // ── Enemies ───────────────────────────────────────────────────────────────
  for (const enemy of geom.enemies) {
    if (enemy.squishTimer > 0) { enemy.squishTimer -= dt; continue; }
    if (!enemy.alive) continue;
    enemy.x += enemy.vx * sc;
    if (enemy.x <= enemy.patrolLeft || enemy.x + EW >= enemy.patrolRight) {
      enemy.vx = -enemy.vx;
      enemy.x  = Math.max(enemy.patrolLeft, Math.min(enemy.patrolRight - EW, enemy.x));
    }
    const eR: Rect = { x: enemy.x, y: enemy.y, w: EW, h: EH };
    const pR: Rect = { x: player.x, y: player.y, w: PW, h: PH };
    if (overlaps(pR, eR)) {
      if (player.vy > 0 && player.y + PH < enemy.y + EH * 0.45 + player.vy * sc + 4) {
        enemy.alive = false; enemy.squishTimer = 500;
        gs.score += S_ENEMY; player.vy = -8;
      } else if (now >= player.invincibleUntil) {
        damagePlayer(gs, now, false); return;
      }
    }
  }

  const pR: Rect = { x: player.x, y: player.y, w: PW, h: PH };

  // ── Coins ─────────────────────────────────────────────────────────────────
  for (const coin of geom.coins) {
    if (coin.collected) continue;
    if (overlaps(pR, { x: coin.x-COIN_R, y: coin.y-COIN_R, w: COIN_R*2, h: COIN_R*2 })) {
      coin.collected = true; gs.score += S_COIN;
    }
  }

  // ── Checkpoints ───────────────────────────────────────────────────────────
  for (const cp of geom.checkpoints) {
    if (!cp.activated && overlaps(pR, { x:cp.x, y:cp.y, w:16, h:60 })) {
      cp.activated   = true;
      gs.spawnX      = cp.respawnX;
      gs.spawnY      = cp.respawnY;
      gs.score      += S_CHECKPOINT;
      for (const o of geom.checkpoints) { if (o.id !== cp.id) o.activated = false; }
    }
  }

  // ── Gate collision ────────────────────────────────────────────────────────
  if (!gs.gateOpen) {
    const gx = geom.gateX;
    if (player.x + PW > gx && player.x < gx + 16) {
      player.x  = player.x > gx ? gx + 16 : gx - PW;
      player.vx = 0;
    }
  }

  // ── Pipe entry (main level) — deliberate down + standing on pipe top ──────
  if (goDown) {
    for (const pipe of geom.pipes) {
      if (pipe.done) continue; // already used (correct/bonus/ambush/dead all set done)
      if (!tryEnterPipe(
        player.x, player.y, PW, PH,
        player.onGround, goDown,
        pipe.x, pipe.y, pipe.width, pipe.entryZoneWidth,
      )) continue;

      if (pipe.pipeType === 'correct') {
        if (pipe.routeIndex === gs.pipesComplete) {
          // Correct pipe entered in the right order
          pipe.done = true; gs.pipesComplete++;
          gs.pipeFlashType = 'correct';
          if (gs.pipesComplete === 3) gs.gateOpen = true;
        } else {
          // Correct pipe entered out of order → setback
          gs.wrongPipes++;
          gs.score = Math.max(0, gs.score - P_WRONG_PIPE);
          gs.pipeFlashType = 'setback';
        }
        gs.pipeFlashTimer = PIPE_FLASH_MS;
        gs.phase = 'pipe_flash';

      } else if (pipe.pipeType === 'setback') {
        // Penalise and teleport to last checkpoint (re-enterable — no done flag)
        gs.wrongPipes++;
        gs.score = Math.max(0, gs.score - P_WRONG_PIPE);
        gs.pipeFlashType = 'setback';
        gs.pipeFlashTimer = PIPE_FLASH_MS;
        gs.phase = 'pipe_flash';

      } else if (pipe.pipeType === 'bonus') {
        // Teleport to the bonus treasure room; mark pipe done (one visit only)
        pipe.done = true;
        gs.room = buildBonusRoom();
        gs.player.x = 40; gs.player.y = GROUND_TOP - PH;
        gs.player.vx = 0; gs.player.vy = 0;
        gs.camera = 0;

      } else if (pipe.pipeType === 'ambush') {
        // Teleport to the ambush trap room; mark pipe done (one visit only)
        pipe.done = true;
        gs.room = buildAmbushRoom();
        gs.player.x = 40; gs.player.y = GROUND_TOP - PH;
        gs.player.vx = 0; gs.player.vy = 0;
        gs.camera = 0;

      } else {
        // dead pipe: brief visual animation, player stays in place, no progress
        pipe.done = true;
        gs.pipeFlashType = 'dead';
        gs.pipeFlashTimer = PIPE_FLASH_MS;
        gs.phase = 'pipe_flash';
      }
      return;
    }
  }

  // ── Princess rescue ───────────────────────────────────────────────────────
  if (!gs.princessRescued) {
    if (overlaps(pR, { x:geom.princessX, y:geom.princessY, w:PW, h:PH })) {
      gs.princessRescued = true;
      const el = now - gs.startTime;
      gs.finalElapsedMs = el;
      gs.finalScore     = computeFinalScore(gs, el);
      gs.phase = 'complete';
      return;
    }
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  gs.camera = Math.max(0, Math.min(geom.width - CW, player.x - CW * 0.4));
}

// ═══ Room update ══════════════════════════════════════════════════════════════
/**
 * Physics, collision, and entity updates for when the player is inside a
 * bonus or ambush side-room.  Mirrors the main-level update logic but uses
 * the room's own geometry.  The timer still ticks in the background.
 */
function updateRoom(gs: GameState, keys: Set<string>, dt: number, now: number): void {
  const room = gs.room;
  if (!room) return;
  const { player } = gs;
  const sc = dt / 16.667;

  const goLeft  = keys.has('ArrowLeft')  || keys.has('KeyA');
  const goRight = keys.has('ArrowRight') || keys.has('KeyD');
  const jump    = keys.has('ArrowUp')    || keys.has('KeyW') || keys.has('Space') || keys.has('KeyZ');
  const goDown  = keys.has('ArrowDown')  || keys.has('KeyS');

  player.vx = goLeft ? -WALK : goRight ? WALK : 0;
  if (goLeft)  player.facingRight = false;
  if (goRight) player.facingRight = true;
  if (jump && player.onGround) { player.vy = JUMP_VY; player.onGround = false; }

  // Physics
  player.vy = Math.min(player.vy + GRAVITY * sc, MAX_FALL);
  const prevY = player.y;
  player.y   += player.vy * sc;
  player.x    = Math.max(0, Math.min(room.width - PW, player.x + player.vx * sc));
  player.onGround = false;

  // Platform / ground collision (room)
  const rPRect: CollisionRect = { x: player.x, y: player.y, w: PW, h: PH };
  for (const surf of room.platforms) {
    const sRect: CollisionRect = { x: surf.x, y: surf.y, w: surf.w, h: surf.h };
    if (playerLandsOnSurfaceTop(rPRect, prevY, player.vy, sRect)) {
      player.y = surf.y - PH; player.vy = 0; player.onGround = true;
      rPRect.y = player.y;
    }
    if (!surf.oneWay && playerHitsSurfaceFromBelow(rPRect, prevY, player.vy, sRect)) {
      player.y = surf.y + surf.h; player.vy = 0;
      rPRect.y = player.y;
    }
  }

  // Brick collisions (room)
  for (const brick of room.bricks) {
    if (brick.broken) { if (brick.bounceTimer > 0) { brick.bounceTimer -= dt; } continue; }
    const brRect: CollisionRect = { x: brick.x, y: brick.y, w: brick.width, h: brick.height };
    if (playerLandsOnSurfaceTop(rPRect, prevY, player.vy, brRect)) {
      player.y = brick.y - PH; player.vy = 0; player.onGround = true;
      rPRect.y = player.y;
    }
    if (playerHitsBrickFromBelow(rPRect, prevY, player.vy,
          brick.x, brick.y, brick.width, brick.height,
          brick.breakableFromBelow, brick.broken)) {
      brick.broken = true; brick.bounceTimer = 300;
      gs.score += S_BRICK; player.vy = Math.abs(player.vy) * 0.3;
    }
    if (brick.bounceTimer > 0) brick.bounceTimer -= dt;
  }

  // Pit death in room → respawn at room entrance with damage
  if (player.y > PLAY_H + 60) {
    gs.score  = Math.max(0, gs.score - P_DEATH);
    gs.hearts = Math.max(0, gs.hearts - 1);
    if (gs.hearts === 0) gs.hearts = MAX_HEARTS;
    player.invincibleUntil = now + INVINCIBLE_MS;
    player.x = 40; player.y = GROUND_TOP - PH; player.vx = 0; player.vy = 0;
    return;
  }

  // Enemies (room)
  const pR: Rect = { x: player.x, y: player.y, w: PW, h: PH };
  for (const enemy of room.enemies) {
    if (enemy.squishTimer > 0) { enemy.squishTimer -= dt; continue; }
    if (!enemy.alive) continue;
    enemy.x += enemy.vx * sc;
    if (enemy.x <= enemy.patrolLeft || enemy.x + EW >= enemy.patrolRight) {
      enemy.vx = -enemy.vx;
      enemy.x  = Math.max(enemy.patrolLeft, Math.min(enemy.patrolRight - EW, enemy.x));
    }
    const eR: Rect = { x: enemy.x, y: enemy.y, w: EW, h: EH };
    if (overlaps(pR, eR)) {
      if (player.vy > 0 && player.y + PH < enemy.y + EH * 0.45 + player.vy * sc + 4) {
        enemy.alive = false; enemy.squishTimer = 500;
        gs.score += S_ENEMY; player.vy = -8;
      } else if (now >= player.invincibleUntil) {
        gs.score  = Math.max(0, gs.score - P_DEATH);
        gs.hearts = Math.max(0, gs.hearts - 1);
        if (gs.hearts === 0) gs.hearts = MAX_HEARTS;
        player.invincibleUntil = now + INVINCIBLE_MS;
        player.x = 40; player.y = GROUND_TOP - PH; player.vx = 0; player.vy = 0;
        return;
      }
    }
  }

  // Coins (room)
  for (const coin of room.coins) {
    if (coin.collected) continue;
    if (overlaps(pR, { x: coin.x-COIN_R, y: coin.y-COIN_R, w: COIN_R*2, h: COIN_R*2 })) {
      coin.collected = true; gs.score += S_COIN;
    }
  }

  // Exit pipe detection — deliberate down + standing on exit pipe top
  if (tryEnterPipe(
    player.x, player.y, PW, PH,
    player.onGround, goDown,
    room.exitX, room.exitY, PIPE_W, PIPE_W,
  )) {
    gs.room = null; // back to main level
    player.x = gs.spawnX; player.y = gs.spawnY; player.vx = 0; player.vy = 0;
    gs.camera = Math.max(0, Math.min(gs.geom.width - CW, gs.spawnX - CW * 0.4));
  }
}

// ═══ Renderer ════════════════════════════════════════════════════════════════
function renderGame(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  now: number,
  timeLimitMs: number,
): void {
  // Delegate to the room renderer while the player is inside a side-room.
  if (gs.room !== null) {
    renderRoom(ctx, gs, now, timeLimitMs);
    return;
  }

  ctx.clearRect(0, 0, CW, CH);

  // Background
  const bg = ctx.createLinearGradient(0, HUD_H, 0, CH);
  bg.addColorStop(0, '#1a1a2e'); bg.addColorStop(1, '#0f1320');
  ctx.fillStyle = bg;
  ctx.fillRect(0, HUD_H, CW, PLAY_H);

  // Parallax castle silhouettes
  ctx.fillStyle = '#16213e';
  for (let i = 0; i < 6; i++) {
    const bx = ((i * 220 - gs.camera * 0.25) % (CW + 220) + CW + 220) % (CW + 220) - 220;
    ctx.fillRect(bx, HUD_H + 120, 60, 250);
    ctx.fillRect(bx + 20, HUD_H + 80, 20, 45);
    ctx.fillRect(bx - 10, HUD_H + 135, 10, 235);
    ctx.fillRect(bx + 65, HUD_H + 135, 10, 235);
  }

  // World transform (camera)
  ctx.save();
  ctx.translate(Math.round(-gs.camera), HUD_H);

  // Ground
  const [gnd] = gs.geom.platforms;
  ctx.fillStyle = '#5c3d20';
  ctx.fillRect(gnd.x, gnd.y, gnd.w, gnd.h);
  ctx.fillStyle = '#6e4c2a';
  for (let tx = 0; tx < gnd.w; tx += 32)
    ctx.fillRect(tx, gnd.y, 30, 5);

  // Elevated platforms
  for (let i = 1; i < gs.geom.platforms.length; i++) {
    const p = gs.geom.platforms[i];
    ctx.fillStyle = '#7a6045'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#9a7855'; ctx.fillRect(p.x, p.y, p.w, 4);
    ctx.strokeStyle = '#5a4033'; ctx.lineWidth = 1;
    for (let sx = p.x; sx < p.x + p.w; sx += 32)
      ctx.strokeRect(sx, p.y, Math.min(32, p.x + p.w - sx), p.h);
  }

  // Bricks
  for (const b of gs.geom.bricks) {
    const bw = b.width; const bh = b.height;
    if (b.broken) {
      ctx.strokeStyle = '#5a3020'; ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, bw, bh); continue;
    }
    const dy = b.bounceTimer > 0 ? -5 : 0;
    ctx.fillStyle = '#b05830'; ctx.fillRect(b.x, b.y+dy, bw, bh);
    ctx.fillStyle = '#c86838'; ctx.fillRect(b.x+2, b.y+dy+2, bw-4, Math.round(bh * 0.375));
    ctx.strokeStyle = '#7a3818'; ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y+dy, bw, bh);
    ctx.beginPath();
    const midY = b.y + dy + bh / 2;
    const midX = b.x + bw / 2;
    ctx.moveTo(b.x, midY); ctx.lineTo(b.x+bw, midY);
    ctx.moveTo(midX, b.y+dy); ctx.lineTo(midX, midY);
    ctx.stroke();
  }

  // Pipes
  for (const pipe of gs.geom.pipes) {
    const isRoute = pipe.pipeType === 'correct';
    const isDone  = pipe.done;
    // Correct pipes: green while available, dark green when done.
    // Wrong pipes (any other type): red while available, dark when done.
    // Players can't see the wrong-pipe sub-type — they all show '?' until entered.
    ctx.fillStyle = isRoute
      ? (isDone ? '#1a5c1a' : '#1e7a1e')
      : (isDone ? '#3a1a1a' : '#7a1e1e');
    ctx.fillRect(pipe.x+4, pipe.y+14, PIPE_W-8, PIPE_H-14);
    ctx.fillStyle = isRoute
      ? (isDone ? '#2a8a2a' : '#28a028')
      : (isDone ? '#5a2a2a' : '#a02828');
    ctx.fillRect(pipe.x, pipe.y, PIPE_W, 14);
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(pipe.x+8, pipe.y+16, 8, PIPE_H-18);
    // Label: Ⅰ/Ⅱ/Ⅲ for correct pipes (route order visible), '?' for others, '✕' once used
    ctx.fillStyle = isDone ? '#afffaf' : '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const routeLabels = ['Ⅰ','Ⅱ','Ⅲ'];
    let pipeLabel: string;
    if (isRoute)       { pipeLabel = isDone ? '✓' : routeLabels[pipe.routeIndex]; }
    else if (isDone)   { pipeLabel = '✕'; }
    else               { pipeLabel = '?'; }
    ctx.fillText(pipeLabel, pipe.x + PIPE_W/2, pipe.y + PIPE_H * 0.62);
  }

  // Checkpoints
  for (const cp of gs.geom.checkpoints) {
    ctx.fillStyle = '#555'; ctx.fillRect(cp.x+6, cp.y, 4, 60);
    ctx.fillStyle = cp.activated ? '#f59e0b' : '#9ca3af';
    ctx.beginPath();
    ctx.moveTo(cp.x+10, cp.y); ctx.lineTo(cp.x+26, cp.y+10); ctx.lineTo(cp.x+10, cp.y+20);
    ctx.fill();
  }

  // Gate
  if (!gs.gateOpen) {
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(gs.geom.gateX, GROUND_TOP-220, 16, 220);
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔒', gs.geom.gateX+8, GROUND_TOP-110);
  } else {
    ctx.fillStyle = 'rgba(74,222,128,0.15)';
    ctx.fillRect(gs.geom.gateX, GROUND_TOP-220, 16, 220);
  }

  // Princess
  if (!gs.princessRescued) {
    const { princessX: px, princessY: py } = gs.geom;
    ctx.fillStyle = '#ec4899'; ctx.fillRect(px+3, py+12, PW-6, PH-12);
    ctx.fillStyle = '#fde68a'; ctx.fillRect(px+4, py-2, PW-8, 16);
    ctx.fillStyle = '#92400e'; ctx.fillRect(px+4, py-2, PW-8, 6);
    ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('👑', px+PW/2, py);
    if (gs.gateOpen) {
      const wave = Math.sin(now * 0.005) * 3;
      ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px+PW-2, py+6); ctx.lineTo(px+PW+12, py+wave); ctx.stroke();
    }
  }

  // Coins
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const coin of gs.geom.coins) {
    if (coin.collected) continue;
    const wobble = Math.sin(now * 0.003 + coin.x * 0.01) * 2;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(coin.x, coin.y+wobble, COIN_R, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#78350f'; ctx.font = 'bold 8px sans-serif';
    ctx.fillText('$', coin.x, coin.y+wobble);
  }

  // Enemies
  for (const e of gs.geom.enemies) {
    if (!e.alive && e.squishTimer <= 0) continue;
    const squished = !e.alive;
    const eh = squished ? 8 : EH;
    const ey = squished ? e.y + EH - 8 : e.y;
    ctx.fillStyle = '#dc2626'; ctx.fillRect(e.x, ey, EW, eh);
    if (!squished) {
      ctx.fillStyle = '#fff';
      const ex = e.vx > 0 ? e.x+EW-12 : e.x+4;
      ctx.fillRect(ex, e.y+5, 7, 7);
      ctx.fillStyle = '#000'; ctx.fillRect(ex + (e.vx>0 ? 2:1), e.y+7, 3, 3);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(e.x+2, e.y+EH-6, 8, 6); ctx.fillRect(e.x+EW-10, e.y+EH-6, 8, 6);
    }
  }

  // Player
  const { player } = gs;
  const blink = now < player.invincibleUntil && Math.floor(now / 100) % 2 === 1;
  if (!blink) {
    const px = player.x; const py = player.y; const fr = player.facingRight;
    const ls = player.onGround && Math.abs(player.vx) > 0.5 ? Math.sin(now * 0.015) * 4 : 0;
    // Legs
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(px+2,        py+PH-12, 10, 12+ls);
    ctx.fillRect(px+PW-12,    py+PH-12, 10, 12-ls);
    // Body (blue armor)
    ctx.fillStyle = '#2563eb'; ctx.fillRect(px+2, py+14, PW-4, PH-26);
    ctx.fillStyle = '#3b82f6'; ctx.fillRect(px+4, py+16, 6, PH-28);
    // Head
    ctx.fillStyle = '#fde68a'; ctx.fillRect(px+5, py+2, PW-10, 14);
    // Helmet
    ctx.fillStyle = '#1e3a8a'; ctx.fillRect(px+3, py-5, PW-6, 11);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(px+(fr?PW-7:3), py-10, 5, 7);
    // Eye
    ctx.fillStyle = '#000'; ctx.fillRect(px+(fr?PW-10:5), py+4, 4, 4);
    // Shield
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(px+(fr?0:PW-8), py+16, 8, 14);
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1;
    ctx.strokeRect(px+(fr?0:PW-8), py+16, 8, 14);
  }

  // Pipe flash overlay (correct / setback / dead)
  if (gs.phase === 'pipe_flash') {
    const alpha = Math.min(0.5, (gs.pipeFlashTimer / PIPE_FLASH_MS) * 0.5);
    const overlayColor =
      gs.pipeFlashType === 'correct' ? `rgba(0,200,80,${alpha})`
      : gs.pipeFlashType === 'dead'  ? `rgba(100,100,100,${alpha})`
      :                                `rgba(220,30,30,${alpha})`;
    ctx.fillStyle = overlayColor;
    ctx.fillRect(gs.camera, 0, CW, PLAY_H);
    ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle =
      gs.pipeFlashType === 'correct' ? '#4ade80'
      : gs.pipeFlashType === 'dead'  ? '#9ca3af'
      :                                '#f87171';
    const idx = gs.pipesComplete - 1;
    let flashLabel: string;
    if (gs.pipeFlashType === 'correct') {
      flashLabel = gs.pipesComplete === 3
        ? '🗝️ All pipes found! Gate opens!'
        : `✅ Pipe ${['Ⅰ','Ⅱ','Ⅲ'][idx]} found — ${gs.pipesComplete}/3`;
    } else if (gs.pipeFlashType === 'setback') {
      flashLabel = '❌ Wrong pipe! Back to spawn…';
    } else {
      flashLabel = '💀 Dead end! No progress made.';
    }
    ctx.fillText(flashLabel, gs.camera + CW/2, PLAY_H/2);
  }

  ctx.restore();

  // HUD
  drawHUD(ctx, gs, now, timeLimitMs);
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  now: number,
  timeLimitMs: number,
): void {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, CW, HUD_H);
  ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, CW, HUD_H);

  const midY = HUD_H / 2;
  ctx.textBaseline = 'middle';

  // Score
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`★ ${String(gs.score).padStart(6,'0')}`, 12, midY);

  // Timer
  const elapsed  = gs.phase === 'complete' ? gs.finalElapsedMs : now - gs.startTime;
  const remMs    = Math.max(0, timeLimitMs - elapsed);
  const remSecs  = Math.ceil(remMs / 1000);
  const timerStr = `${Math.floor(remSecs/60)}:${String(remSecs%60).padStart(2,'0')}`;
  ctx.fillStyle  = remSecs <= 30 ? '#ef4444' : '#f9fafb';
  ctx.font = 'bold 17px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`⏱ ${timerStr}`, CW/2, midY);

  // Hearts
  ctx.font = '15px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('❤'.repeat(gs.hearts) + '♡'.repeat(Math.max(0,MAX_HEARTS-gs.hearts)), CW-110, midY);

  // Pipe progress
  ctx.fillStyle = '#a78bfa'; ctx.font = 'bold 14px monospace';
  ctx.fillText(`🔑 ${gs.pipesComplete}/3`, CW-16, midY);
}

// ═══ Room renderer ════════════════════════════════════════════════════════════
/**
 * Renders the bonus or ambush side-room with its own background, geometry,
 * entities, and the persistent HUD strip at the top.
 */
function renderRoom(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  now: number,
  timeLimitMs: number,
): void {
  const room = gs.room;
  if (!room) return;
  const { player } = gs;

  ctx.clearRect(0, 0, CW, CH);

  // Distinct background per room type
  const bg = ctx.createLinearGradient(0, HUD_H, 0, CH);
  if (room.type === 'bonus') {
    bg.addColorStop(0, '#2d1b00'); bg.addColorStop(1, '#1a0e00');
  } else {
    bg.addColorStop(0, '#2d0000'); bg.addColorStop(1, '#1a0000');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, HUD_H, CW, PLAY_H);

  // Room-type banner (just below HUD)
  ctx.fillStyle = room.type === 'bonus' ? '#fbbf24' : '#ef4444';
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(
    room.type === 'bonus' ? '✨ BONUS ROOM — collect coins & break bricks!' : '⚔️ AMBUSH! Stomp enemies or escape through the exit pipe.',
    CW / 2, HUD_H + 4,
  );

  ctx.save();
  ctx.translate(0, HUD_H);

  // Ground
  const [gnd] = room.platforms;
  ctx.fillStyle = room.type === 'bonus' ? '#78501a' : '#5c1a1a';
  ctx.fillRect(gnd.x, gnd.y, gnd.w, gnd.h);

  // Elevated platforms
  for (let i = 1; i < room.platforms.length; i++) {
    const p = room.platforms[i];
    ctx.fillStyle = room.type === 'bonus' ? '#9a7030' : '#7a3030';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = room.type === 'bonus' ? '#c09040' : '#9a4040';
    ctx.fillRect(p.x, p.y, p.w, 4);
  }

  // Bricks (bonus room only)
  for (const b of room.bricks) {
    const bw = b.width; const bh = b.height;
    if (b.broken) {
      ctx.strokeStyle = '#7a4020'; ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, bw, bh); continue;
    }
    const dy = b.bounceTimer > 0 ? -5 : 0;
    ctx.fillStyle = '#c8a040'; ctx.fillRect(b.x, b.y+dy, bw, bh);
    ctx.fillStyle = '#e0b850'; ctx.fillRect(b.x+2, b.y+dy+2, bw-4, Math.round(bh * 0.375));
    ctx.strokeStyle = '#906020'; ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y+dy, bw, bh);
    ctx.beginPath();
    const midY = b.y + dy + bh / 2;
    const midX = b.x + bw / 2;
    ctx.moveTo(b.x, midY); ctx.lineTo(b.x+bw, midY);
    ctx.moveTo(midX, b.y+dy); ctx.lineTo(midX, midY);
    ctx.stroke();
  }

  // Exit pipe (always green — the way out)
  ctx.fillStyle = '#1a5c1a'; ctx.fillRect(room.exitX+4, room.exitY+14, PIPE_W-8, PIPE_H-14);
  ctx.fillStyle = '#28a028'; ctx.fillRect(room.exitX, room.exitY, PIPE_W, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(room.exitX+8, room.exitY+16, 8, PIPE_H-18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', room.exitX + PIPE_W/2, room.exitY + PIPE_H * 0.62);

  // Coins
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const coin of room.coins) {
    if (coin.collected) continue;
    const wobble = Math.sin(now * 0.003 + coin.x * 0.01) * 2;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(coin.x, coin.y+wobble, COIN_R, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#78350f'; ctx.font = 'bold 8px sans-serif';
    ctx.fillText('$', coin.x, coin.y+wobble);
  }

  // Enemies
  for (const e of room.enemies) {
    if (!e.alive && e.squishTimer <= 0) continue;
    const squished = !e.alive;
    const eh = squished ? 8 : EH;
    const ey = squished ? e.y + EH - 8 : e.y;
    ctx.fillStyle = '#dc2626'; ctx.fillRect(e.x, ey, EW, eh);
    if (!squished) {
      ctx.fillStyle = '#fff';
      const ex = e.vx > 0 ? e.x+EW-12 : e.x+4;
      ctx.fillRect(ex, e.y+5, 7, 7);
      ctx.fillStyle = '#000'; ctx.fillRect(ex + (e.vx>0 ? 2:1), e.y+7, 3, 3);
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(e.x+2, e.y+EH-6, 8, 6); ctx.fillRect(e.x+EW-10, e.y+EH-6, 8, 6);
    }
  }

  // Player
  const blink = now < player.invincibleUntil && Math.floor(now / 100) % 2 === 1;
  if (!blink) {
    const px = player.x; const py = player.y; const fr = player.facingRight;
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(px+2, py+PH-12, 10, 12); ctx.fillRect(px+PW-12, py+PH-12, 10, 12);
    ctx.fillStyle = '#2563eb'; ctx.fillRect(px+2, py+14, PW-4, PH-26);
    ctx.fillStyle = '#3b82f6'; ctx.fillRect(px+4, py+16, 6, PH-28);
    ctx.fillStyle = '#fde68a'; ctx.fillRect(px+5, py+2, PW-10, 14);
    ctx.fillStyle = '#1e3a8a'; ctx.fillRect(px+3, py-5, PW-6, 11);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(px+(fr?PW-7:3), py-10, 5, 7);
    ctx.fillStyle = '#000'; ctx.fillRect(px+(fr?PW-10:5), py+4, 4, 4);
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(px+(fr?0:PW-8), py+16, 8, 14);
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1; ctx.strokeRect(px+(fr?0:PW-8), py+16, 8, 14);
  }

  ctx.restore();

  // Normal HUD (timer keeps ticking while in room)
  drawHUD(ctx, gs, now, timeLimitMs);
}

// ═══ Responsive-layout helpers ════════════════════════════════════════════════

/** Max CSS scale factor to avoid excessive zoom on very large screens. */
const MAX_SCALE = 2;

/** Pixels reserved for the control strip in portrait mode (below canvas). */
const CTRL_H_PORTRAIT = 68;
/** Pixels reserved for the control strip in landscape mode (right of canvas). */
const CTRL_W_LANDSCAPE = 134;

interface LayoutState {
  scale: number;
  landscape: boolean;
}

function computeLayout(vw: number, vh: number): LayoutState {
  const landscape = vw > vh;
  let scale: number;
  if (landscape) {
    scale = Math.min((vw - CTRL_W_LANDSCAPE) / CW, vh / CH);
  } else {
    scale = Math.min(vw / CW, (vh - CTRL_H_PORTRAIT) / CH);
  }
  scale = Math.min(Math.max(scale, 0.2), MAX_SCALE);
  return { scale, landscape };
}

// ═══ Component ════════════════════════════════════════════════════════════════

interface CastleRescueGameProps {
  seed?: number;
  timeLimitMs?: number;
  onFinish?: (score: number) => void;
  autoStart?: boolean;
}

export default function CastleRescueGame({
  seed = 1,
  timeLimitMs = TIME_LIMIT_MS,
  onFinish,
  autoStart = true,
}: CastleRescueGameProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const stateRef    = useRef<GameState | null>(null);
  const keysRef     = useRef(new Set<string>());
  const rafRef      = useRef(0);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const finishedRef = useRef(false);

  const [phase, setPhase]       = useState<Phase>('idle');
  const [endStats, setEndStats] = useState<{ score: number; rescued: boolean } | null>(null);

  // ── Responsive layout ───────────────────────────────────────────────────────
  const [layout, setLayout] = useState<LayoutState>(() =>
    typeof window !== 'undefined'
      ? computeLayout(window.innerWidth, window.innerHeight)
      : { scale: 1, landscape: false },
  );

  useEffect(() => {
    let rafId = 0;
    const update = () => {
      setLayout(computeLayout(window.innerWidth, window.innerHeight));
    };
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    update();
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const initState = useCallback((): GameState => {
    const geom   = buildLevel(seed);
    const spawnY = GROUND_TOP - PH;
    return {
      phase: 'playing',
      player: { x:80, y:spawnY, vx:0, vy:0, onGround:false, facingRight:true, invincibleUntil:0 },
      geom, camera:0, score:0, hearts:MAX_HEARTS,
      pipesComplete:0, wrongPipes:0,
      startTime:performance.now(), finalElapsedMs:0,
      spawnX:80, spawnY,
      pipeFlashTimer:0, pipeFlashType: 'correct',
      deathPauseTimer:0,
      princessRescued:false, gateOpen:false, finalScore:0,
      room: null,
    };
  }, [seed]);

  const startGame = useCallback(() => {
    finishedRef.current = false;
    stateRef.current = initState();
    setPhase('playing');
    setEndStats(null);
  }, [initState]);

  // Keyboard input
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);

      const isGameKey =
        e.code === 'Space'      ||
        e.code === 'ArrowUp'    ||
        e.code === 'ArrowDown'  ||
        e.code === 'ArrowLeft'  ||
        e.code === 'ArrowRight';
      if (!isGameKey) return;

      // Skip if focus is on an interactive host-UI element (button, input, …).
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, input, textarea, select, a[href]')) return;

      // Only prevent default scroll/activation when the canvas (or a child of
      // the game wrapper) is the active element, so host-UI controls remain
      // fully accessible while the game is mounted.
      const canvas = canvasRef.current;
      const active = document.activeElement;
      const canvasHasFocus =
        canvas != null && (active === canvas || canvas.contains(active));
      if (canvasHasFocus) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => { window.removeEventListener('keydown',onDown); window.removeEventListener('keyup',onUp); };
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Cast to non-nullable: all modern browsers always return a 2d context for
    // a <canvas> element.  The throw below guards the rare null case at runtime
    // (e.g. memory pressure), without relying on TypeScript's closure narrowing.
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) { throw new Error('[CastleRescue] Failed to acquire 2d context'); }
    let lastFrameTime = performance.now();

    function loop(now: number): void {
      const dt = Math.min(now - lastFrameTime, 40);
      lastFrameTime = now;
      const gs = stateRef.current;

      if (!gs) {
        // Idle splash
        ctx.clearRect(0, 0, CW, CH);
        ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = '#f3f4f6'; ctx.font = 'bold 36px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🏰 Castle Rescue', CW/2, CH/2-40);
        ctx.fillStyle = '#9ca3af'; ctx.font = '16px sans-serif';
        ctx.fillText('Arrow Keys / WASD to move · Space/Up to jump', CW/2, CH/2+10);
        ctx.fillText('↓ or S at a pipe entrance to enter it', CW/2, CH/2+36);
        rafRef.current = requestAnimationFrame(loop); return;
      }

      if (gs.phase === 'complete') {
        if (!finishedRef.current) {
          finishedRef.current = true;
          setPhase('complete');
          setEndStats({ score: gs.finalScore, rescued: gs.princessRescued });
          onFinishRef.current?.(gs.finalScore);
        }
        renderGame(ctx, gs, now, timeLimitMs);
        rafRef.current = requestAnimationFrame(loop); return;
      }

      updateGame(gs, keysRef.current, dt, now, timeLimitMs);
      renderGame(ctx, gs, now, timeLimitMs);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [timeLimitMs]);

  // Auto-start
  useEffect(() => {
    if (autoStart) startGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const handleReset = useCallback(() => startGame(), [startGame]);

  // Touch / on-screen control helpers
  const touchPress   = useCallback((code: string) => keysRef.current.add(code),    []);
  const touchRelease = useCallback((code: string) => keysRef.current.delete(code), []);

  const { scale, landscape } = layout;

  // ── Controls: portrait = row below canvas, landscape = column right of canvas
  const ctrlsStyle: CSSProperties = {
    display: 'flex',
    flexDirection: landscape ? 'column' : 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: landscape ? '8px 4px' : '4px 8px',
    userSelect: 'none',
    flexShrink: 0,
  };

  return (
    <div style={outerStyle}>
      <div style={{
        display: 'flex',
        flexDirection: landscape ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: landscape ? 0 : 4,
      }}>
        {/* Canvas wrapper — takes the scaled visual size so flex layout is correct */}
        <div style={{
          position: 'relative',
          width: CW * scale,
          height: CH * scale,
          flexShrink: 0,
        }}>
          <canvas
            ref={canvasRef}
            width={CW} height={CH}
            style={{
              display: 'block',
              transformOrigin: 'top left',
              transform: `scale(${scale})`,
              border: '2px solid #1e3a8a',
              borderRadius: 8,
            }}
            tabIndex={0}
            aria-label="Castle Rescue platformer game"
          />

          {/* End-of-run result — overlaid on the scaled canvas */}
          {phase === 'complete' && endStats && (
            <div style={endOverlayStyle}>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
                {endStats.rescued ? '👑 Princess Rescued!' : '⏱ Time\'s Up!'}
              </p>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#fbbf24', margin: '0 0 12px' }}>
                Final Score: {endStats.score}
              </p>
              <button onClick={handleReset} style={btnCss('#1d4ed8')}>🔁 Play Again</button>
            </div>
          )}
        </div>

        {/* Touch / on-screen controls */}
        <div style={ctrlsStyle} aria-label="Game controls">
          <TouchBtn code="ArrowLeft"  label="◀" ariaLabel="Move left"   onPress={touchPress} onRelease={touchRelease} />
          <TouchBtn code="ArrowRight" label="▶" ariaLabel="Move right"  onPress={touchPress} onRelease={touchRelease} />
          <TouchBtn code="Space"      label="▲" ariaLabel="Jump"        onPress={touchPress} onRelease={touchRelease} />
          <TouchBtn code="ArrowDown"  label="↓" ariaLabel="Enter pipe"  onPress={touchPress} onRelease={touchRelease} color="#4c1d95" />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components & styles ────────────────────────────────────────────────────

interface TouchBtnProps {
  code: string; label: string; ariaLabel: string; color?: string;
  onPress: (code: string) => void; onRelease: (code: string) => void;
}
function TouchBtn({ code, label, ariaLabel, color = '#374151', onPress, onRelease }: TouchBtnProps) {
  return (
    <button
      aria-label={ariaLabel}
      style={btnCss(color)}
      onMouseDown={() => onPress(code)} onMouseUp={() => onRelease(code)} onMouseLeave={() => onRelease(code)}
      onTouchStart={(e) => { e.preventDefault(); onPress(code); }}
      onTouchEnd={(e)   => { e.preventDefault(); onRelease(code); }}
    >
      {label}
    </button>
  );
}

const outerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100vw',
  height: '100dvh',
  overflow: 'hidden',
  background: '#111827',
};

const endOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  textAlign: 'center',
  color: '#f3f4f6',
  background: 'rgba(17,24,39,0.88)',
  borderRadius: 12,
  padding: '18px 28px',
  pointerEvents: 'auto',
};

function btnCss(bg: string): CSSProperties {
  return {
    padding: '10px 20px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    touchAction: 'none',
    minWidth: 52,
    minHeight: 44,
  };
}
