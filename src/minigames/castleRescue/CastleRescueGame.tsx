/**
 * CastleRescueGame.tsx
 *
 * Real-time side-scrolling platformer minigame.
 *
 * The player controls a knight navigating a 4-section castle level.  Six
 * physical pipe objects are placed in the world; three of them form a
 * secret route (determined by the seed).  Entering all three correct pipes
 * in sequence (I → II → III) opens a gate to the twin's chamber.
 * Find your twin before the 2:30 timer expires.
 *
 * Controls
 * ─────────────────────────────────────────────────────────────────────────
 *  Move:        Arrow Left/Right  or  A/D
 *  Jump:        Arrow Up  or  W / Space / Z
 *  Enter pipe:  Arrow Down  or  S  (when standing at a pipe entrance)
 *
 * Scoring
 * ─────────────────────────────────────────────────────────────────────────
 *  Enemy stomped:      +20       Wrong pipe:         −100
 *  Brick broken:        +5       Enemy hit/pit:       −50
 *  Eyeolean collected: +25       Time penalty:    −10/s
 *  Checkpoint found:   +50
 *  Twin found:        +1000
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { generateLevelConfig } from './castleRescueGenerator';
import type { WrongPipeType } from './castleRescueGenerator';
import {
  playerLandsOnSurfaceTop,
  playerOverlapsPipeSide,
  tryEnterPipe,
  playerHitsBrickFromBelow,
  resolveFullSolidCollision,
} from './castleRescueEngine';
import type { CollisionRect } from './castleRescueEngine';
import { validateAndFixPipeClearance } from './castleRescueUtils';
import { buildBonusRoom, buildAmbushRoom } from './castleRescueRooms';
import type { RoomInstance } from './castleRescueRooms';
import {
  TIME_LIMIT_MS,
  PIPE_FLASH_MS,
  SCORE_ENEMY   as S_ENEMY,
  SCORE_BRICK   as S_BRICK,
  SCORE_COIN    as S_COIN,
  SCORE_CHECKPOINT as S_CHECKPOINT,
  PENALTY_DEATH as P_DEATH,
  PENALTY_OUT_OF_LIVES as P_OUT_OF_LIVES,
} from './castleRescueConstants';
import {
  computePlatformerFinalScore,
  applyPipeEntry,
} from './castleRescuePlatformerLogic';
import {
  applyCastleRescueLifeLoss,
  resolveCastleRescueRunSeed,
} from './castleRescueSession';
import type { CastleRescueEndReason } from './castleRescueSession';
import type { FindYourTwinHumanTelemetry } from '../../experiments/findYourTwinHumanAi/findYourTwinHumanAi';

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
/**
 * Minimum vertical clearance (px) between the bottom of a brick and the top
 * of the nearest platform below it.  Ensures the player can stand on the
 * platform with headroom, then jump to hit the brick from below.
 * Must be ≥ PH (40) to fit the player body; 42 px adds a 2 px safety margin.
 */
const MIN_CLEARANCE = 42;

/**
 * Returns the brick top-edge y coordinate that satisfies MIN_CLEARANCE above
 * a reference platform at `platformY`.
 *
 * brick.y = platformY − MIN_CLEARANCE − BRICK
 */
function brickTop(platformY: number): number {
  return platformY - MIN_CLEARANCE - BRICK;
}

// ═══ Game timing / feedback constants ════════════════════════════════════════
const MAX_HEARTS       =    3;
const INVINCIBLE_MS    = 1500;
const DEATH_PAUSE_MS   =  900;
/** Short pause before respawning after a pit fall (no enemy death animation needed). */
const PIT_DEATH_PAUSE_MS = 200;

// ═══ Types ════════════════════════════════════════════════════════════════════
type PipeType = 'correct' | WrongPipeType; // 'correct' | 'setback' | 'bonus' | 'ambush' | 'dead'
type Phase = 'idle' | 'playing' | 'pipe_flash' | 'death_pause' | 'complete';
type CastleRescueVariant = 'classic' | 'benny-lenny';

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
  /** When true, this pipe cannot be entered until unlocked by visiting a specific room. */
  locked: boolean;
  /**
   * When non-null, exiting the bonus/ambush room entered via THIS pipe unlocks
   * the pipe at the given slot index.  Only set on bonus/ambush wrong pipes that
   * serve as "keys" in the locked-pipe discovery mechanic.
   */
  unlocksSlot: number | null;
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
 *
 * Defined in castleRescueRooms.ts and re-exported here as a type alias.
 */
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
  runSeed: number;
  variant: CastleRescueVariant;
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
  endReason: CastleRescueEndReason;
  /**
   * Slot index of the pipe used to enter the current side-room, or null when
   * not in a room.  Used by the room-exit handler to unlock any gated correct
   * pipe whose discovery depends on visiting this room.
   */
  lastRoomPipeSlot: number | null;
  /** Seeded housemate portraits shown in the sequel's gallery room. */
  galleryPortraits: number[];
  telemetry: {
    pipeEntries: number;
    roomsEntered: number;
    deaths: number;
    jumps: number;
    directionChanges: number;
    lastDirection: number;
    coinsCollected: number;
    enemiesStomped: number;
    bricksBroken: number;
    checkpointsActivated: number;
    longestFrameMs: number;
  };
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

  // Locked-pipe mechanic: ~50% of runs lock the 3rd correct pipe behind a
  // specific bonus/ambush room visit, forcing exploration before it appears.
  const lockRng = rng32((seed ^ 0xF00DCAFE) >>> 0);
  const shouldLock = lockRng() < 0.5;
  let lockedSlot: number | null = null;
  let keySlot: number | null = null;

  if (shouldLock) {
    // Lock the 3rd correct-route pipe (last in sequence to keep runs fair).
    const candidateLockedSlot = config.correctPipeSlots[2];
    // Choose a bonus or ambush wrong pipe as the room that unlocks it.
    const candidateKeys = Object.keys(config.wrongPipeTypes)
      .map(Number)
      .filter(s => config.wrongPipeTypes[s] === 'bonus' || config.wrongPipeTypes[s] === 'ambush');
    if (candidateKeys.length > 0) {
      lockedSlot = candidateLockedSlot;
      keySlot    = candidateKeys[Math.floor(lockRng() * candidateKeys.length)];
    }
  }

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
      locked: lockedSlot !== null && idx === lockedSlot,
      unlocksSlot: keySlot !== null && idx === keySlot ? lockedSlot : null,
    };
  });

  // Ground (full-solid) + elevated platforms (full-solid — block from all sides)
  const platforms: Platform[] = [
    { x: 0,    y: GROUND_TOP, w: 4800, h: 32 }, // ground — full-solid (oneWay omitted/false)
    { x: 200,  y: 270, w: 160, h: 16 },
    { x: 430,  y: 228, w: 180, h: 16 },
    { x: 730,  y: 268, w: 150, h: 16 },
    { x: 950,  y: 248, w: 140, h: 16 },
    { x: 1150, y: 242, w: 200, h: 16 },
    { x: 1380, y: 196, w: 180, h: 16 },
    { x: 1640, y: 244, w: 160, h: 16 },
    { x: 1870, y: 268, w: 180, h: 16 },
    { x: 2080, y: 232, w: 160, h: 16 },
    { x: 2370, y: 280, w: 200, h: 16 },
    { x: 2640, y: 264, w: 180, h: 16 },
    { x: 2900, y: 276, w: 200, h: 16 },
    { x: 3140, y: 260, w: 180, h: 16 },
    { x: 3380, y: 280, w: 180, h: 16 },
    { x: 3600, y: 240, w: 200, h: 16 },
    { x: 3840, y: 268, w: 180, h: 16 },
    { x: 4060, y: 250, w: 180, h: 16 },
    { x: 4300, y: 264, w: 180, h: 16 },
    { x: 4550, y: 248, w: 230, h: 16 },
  ];

  // Validate and adjust pipe/platform clearance before computing brick and coin
  // positions.  Platforms that sit too close to a pipe top (clearance < PH+8=48px)
  // are moved upward; running this first ensures brickTop(platform.y) below uses
  // the already-adjusted y values so MIN_CLEARANCE is preserved above each platform.
  validateAndFixPipeClearance({ pipes, platforms });

  // Bricks positioned with MIN_CLEARANCE = 42 px of vertical air-gap above
  // the reference platform so the player can stand on the platform and then
  // jump to hit the brick from below without the player body overlapping it.
  // Formula: brick.y = brickTop(platform.y) = platform.y − MIN_CLEARANCE − BRICK.
  // Platforms that were adjusted by validateAndFixPipeClearance are referenced
  // by index so their adjusted y propagates into the brick positions.
  const brickDefs: [number, number][] = [
    [218, brickTop(270)], [250, brickTop(270)],             // platforms[1]  y=270
    [460, brickTop(228)], [492, brickTop(228)],             // platforms[2]  y=228
    [760, brickTop(platforms[3].y)],                        // platforms[3]  y=268 (may be adjusted)
    [1170, brickTop(242)], [1202, brickTop(242)],           // platforms[5]  y=242
    [1410, brickTop(196)], [1442, brickTop(196)],           // platforms[6]  y=196
    [1660, brickTop(244)],                                  // platforms[7]  y=244
    [2100, brickTop(232)], [2132, brickTop(232)],           // platforms[9]  y=232
    [2400, brickTop(280)], [2432, brickTop(280)],           // platforms[10] y=280
    [2660, brickTop(platforms[11].y)], [2692, brickTop(platforms[11].y)], // platforms[11] y=264 (may be adjusted)
    [2930, brickTop(276)],                                  // platforms[12] y=276
    [3162, brickTop(platforms[13].y)],                      // platforms[13] y=260 (may be adjusted)
    [3622, brickTop(240)], [3654, brickTop(240)],           // platforms[15] y=240
    [4080, brickTop(250)],                                  // platforms[17] y=250
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
    // Coins sit 2 px above the corresponding brick top (brickTop(platform.y) − 2).
    // Platforms adjusted by validateAndFixPipeClearance are referenced by index.
    [230, brickTop(270)-2], [262, brickTop(270)-2],
    [460, brickTop(228)-2], [492, brickTop(228)-2], [524, brickTop(228)-2],
    [780, brickTop(platforms[3].y)-2], [812, brickTop(platforms[3].y)-2],    // platforms[3] (may be adjusted)
    [1190, brickTop(242)-2], [1222, brickTop(242)-2],
    [1420, brickTop(196)-2], [1452, brickTop(196)-2], [1484, brickTop(196)-2],
    [1680, brickTop(244)-2],
    [2110, brickTop(232)-2], [2142, brickTop(232)-2],
    [2410, brickTop(280)-2], [2442, brickTop(280)-2], [2474, brickTop(280)-2],
    [2680, brickTop(platforms[11].y)-2], [2712, brickTop(platforms[11].y)-2], // platforms[11] (may be adjusted)
    [2940, brickTop(276)-2], [2972, brickTop(276)-2],
    [3172, brickTop(platforms[13].y)-2], [3204, brickTop(platforms[13].y)-2], // platforms[13] (may be adjusted)
    [3640, brickTop(240)-2], [3672, brickTop(240)-2], [3704, brickTop(240)-2],
    [4100, brickTop(250)-2], [4132, brickTop(250)-2],
    // Standalone coins in the final stretch (no reference brick; floated
    // 34 px above the last platform at y=248 as a reward trail).
    [4570, 214], [4602, 214], [4634, 214],
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

// ═══ Damage player ════════════════════════════════════════════════════════════
function damagePlayer(gs: GameState, now: number, isPit: boolean): void {
  if (!isPit && now < gs.player.invincibleUntil) return;
  gs.telemetry.deaths += 1;
  if (applyCastleRescueLifeLoss(gs, now, P_DEATH, P_OUT_OF_LIVES)) return;
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
    gs.finalScore     = computePlatformerFinalScore(gs, elapsed);
    gs.endReason = 'timeout';
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
  const enterRoute = gs.variant === 'benny-lenny'
    ? keys.has('ArrowUp') || keys.has('KeyW')
    : keys.has('ArrowDown') || keys.has('KeyS');
  const jump = gs.variant === 'benny-lenny'
    ? keys.has('Space') || keys.has('KeyZ')
    : keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space') || keys.has('KeyZ');
  const goDown  = keys.has('ArrowDown')  || keys.has('KeyS');

  const direction = goLeft ? -1 : goRight ? 1 : 0;
  if (direction !== 0 && gs.telemetry.lastDirection !== 0 && direction !== gs.telemetry.lastDirection) {
    gs.telemetry.directionChanges += 1;
  }
  if (direction !== 0) gs.telemetry.lastDirection = direction;

  player.vx = goLeft ? -WALK : goRight ? WALK : 0;
  if (goLeft)  player.facingRight = false;
  if (goRight) player.facingRight = true;
  if (jump && player.onGround) {
    player.vy = JUMP_VY; player.onGround = false; gs.telemetry.jumps += 1;
  }

  // ── Physics ───────────────────────────────────────────────────────────────
  player.vy = Math.min(player.vy + GRAVITY * sc, MAX_FALL);
  const prevX  = player.x;
  const prevY  = player.y;
  player.y    += player.vy * sc;
  player.x     = Math.max(0, Math.min(geom.width - PW, player.x + player.vx * sc));
  player.onGround = false;

  // ── Platform/ground landing ───────────────────────────────────────────────
  const pRect: CollisionRect = { x: player.x, y: player.y, w: PW, h: PH };
  for (const surf of geom.platforms) {
    const sRect: CollisionRect = { x: surf.x, y: surf.y, w: surf.w, h: surf.h };
    if (surf.oneWay) {
      // One-way: only allow landing on top; skip underside resolution.
      if (playerLandsOnSurfaceTop(pRect, prevY, player.vy, sRect)) {
        player.y = surf.y - PH;
        player.vy = 0;
        player.onGround = true;
        pRect.y = player.y;
      }
    } else {
      // Full-solid: use AABB resolver for all axes.
      const res = resolveFullSolidCollision(pRect, prevX, prevY, player.vx, player.vy, sRect);
      if (res.x !== pRect.x || res.y !== pRect.y) {
        player.x = res.x; player.y = res.y;
        player.vx = res.vx; player.vy = res.vy;
        if (res.onGround) player.onGround = true;
        pRect.x = player.x; pRect.y = player.y;
      }
    }
  }
  // Re-apply level-bounds clamp after collision resolution (a side-push can
  // move player.x outside [0, geom.width-PW]).
  player.x = Math.max(0, Math.min(geom.width - PW, player.x));
  pRect.x  = player.x;

  // ── Pipe solidity (pipes are full solid — top landing + side block) ───────
  for (const pipe of geom.pipes) {
    if (gs.variant === 'benny-lenny') continue;
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
      gs.telemetry.bricksBroken += 1;
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
        gs.telemetry.enemiesStomped += 1;
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
      gs.telemetry.coinsCollected += 1;
    }
  }

  // ── Checkpoints ───────────────────────────────────────────────────────────
  for (const cp of geom.checkpoints) {
    if (!cp.activated && overlaps(pR, { x:cp.x, y:cp.y, w:16, h:60 })) {
      cp.activated   = true;
      gs.spawnX      = cp.respawnX;
      gs.spawnY      = cp.respawnY;
      gs.score      += S_CHECKPOINT;
      gs.telemetry.checkpointsActivated += 1;
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
  if (enterRoute) {
    for (const pipe of geom.pipes) {
      const canEnter = gs.variant === 'benny-lenny'
        ? player.onGround &&
          Math.abs(player.vy) < 0.01 &&
          player.x + PW / 2 >= pipe.x &&
          player.x + PW / 2 <= pipe.x + pipe.width
        : tryEnterPipe(
          player.x, player.y, PW, PH,
          player.onGround, player.vy, goDown,
          pipe.x, pipe.y, pipe.width, pipe.entryZoneWidth,
        );
      if (!canEnter) continue;

      gs.telemetry.pipeEntries += 1;

      // Locked pipes cannot be entered — give brief visual feedback only.
      if (pipe.locked) {
        gs.pipeFlashType  = 'dead';
        gs.pipeFlashTimer = PIPE_FLASH_MS;
        gs.phase = 'pipe_flash';
        return;
      }

      const result = applyPipeEntry(gs, pipe);
      if (result === 'enter_bonus') {
        // Teleport to the bonus treasure room.
        gs.lastRoomPipeSlot = pipe.slotIndex;
        gs.galleryPortraits = chooseGalleryPortraits(gs.runSeed, gs.telemetry.roomsEntered);
        gs.room = buildBonusRoom();
        gs.player.x = 40; gs.player.y = GROUND_TOP - PH;
        gs.player.vx = 0; gs.player.vy = 0;
        gs.camera = 0;
        gs.telemetry.roomsEntered += 1;
      } else if (result === 'enter_ambush') {
        // Teleport to the ambush trap room.
        gs.lastRoomPipeSlot = pipe.slotIndex;
        gs.room = buildAmbushRoom();
        gs.player.x = 40; gs.player.y = GROUND_TOP - PH;
        gs.player.vx = 0; gs.player.vy = 0;
        gs.camera = 0;
        gs.telemetry.roomsEntered += 1;
      }
      return;
    }
  }

  // ── Princess rescue ───────────────────────────────────────────────────────
  if (!gs.princessRescued) {
    if (overlaps(pR, { x:geom.princessX, y:geom.princessY, w:PW, h:PH })) {
      gs.princessRescued = true;
      // Finish with the twins standing side by side instead of overlapping.
      player.x = geom.princessX - PW - 8;
      player.y = geom.princessY;
      player.vx = 0;
      player.vy = 0;
      player.onGround = true;
      player.facingRight = true;
      const el = now - gs.startTime;
      gs.finalElapsedMs = el;
      gs.finalScore     = computePlatformerFinalScore(gs, el);
      gs.endReason = 'rescued';
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
  const enterRoute = gs.variant === 'benny-lenny'
    ? keys.has('ArrowUp') || keys.has('KeyW')
    : keys.has('ArrowDown') || keys.has('KeyS');
  const jump = gs.variant === 'benny-lenny'
    ? keys.has('Space') || keys.has('KeyZ')
    : keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space') || keys.has('KeyZ');
  const goDown  = keys.has('ArrowDown')  || keys.has('KeyS');

  player.vx = goLeft ? -WALK : goRight ? WALK : 0;
  if (goLeft)  player.facingRight = false;
  if (goRight) player.facingRight = true;
  if (jump && player.onGround) {
    player.vy = JUMP_VY; player.onGround = false; gs.telemetry.jumps += 1;
  }

  // Physics
  player.vy = Math.min(player.vy + GRAVITY * sc, MAX_FALL);
  const prevX = player.x;
  const prevY = player.y;
  player.y   += player.vy * sc;
  player.x    = Math.max(0, Math.min(room.width - PW, player.x + player.vx * sc));
  player.onGround = false;

  // Platform / ground collision (room) — mirrors main-level full-solid resolution.
  const rPRect: CollisionRect = { x: player.x, y: player.y, w: PW, h: PH };
  for (const surf of room.platforms) {
    const sRect: CollisionRect = { x: surf.x, y: surf.y, w: surf.w, h: surf.h };
    if (surf.oneWay) {
      // One-way: only allow landing on top; skip underside resolution.
      if (playerLandsOnSurfaceTop(rPRect, prevY, player.vy, sRect)) {
        player.y = surf.y - PH; player.vy = 0; player.onGround = true;
        rPRect.y = player.y;
      }
    } else {
      // Full-solid: use AABB resolver for all axes (same path as main level).
      const res = resolveFullSolidCollision(rPRect, prevX, prevY, player.vx, player.vy, sRect);
      if (res.x !== rPRect.x || res.y !== rPRect.y) {
        player.x = res.x; player.y = res.y;
        player.vx = res.vx; player.vy = res.vy;
        if (res.onGround) player.onGround = true;
        rPRect.x = player.x; rPRect.y = player.y;
      }
    }
  }
  // Clamp to room bounds after resolution (a side-push can move player outside).
  player.x = Math.max(0, Math.min(room.width - PW, player.x));
  rPRect.x = player.x;

  // Exit pipe solid collision (full-solid — top landing + side block).
  if (gs.variant !== 'benny-lenny') {
    const exitPipeRect: CollisionRect = { x: room.exitX, y: room.exitY, w: PIPE_W, h: PIPE_H };
    const exitRes = resolveFullSolidCollision(rPRect, prevX, prevY, player.vx, player.vy, exitPipeRect);
    if (exitRes.x !== rPRect.x || exitRes.y !== rPRect.y) {
      player.x = exitRes.x; player.y = exitRes.y;
      player.vx = exitRes.vx; player.vy = exitRes.vy;
      if (exitRes.onGround) player.onGround = true;
      rPRect.x = player.x; rPRect.y = player.y;
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
      gs.telemetry.bricksBroken += 1;
    }
    if (brick.bounceTimer > 0) brick.bounceTimer -= dt;
  }

  // Pit death in room → respawn at room entrance with damage
  if (player.y > PLAY_H + 60) {
    gs.telemetry.deaths += 1;
    if (applyCastleRescueLifeLoss(gs, now, P_DEATH, P_OUT_OF_LIVES)) return;
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
        gs.telemetry.enemiesStomped += 1;
      } else if (now >= player.invincibleUntil) {
        gs.telemetry.deaths += 1;
        if (applyCastleRescueLifeLoss(gs, now, P_DEATH, P_OUT_OF_LIVES)) return;
        player.invincibleUntil = now + INVINCIBLE_MS;
        player.x = 40; player.y = GROUND_TOP - PH; player.vx = 0; player.vy = 0;
        return;
      }
    }
  }

  // Eyeoleans (room)
  for (const coin of room.coins) {
    if (coin.collected) continue;
    if (overlaps(pR, { x: coin.x-COIN_R, y: coin.y-COIN_R, w: COIN_R*2, h: COIN_R*2 })) {
      coin.collected = true; gs.score += S_COIN;
      gs.telemetry.coinsCollected += 1;
    }
  }

  // Exit pipe detection — deliberate down + standing on exit pipe top
  const canExitRoom = gs.variant === 'benny-lenny'
    ? enterRoute &&
      player.onGround &&
      Math.abs(player.vy) < 0.01 &&
      player.x + PW / 2 >= room.exitX &&
      player.x + PW / 2 <= room.exitX + PIPE_W
    : tryEnterPipe(
      player.x, player.y, PW, PH,
      player.onGround, player.vy, goDown,
      room.exitX, room.exitY, PIPE_W, PIPE_W,
    );
  if (canExitRoom) {
    // Unlock any locked correct pipe whose key was the room just visited.
    if (gs.lastRoomPipeSlot !== null) {
      const roomPipe = gs.geom.pipes.find(p => p.slotIndex === gs.lastRoomPipeSlot);
      if (roomPipe?.unlocksSlot != null) {
        const gatedPipe = gs.geom.pipes.find(p => p.slotIndex === roomPipe.unlocksSlot);
        if (gatedPipe) gatedPipe.locked = false;
      }
    }
    gs.lastRoomPipeSlot = null;
    gs.room = null; // back to main level
    player.x = gs.spawnX; player.y = gs.spawnY; player.vx = 0; player.vy = 0;
    gs.camera = Math.max(0, Math.min(gs.geom.width - CW, gs.spawnX - CW * 0.4));
  }
}

// ═══ Renderer ════════════════════════════════════════════════════════════════
function drawSequelCastleBackdrop(ctx: CanvasRenderingContext2D, camera: number): void {
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.09)';
  ctx.lineWidth = 1;
  for (let y = HUD_H + 34; y < CH; y += 42) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
    const offset = Math.floor(y / 42) % 2 === 0 ? 0 : 54;
    for (let x = offset; x < CW; x += 108) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 42); ctx.stroke();
    }
  }

  for (let index = 0; index < 4; index++) {
    const x = ((index * 260 - camera * 0.12) % (CW + 260) + CW + 260) % (CW + 260) - 80;
    ctx.fillStyle = '#111a34';
    ctx.fillRect(x, HUD_H + 66, 74, 142);
    ctx.beginPath(); ctx.arc(x + 37, HUD_H + 66, 37, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#8b6f47'; ctx.lineWidth = 5;
    ctx.strokeRect(x, HUD_H + 65, 74, 143);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fillRect(x + 8, HUD_H + 73, 27, 126);
    ctx.fillStyle = 'rgba(244, 114, 182, 0.14)';
    ctx.fillRect(x + 40, HUD_H + 73, 26, 126);
  }

  for (let index = 0; index < 5; index++) {
    const x = 90 + index * 170;
    const flame = Math.sin(index * 2.1 + camera * 0.002) * 2;
    ctx.fillStyle = '#713f12'; ctx.fillRect(x - 3, HUD_H + 236, 6, 42);
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.arc(x + flame, HUD_H + 228, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(x, HUD_H + 228, 4, 0, Math.PI * 2); ctx.fill();
  }
}

const GALLERY_HOUSEMATES = [
  { name: 'LIA', file: 'Lia_avatar.webp' },
  { name: 'REMY', file: 'Remy_avatar.webp' },
  { name: 'NICO', file: 'Nico_avatar.webp' },
  { name: 'VEE', file: 'Vee_avatar.webp' },
  { name: 'QUINN', file: 'Quinn_avatar.webp' },
  { name: 'ECHO', file: 'Echo_avatar.webp' },
  { name: 'RUNE', file: 'Rune_avatar.webp' },
  { name: 'KIAN', file: 'Kian_avatar.webp' },
  { name: 'RAE', file: 'Rae_avatar.webp' },
  { name: 'LUX', file: 'Lux_avatar.webp' },
  { name: 'BLUE', file: 'Blue_avatar.webp' },
  { name: 'DEX', file: 'Dex_avatar.webp' },
  { name: 'FINN', file: 'Finn_avatar.webp' },
  { name: 'MIMI', file: 'mimi_avatar.webp' },
  { name: 'ZED', file: 'Zed_avatar.webp' },
] as const;

const galleryImageCache = new Map<string, HTMLImageElement>();
const galleryPixelCache = new Map<string, HTMLCanvasElement>();

export interface GalleryPortraitSpec {
  name: string;
  file: string;
  mirrored: boolean;
}

function chooseGalleryPortraits(seed: number, visit: number): number[] {
  const rng = rng32(((seed >>> 0) ^ Math.imul(visit + 1, 0x45d9f3b)) >>> 0);
  const indices = GALLERY_HOUSEMATES.map((_, index) => index);
  for (let index = indices.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
  }
  return indices.slice(0, 4);
}

/** Part 1's Twin Shock clue: Lia and her mirrored counterpart are guaranteed. */
export function chooseClassicTwinHintPortraits(
  galleryPortraits: readonly number[],
): GalleryPortraitSpec[] {
  const randomIndices = [...galleryPortraits, ...GALLERY_HOUSEMATES.map((_, index) => index)]
    .filter((index, position, all) => index !== 0 && all.indexOf(index) === position)
    .slice(0, 2);
  const lia = GALLERY_HOUSEMATES[0];
  return [
    { name: 'LIA', file: lia.file, mirrored: false },
    { name: 'ALI', file: lia.file, mirrored: true },
    ...randomIndices.map((index) => ({
      name: GALLERY_HOUSEMATES[index].name,
      file: GALLERY_HOUSEMATES[index].file,
      mirrored: false,
    })),
  ];
}

function getGalleryImage(file: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const src = `${import.meta.env.BASE_URL}assets/skins/${file}`;
  const cached = galleryImageCache.get(src);
  if (cached) return cached;
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  galleryImageCache.set(src, image);
  return image;
}

function getPixelatedGalleryImage(file: string): HTMLCanvasElement | null {
  const cached = galleryPixelCache.get(file);
  if (cached) return cached;

  const image = getGalleryImage(file);
  if (!image?.complete || image.naturalWidth <= 0) return null;

  // Render once at deliberately tiny resolution, then enlarge with smoothing
  // disabled in the gallery. This keeps the portraits aligned with the game's
  // pixel-art style without adding duplicate or heavier image assets.
  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = 24;
  pixelCanvas.height = 27;
  const pixelCtx = pixelCanvas.getContext('2d');
  if (!pixelCtx) return null;
  const scale = Math.max(24 / image.naturalWidth, 27 / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  pixelCtx.drawImage(image, (24 - width) / 2, (27 - height) / 2, width, height);
  galleryPixelCache.set(file, pixelCanvas);
  return pixelCanvas;
}

function drawCastleDoor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isLocked: boolean,
  isDone: boolean,
  wasCorrect: boolean,
  exit = false,
): void {
  const doorX = x - 8;
  const doorY = y - 24;
  const doorW = 64;
  const doorH = 88;
  const frame = exit ? '#166534' : isLocked ? '#2a2134' : '#76613f';
  const wood = exit ? '#15803d' : isDone ? '#3f3428' : '#7c4a2d';
  ctx.fillStyle = frame;
  ctx.fillRect(doorX - 4, doorY - 5, doorW + 8, doorH + 5);
  ctx.beginPath(); ctx.arc(doorX + doorW / 2, doorY + 3, doorW / 2 + 4, Math.PI, 0); ctx.fill();
  ctx.fillStyle = wood;
  ctx.fillRect(doorX + 3, doorY + 5, doorW - 6, doorH - 5);
  ctx.beginPath(); ctx.arc(doorX + doorW / 2, doorY + 7, doorW / 2 - 3, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  for (let plank = 11; plank < doorW; plank += 12) {
    ctx.beginPath(); ctx.moveTo(doorX + plank, doorY + 6); ctx.lineTo(doorX + plank, doorY + doorH); ctx.stroke();
  }
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(doorX + doorW - 11, doorY + doorH * 0.62, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = exit || (isDone && wasCorrect) ? '#bbf7d0' : '#f8fafc';
  ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const label = exit ? 'EXIT' : isLocked ? '🔒' : isDone ? (wasCorrect ? '✓' : '✕') : '?';
  ctx.fillText(label, doorX + doorW / 2, doorY + doorH * 0.35);
}

function drawSequelRoomDecor(
  ctx: CanvasRenderingContext2D,
  roomType: RoomInstance['type'],
  galleryPortraits: readonly number[],
): void {
  if (roomType === 'bonus') {
    const portraits = galleryPortraits
      .map((index) => GALLERY_HOUSEMATES[index])
      .filter((portrait): portrait is (typeof GALLERY_HOUSEMATES)[number] => portrait != null);
    portraits.forEach((portrait, index) => {
      const x = 78 + index * 182;
      ctx.fillStyle = '#a16207'; ctx.fillRect(x, HUD_H + 46, 108, 128);
      ctx.fillStyle = '#fef3c7'; ctx.fillRect(x + 7, HUD_H + 53, 94, 114);
      const pixelImage = getPixelatedGalleryImage(portrait.file);
      if (pixelImage) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 7, HUD_H + 53, 94, 106);
        ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pixelImage, x + 7, HUD_H + 53, 94, 106);
        ctx.restore();
      } else {
        ctx.fillStyle = '#6d5c88'; ctx.fillRect(x + 15, HUD_H + 61, 78, 94);
        ctx.fillStyle = '#fde68a';
        ctx.beginPath(); ctx.arc(x + 54, HUD_H + 91, 25, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#713f12'; ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center'; ctx.fillText(portrait.name, x + 54, HUD_H + 164);
    });
  } else {
    ctx.save();
    ctx.translate(CW / 2, HUD_H + 122);
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(55, -25); ctx.lineTo(42, 46);
    ctx.lineTo(0, 68); ctx.lineTo(-42, 46); ctx.lineTo(-55, -25); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(124, 58, 237, 0.18)'; ctx.fill();
    ctx.fillStyle = '#f5f3ff'; ctx.font = '900 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('KOLEQUANT', 0, 4);
    ctx.fillStyle = '#c4b5fd'; ctx.font = 'bold 10px monospace';
    ctx.fillText('CASTLE VAULT', 0, 25);
    ctx.restore();
  }
}

function drawClassicTwinHintRoomDecor(
  ctx: CanvasRenderingContext2D,
  galleryPortraits: readonly number[],
): void {
  // Bright studio-like memory wall: intentionally distinct from Part 2's castle gallery.
  const wallColors = ['#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b'];
  for (let stripe = 0; stripe < 8; stripe++) {
    ctx.fillStyle = `${wallColors[stripe % wallColors.length]}33`;
    ctx.fillRect(stripe * 110, HUD_H + 28, 110, 168);
  }
  ctx.fillStyle = '#fef3c7';
  for (let flag = 0; flag < 13; flag++) {
    ctx.beginPath();
    ctx.moveTo(18 + flag * 66, HUD_H + 30);
    ctx.lineTo(40 + flag * 66, HUD_H + 53);
    ctx.lineTo(62 + flag * 66, HUD_H + 30);
    ctx.fill();
  }

  chooseClassicTwinHintPortraits(galleryPortraits).forEach((portrait, index) => {
    const x = 78 + index * 182;
    ctx.fillStyle = wallColors[index % wallColors.length];
    ctx.fillRect(x, HUD_H + 46, 108, 128);
    ctx.fillStyle = '#fff7ed';
    ctx.fillRect(x + 7, HUD_H + 53, 94, 114);
    const pixelImage = getPixelatedGalleryImage(portrait.file);
    if (pixelImage) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 7, HUD_H + 53, 94, 106);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      if (portrait.mirrored) {
        ctx.translate(x + 101, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(pixelImage, 0, HUD_H + 53, 94, 106);
      } else {
        ctx.drawImage(pixelImage, x + 7, HUD_H + 53, 94, 106);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = wallColors[(index + 1) % wallColors.length];
      ctx.fillRect(x + 15, HUD_H + 61, 78, 94);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath(); ctx.arc(x + 54, HUD_H + 91, 25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#4c1d95';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(portrait.name, x + 54, HUD_H + 164);
  });
}

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

  const isSequel = gs.variant === 'benny-lenny';

  // Background
  const bg = ctx.createLinearGradient(0, HUD_H, 0, CH);
  bg.addColorStop(0, isSequel ? '#312643' : '#1a1a2e');
  bg.addColorStop(1, isSequel ? '#151325' : '#0f1320');
  ctx.fillStyle = bg;
  ctx.fillRect(0, HUD_H, CW, PLAY_H);

  // Parallax castle silhouettes
  if (isSequel) {
    drawSequelCastleBackdrop(ctx, gs.camera);
  } else {
    ctx.fillStyle = '#16213e';
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 220 - gs.camera * 0.25) % (CW + 220) + CW + 220) % (CW + 220) - 220;
      ctx.fillRect(bx, HUD_H + 120, 60, 250);
      ctx.fillRect(bx + 20, HUD_H + 80, 20, 45);
      ctx.fillRect(bx - 10, HUD_H + 135, 10, 235);
      ctx.fillRect(bx + 65, HUD_H + 135, 10, 235);
    }
  }

  // World transform (camera)
  ctx.save();
  ctx.translate(Math.round(-gs.camera), HUD_H);

  // Ground
  const [gnd] = gs.geom.platforms;
  ctx.fillStyle = isSequel ? '#3f3a4d' : '#5c3d20';
  ctx.fillRect(gnd.x, gnd.y, gnd.w, gnd.h);
  ctx.fillStyle = isSequel ? '#625b70' : '#6e4c2a';
  for (let tx = 0; tx < gnd.w; tx += 32)
    ctx.fillRect(tx, gnd.y, 30, 5);

  // Elevated platforms
  for (let i = 1; i < gs.geom.platforms.length; i++) {
    const p = gs.geom.platforms[i];
    ctx.fillStyle = isSequel ? '#5b5369' : '#7a6045'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = isSequel ? '#8b819b' : '#9a7855'; ctx.fillRect(p.x, p.y, p.w, 4);
    ctx.strokeStyle = isSequel ? '#393344' : '#5a4033'; ctx.lineWidth = 1;
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

  // Pipes — all the same neutral color so players can't identify correct pipes visually.
  for (const pipe of gs.geom.pipes) {
    const isDone   = pipe.done;
    const isLocked = pipe.locked;
    if (isSequel) {
      drawCastleDoor(
        ctx,
        pipe.x,
        pipe.y,
        isLocked,
        isDone,
        pipe.pipeType === 'correct',
      );
      continue;
    }
    // Body color: locked = very dark, done = darker neutral, active = neutral teal-slate
    ctx.fillStyle = isLocked ? '#151c2a' : (isDone ? '#1a3028' : '#1e5045');
    ctx.fillRect(pipe.x+4, pipe.y+14, PIPE_W-8, PIPE_H-14);
    // Cap (rim at top)
    ctx.fillStyle = isLocked ? '#232f45' : (isDone ? '#254038' : '#2a6a5a');
    ctx.fillRect(pipe.x, pipe.y, PIPE_W, 14);
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(pipe.x+8, pipe.y+16, 8, PIPE_H-18);
    // Label: '🔒' if locked, '?' if unknown, '✓'/'✕' once used
    ctx.fillStyle = isDone ? '#7dd3c8' : '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let pipeLabel: string;
    if (isLocked)      { pipeLabel = '🔒'; }
    else if (isDone)   { pipeLabel = pipe.pipeType === 'correct' ? '✓' : '✕'; }
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

  // Twin figure
  if (!gs.princessRescued || gs.endReason === 'rescued') {
    const { princessX: tx, princessY: ty } = gs.geom;
    // Twin — same style as the player (BB contestant) but in a teal shirt
    // Shoes
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(tx+1, ty+PH-7, 12, 7); ctx.fillRect(tx+PW-13, ty+PH-7, 12, 7);
    // Legs (dark-blue pants, no animation)
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(tx+2, ty+PH-18, 10, 12); ctx.fillRect(tx+PW-12, ty+PH-18, 10, 12);
    // Body (teal shirt to distinguish from player's amber shirt)
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(tx+2, ty+12, PW-4, PH-26);
    // Eye logo on twin's shirt (pixel-art: white oval → purple iris → black pupil)
    const tlogoX = tx + PW/2 - 5; const tlogoY = ty + 19;
    ctx.fillStyle = '#fff'; ctx.fillRect(tlogoX, tlogoY, 10, 6);
    ctx.fillStyle = '#7c3aed'; ctx.fillRect(tlogoX+2, tlogoY+1, 6, 4);
    ctx.fillStyle = '#000'; ctx.fillRect(tlogoX+4, tlogoY+2, 2, 2);
    // Head (skin)
    ctx.fillStyle = '#fde68a'; ctx.fillRect(tx+5, ty+2, PW-10, 14);
    // Hair (amber-brown, visually distinct from the player's darker brown #92400e)
    ctx.fillStyle = '#b45309'; ctx.fillRect(tx+4, ty-2, PW-8, 8);
    // Face eye
    ctx.fillStyle = '#000'; ctx.fillRect(tx+5, ty+5, 4, 4);
    // Wave while waiting; raise both arms for the sequel reunion.
    if (gs.gateOpen || gs.princessRescued) {
      const wave = Math.sin(now * 0.005) * 3;
      ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx+PW-2, ty+6); ctx.lineTo(tx+PW+12, ty+wave); ctx.stroke();
      if (gs.princessRescued) {
        ctx.beginPath(); ctx.moveTo(tx+2, ty+8); ctx.lineTo(tx-10, ty+wave); ctx.stroke();
      }
    }
  }

  // Eyeoleans
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const coin of gs.geom.coins) {
    if (coin.collected) continue;
    const wobble = Math.sin(now * 0.003 + coin.x * 0.01) * 2;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(coin.x, coin.y+wobble, COIN_R, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#78350f'; ctx.font = 'bold 8px sans-serif';
    ctx.fillText('E', coin.x, coin.y+wobble);
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

  // Player — BB contestant style: casual clothes with eye-logo on shirt
  const { player } = gs;
  const blink = now < player.invincibleUntil && Math.floor(now / 100) % 2 === 1;
  if (!blink) {
    const px = player.x; const py = player.y; const fr = player.facingRight;
    const ls = player.onGround && Math.abs(player.vx) > 0.5 ? Math.sin(now * 0.015) * 4 : 0;
    // Shoes
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(px+1, py+PH-7, 12, 7+ls);
    ctx.fillRect(px+PW-13, py+PH-7, 12, 7-ls);
    // Legs (dark-blue pants with walk animation)
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(px+2, py+PH-18, 10, 12+ls);
    ctx.fillRect(px+PW-12, py+PH-18, 10, 12-ls);
    // Body (amber/orange t-shirt)
    ctx.fillStyle = '#f59e0b'; ctx.fillRect(px+2, py+12, PW-4, PH-26);
    // Eye logo on shirt (centred on the chest — pixel-art: white oval → purple iris → black pupil)
    const logoX = px + PW/2 - 5; const logoY = py + 19;
    ctx.fillStyle = '#fff'; ctx.fillRect(logoX, logoY, 10, 6);
    ctx.fillStyle = '#7c3aed'; ctx.fillRect(logoX+2, logoY+1, 6, 4);
    ctx.fillStyle = '#000'; ctx.fillRect(logoX+4, logoY+2, 2, 2);
    // Head (skin tone)
    ctx.fillStyle = '#fde68a'; ctx.fillRect(px+5, py+2, PW-10, 14);
    // Hair (dark brown)
    ctx.fillStyle = '#92400e'; ctx.fillRect(px+4, py-2, PW-8, 8);
    // Face eye (direction-aware)
    ctx.fillStyle = '#000'; ctx.fillRect(px+(fr?PW-10:5), py+5, 4, 4);

    if (gs.princessRescued) {
      const cheer = Math.sin(now * 0.007) * 3;
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px+2, py+10); ctx.lineTo(px-10, py+cheer); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px+PW-2, py+10); ctx.lineTo(px+PW+10, py+cheer); ctx.stroke();
    }
  }

  // Low-cost deterministic confetti: simple canvas rectangles, no assets or DOM nodes.
  if (gs.phase === 'complete' && gs.endReason === 'rescued') {
    const colors = ['#fbbf24', '#a78bfa', '#22d3ee', '#fb7185', '#4ade80'];
    const centerX = (gs.player.x + gs.geom.princessX + PW) / 2;
    for (let i = 0; i < 28; i++) {
      const spread = ((i * 47) % 220) - 110;
      const fall = ((now * 0.045 + i * 31) % 190);
      const x = centerX + spread;
      const y = Math.max(6, gs.geom.princessY - 180 + fall);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(Math.round(x), Math.round(y), i % 2 === 0 ? 5 : 3, 4);
    }
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
        ? (isSequel ? '🗝️ All doors found! The great gate opens!' : '🗝️ All pipes found! Gate opens!')
        : `✅ ${isSequel ? 'Door' : 'Pipe'} ${['Ⅰ','Ⅱ','Ⅲ'][idx]} found — ${gs.pipesComplete}/3`;
    } else if (gs.pipeFlashType === 'setback') {
      flashLabel = `❌ Wrong ${isSequel ? 'door' : 'pipe'}! Back to spawn…`;
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

  // Route progress
  ctx.fillStyle = '#a78bfa'; ctx.font = 'bold 14px monospace';
  ctx.fillText(`${gs.variant === 'benny-lenny' ? '🚪' : '🔑'} ${gs.pipesComplete}/3`, CW-16, midY);
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
  const isSequel = gs.variant === 'benny-lenny';

  ctx.clearRect(0, 0, CW, CH);

  // Distinct background per room type
  const bg = ctx.createLinearGradient(0, HUD_H, 0, CH);
  if (room.type === 'bonus') {
    bg.addColorStop(0, isSequel ? '#3b2b23' : '#f472b6');
    bg.addColorStop(0.5, isSequel ? '#291e20' : '#7c3aed');
    bg.addColorStop(1, isSequel ? '#18131d' : '#0891b2');
  } else {
    bg.addColorStop(0, isSequel ? '#211338' : '#2d0000');
    bg.addColorStop(1, isSequel ? '#0d0a18' : '#1a0000');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, HUD_H, CW, PLAY_H);

  if (isSequel) {
    drawSequelRoomDecor(ctx, room.type, gs.galleryPortraits);
  } else if (room.type === 'bonus') {
    drawClassicTwinHintRoomDecor(ctx, gs.galleryPortraits);
  }

  // Room-type banner (just below HUD)
  ctx.fillStyle = room.type === 'bonus' ? '#fbbf24' : '#ef4444';
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(
    isSequel
      ? room.type === 'bonus'
        ? '🖼️ HOUSEMATE GALLERY — collect Eyeoleans among the portraits!'
        : '♛ KOLEQUANT VAULT — defeat the guards or reach the exit door!'
      : room.type === 'bonus'
        ? '✨ MEMORY WALL — collect Eyeoleans among four familiar faces!'
        : '⚔️ AMBUSH! Stomp enemies or escape through the exit pipe.',
    CW / 2, HUD_H + 4,
  );

  ctx.save();
  ctx.translate(0, HUD_H);

  // Ground
  const [gnd] = room.platforms;
  ctx.fillStyle = room.type === 'bonus' ? (isSequel ? '#78501a' : '#4c1d95') : '#5c1a1a';
  ctx.fillRect(gnd.x, gnd.y, gnd.w, gnd.h);

  // Elevated platforms
  for (let i = 1; i < room.platforms.length; i++) {
    const p = room.platforms[i];
    ctx.fillStyle = room.type === 'bonus' ? (isSequel ? '#9a7030' : '#db2777') : '#7a3030';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = room.type === 'bonus' ? (isSequel ? '#c09040' : '#22d3ee') : '#9a4040';
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

  // Exit route (always green — the way out)
  if (isSequel) {
    drawCastleDoor(ctx, room.exitX, room.exitY, false, false, true, true);
  } else {
    ctx.fillStyle = '#1a5c1a'; ctx.fillRect(room.exitX+4, room.exitY+14, PIPE_W-8, PIPE_H-14);
    ctx.fillStyle = '#28a028'; ctx.fillRect(room.exitX, room.exitY, PIPE_W, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(room.exitX+8, room.exitY+16, 8, PIPE_H-18);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', room.exitX + PIPE_W/2, room.exitY + PIPE_H * 0.62);
  }

  // Eyeoleans
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const coin of room.coins) {
    if (coin.collected) continue;
    const wobble = Math.sin(now * 0.003 + coin.x * 0.01) * 2;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(coin.x, coin.y+wobble, COIN_R, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#78350f'; ctx.font = 'bold 8px sans-serif';
    ctx.fillText('E', coin.x, coin.y+wobble);
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

  // Player — same BB contestant style as in the main-level renderer
  const blink = now < player.invincibleUntil && Math.floor(now / 100) % 2 === 1;
  if (!blink) {
    const px = player.x; const py = player.y; const fr = player.facingRight;
    // Shoes
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(px+1, py+PH-7, 12, 7); ctx.fillRect(px+PW-13, py+PH-7, 12, 7);
    // Legs (dark-blue pants, no walk animation in room)
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(px+2, py+PH-18, 10, 12); ctx.fillRect(px+PW-12, py+PH-18, 10, 12);
    // Body (amber/orange t-shirt)
    ctx.fillStyle = '#f59e0b'; ctx.fillRect(px+2, py+12, PW-4, PH-26);
    // Eye logo on shirt (pixel-art: white oval → purple iris → black pupil)
    const logoX = px + PW/2 - 5; const logoY = py + 19;
    ctx.fillStyle = '#fff'; ctx.fillRect(logoX, logoY, 10, 6);
    ctx.fillStyle = '#7c3aed'; ctx.fillRect(logoX+2, logoY+1, 6, 4);
    ctx.fillStyle = '#000'; ctx.fillRect(logoX+4, logoY+2, 2, 2);
    // Head (skin tone)
    ctx.fillStyle = '#fde68a'; ctx.fillRect(px+5, py+2, PW-10, 14);
    // Hair (dark brown)
    ctx.fillStyle = '#92400e'; ctx.fillRect(px+4, py-2, PW-8, 8);
    // Face eye (direction-aware)
    ctx.fillStyle = '#000'; ctx.fillRect(px+(fr?PW-10:5), py+5, 4, 4);
  }

  ctx.restore();

  // Normal HUD (timer keeps ticking while in room)
  drawHUD(ctx, gs, now, timeLimitMs);
}

// ═══ Responsive-layout helpers ════════════════════════════════════════════════

/** Max CSS scale factor to avoid excessive zoom on very large screens. */
const MAX_SCALE = 2;

/**
 * Pixels reserved for the control strip in portrait mode (below canvas).
 * Must be ≥ touch button max height (90) + 2 × vertical padding (8px each side) + gap = 116 px.
 */
const CTRL_H_PORTRAIT = 116;
/**
 * Pixels reserved for the control strip in landscape mode (beside canvas).
 * Must be ≥ touch button max width (90) + horizontal padding (16px each side) + gap = 122 px;
 * rounded up to 134 for breathing room.
 */
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
  /** Optional visual-only spin-off theme. Core mechanics and scoring are shared. */
  variant?: CastleRescueVariant;
  /** Dev-only measurement hook used by the isolated human/AI experiment. */
  experimental?: {
    onFinish: (result: FindYourTwinHumanTelemetry) => void;
  };
}

export default function CastleRescueGame({
  seed,
  timeLimitMs = TIME_LIMIT_MS,
  onFinish,
  autoStart = true,
  variant = 'classic',
  experimental,
}: CastleRescueGameProps) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const stateRef    = useRef<GameState | null>(null);
  const keysRef     = useRef(new Set<string>());
  const rafRef      = useRef(0);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const experimentalRef = useRef(experimental);
  experimentalRef.current = experimental;
  const finishedRef = useRef(false);

  const [phase, setPhase]       = useState<Phase>('idle');
  const [endStats, setEndStats] = useState<{ score: number; endReason: CastleRescueEndReason } | null>(null);

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

  const initState = useCallback((runSeed: number): GameState => {
    const geom   = buildLevel(runSeed);
    const spawnY = GROUND_TOP - PH;
    return {
      runSeed,
      variant,
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
      endReason: 'timeout',
      lastRoomPipeSlot: null,
      galleryPortraits: chooseGalleryPortraits(runSeed, 0),
      telemetry: {
        pipeEntries: 0,
        roomsEntered: 0,
        deaths: 0,
        jumps: 0,
        directionChanges: 0,
        lastDirection: 0,
        coinsCollected: 0,
        enemiesStomped: 0,
        bricksBroken: 0,
        checkpointsActivated: 0,
        longestFrameMs: 0,
      },
    };
  }, [variant]);

  const startGame = useCallback(() => {
    // Follow the minigame-host convention: seed=0 means "no explicit seed",
    // so hosted replays get a fresh run layout unless a non-zero seed is set.
    const runSeed = resolveCastleRescueRunSeed(seed);
    finishedRef.current = false;
    stateRef.current = initState(runSeed);
    setPhase('playing');
    setEndStats(null);
  }, [seed, initState]);

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
      const rawDt = Math.max(0, now - lastFrameTime);
      const dt = Math.min(rawDt, 40);
      lastFrameTime = now;
      const gs = stateRef.current;

      if (!gs) {
        // Idle splash
        ctx.clearRect(0, 0, CW, CH);
        ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = '#f3f4f6'; ctx.font = 'bold 36px serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(variant === 'benny-lenny' ? '🏰 Find Your Twin 2' : '🏰 Castle Rescue', CW/2, CH/2-40);
        ctx.fillStyle = '#9ca3af'; ctx.font = '16px sans-serif';
        ctx.fillText('Arrow Keys / WASD to move · Space/Up to jump', CW/2, CH/2+10);
        ctx.fillText(
          variant === 'benny-lenny'
            ? 'Walk in front of a door and press ↑ or W to enter'
            : '↓ or S at a pipe entrance to enter it',
          CW/2,
          CH/2+36,
        );
        rafRef.current = requestAnimationFrame(loop); return;
      }

      if (gs.phase === 'complete') {
        if (!finishedRef.current) {
          finishedRef.current = true;
          setPhase('complete');
          setEndStats({ score: gs.finalScore, endReason: gs.endReason });
          if (import.meta.env.DEV && experimentalRef.current) {
            experimentalRef.current.onFinish({
              seed: gs.runSeed,
              finalScore: gs.finalScore,
              elapsedMs: Math.round(gs.finalElapsedMs),
              endReason: gs.endReason,
              rescued: gs.princessRescued,
              pipesComplete: gs.pipesComplete,
              pipeEntries: gs.telemetry.pipeEntries,
              wrongPipes: gs.wrongPipes,
              roomsEntered: gs.telemetry.roomsEntered,
              deaths: gs.telemetry.deaths,
              jumps: gs.telemetry.jumps,
              directionChanges: gs.telemetry.directionChanges,
              coinsCollected: gs.telemetry.coinsCollected,
              enemiesStomped: gs.telemetry.enemiesStomped,
              bricksBroken: gs.telemetry.bricksBroken,
              checkpointsActivated: gs.telemetry.checkpointsActivated,
              longestFrameMs: gs.telemetry.longestFrameMs,
            });
          }
          onFinishRef.current?.(gs.finalScore);
        }
        renderGame(ctx, gs, now, timeLimitMs);
        rafRef.current = requestAnimationFrame(loop); return;
      }

      gs.telemetry.longestFrameMs = Math.max(gs.telemetry.longestFrameMs, rawDt);
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

  const handleContinue = useCallback(() => {
    if (onFinishRef.current) {
      // The game loop already called onFinishRef when the run completed
      // (finishedRef.current === true at that point).  Only call it again here
      // if that automatic notification somehow did not happen (edge case).
      if (!finishedRef.current) {
        try { onFinishRef.current(endStats?.score ?? 0); } catch (err) {
          console.error('[CastleRescue] Error in onFinish callback:', err);
        }
      }
      // Let the host handle navigation; do not restart locally.
      return;
    }
    // No host callback: restart locally (startGame resets finishedRef).
    startGame();
  }, [startGame, endStats]);

  // Touch / on-screen control helpers
  const touchPress   = useCallback((code: string) => keysRef.current.add(code),    []);
  const touchRelease = useCallback((code: string) => keysRef.current.delete(code), []);

  const { scale, landscape } = layout;

  // Responsive button size: clamp between 72–90px, scaled from base 72px.
  const btnSize = Math.min(90, Math.max(72, Math.round(72 * (scale || 1))));

  // ── Controls: portrait = row below canvas, landscape = LEFT group on left
  //   edge and RIGHT group on right edge (fixed to viewport corners)
  const ctrlGroupStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    userSelect: 'none',
    flexShrink: 0,
  };

  // Portrait layout: two groups side-by-side below canvas
  // Landscape layout: groups are positionally anchored (see JSX below)
  const portraitCtrlsStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    width: '100%',
    userSelect: 'none',
    flexShrink: 0,
  };

  /** Fixed-size wrapper that enforces compact touch button dimensions. */
  const btnWrap = (child: React.ReactNode): React.ReactNode => (
    <div style={{ width: btnSize, height: btnSize, flexShrink: 0 }}>{child}</div>
  );

  // Displayed canvas dimensions (CSS pixels)
  const canvasCssW = Math.round(CW * scale);
  const canvasCssH = Math.round(CH * scale);

  return (
    <div
      style={
        variant === 'benny-lenny'
          ? { ...outerStyle, position: 'fixed', inset: 0, zIndex: 9000 }
          : outerStyle
      }
    >
      {/* Landscape: LEFT/RIGHT buttons anchored to bottom-left of viewport */}
      {landscape && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          ...ctrlGroupStyle,
          zIndex: 10,
        }} aria-label="Movement controls">
          {btnWrap(<TouchBtn code="ArrowLeft"  label="◀" ariaLabel="Move left"  onPress={touchPress} onRelease={touchRelease} size={btnSize} />)}
          {btnWrap(<TouchBtn code="ArrowRight" label="▶" ariaLabel="Move right" onPress={touchPress} onRelease={touchRelease} size={btnSize} />)}
        </div>
      )}
      {/* Landscape: JUMP/DOWN buttons anchored to bottom-right of viewport */}
      {landscape && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          ...ctrlGroupStyle,
          zIndex: 10,
        }} aria-label="Action controls">
          {btnWrap(<TouchBtn code={variant === 'benny-lenny' ? 'ArrowUp' : 'ArrowDown'} label={variant === 'benny-lenny' ? '↑' : '↓'} ariaLabel={variant === 'benny-lenny' ? 'Enter door' : 'Enter pipe'} onPress={touchPress} onRelease={touchRelease} color="#4c1d95" size={btnSize} />)}
          {btnWrap(<TouchBtn code="Space"      label="▲" ariaLabel="Jump"       onPress={touchPress} onRelease={touchRelease} size={btnSize} />)}
        </div>
      )}

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
          width: canvasCssW,
          height: canvasCssH,
          flexShrink: 0,
        }}>
          <canvas
            ref={canvasRef}
            width={CW} height={CH}
            style={{
              display: 'block',
              width: canvasCssW,
              height: canvasCssH,
              border: `2px solid ${variant === 'benny-lenny' ? '#a78bfa' : '#1e3a8a'}`,
              borderRadius: 8,
              // Prevent default touch scroll/zoom gestures on the game canvas.
              touchAction: 'none',
              // When the end overlay is visible, ensure the canvas doesn't swallow taps.
              pointerEvents: phase === 'complete' ? 'none' : 'auto',
            }}
            tabIndex={0}
            aria-label={variant === 'benny-lenny' ? 'Find Your Twin 2 Benny and Lenny castle game' : 'Find Your Twin platformer game'}
          />

          {/* End-of-run result — overlaid on the scaled canvas */}
          {phase === 'complete' && endStats && (
            <div style={
              endStats.endReason === 'rescued'
                ? { ...endOverlayStyle, top: 54, transform: 'translateX(-50%)', padding: '10px 22px' }
                : endOverlayStyle
            }>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
                {endStats.endReason === 'rescued'
                  ? variant === 'benny-lenny' ? '🎉 Benny Found Lenny!' : '🎉 Twin Found!'
                  : endStats.endReason === 'out_of_lives'
                    ? '💔 Out of lives!'
                    : '⏱ Time\'s Up!'}
              </p>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#fbbf24', margin: '0 0 12px' }}>
                Final Score: {endStats.score}
              </p>
              <button onClick={handleContinue} style={btnCss('#1d4ed8')}>
                {onFinish ? '▶ Continue' : '🔁 Play Again'}
              </button>
            </div>
          )}
        </div>

        {/* Portrait: touch controls below canvas — LEFT/RIGHT on left, JUMP/DOWN on right */}
        {!landscape && (
          <div style={portraitCtrlsStyle} aria-label="Game controls">
            <div style={ctrlGroupStyle}>
              {btnWrap(<TouchBtn code="ArrowLeft"  label="◀" ariaLabel="Move left"  onPress={touchPress} onRelease={touchRelease} size={btnSize} />)}
              {btnWrap(<TouchBtn code="ArrowRight" label="▶" ariaLabel="Move right" onPress={touchPress} onRelease={touchRelease} size={btnSize} />)}
            </div>
            <div style={ctrlGroupStyle}>
              {btnWrap(<TouchBtn code={variant === 'benny-lenny' ? 'ArrowUp' : 'ArrowDown'} label={variant === 'benny-lenny' ? '↑' : '↓'} ariaLabel={variant === 'benny-lenny' ? 'Enter door' : 'Enter pipe'} onPress={touchPress} onRelease={touchRelease} color="#4c1d95" size={btnSize} />)}
              {btnWrap(<TouchBtn code="Space"      label="▲" ariaLabel="Jump"       onPress={touchPress} onRelease={touchRelease} size={btnSize} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Competition-host adapter for the castle sequel. */
export function BennyLennyCastleRescueGame(
  props: Omit<CastleRescueGameProps, 'variant'>,
) {
  return <CastleRescueGame {...props} variant="benny-lenny" />;
}

// ── Sub-components & styles ────────────────────────────────────────────────────

interface TouchBtnProps {
  code: string; label: string; ariaLabel: string; color?: string; size?: number;
  onPress: (code: string) => void; onRelease: (code: string) => void;
}
function TouchBtn({ code, label, ariaLabel, color = '#374151', onPress, onRelease }: TouchBtnProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      draggable={false}
      style={touchBtnCss(color)}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress(code);
      }}
      onPointerUp={() => onRelease(code)}
      onPointerCancel={() => onRelease(code)}
      onLostPointerCapture={() => onRelease(code)}
      onPointerLeave={() => onRelease(code)}
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
  zIndex: 10,
};

/** Style for the on-screen touch control buttons (large touch targets). */
function touchBtnCss(bg: string): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    WebkitTapHighlightColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

/** Style for action buttons (e.g. "Continue" / "Play Again") — compact, not touch-target sized. */
function btnCss(bg: string): CSSProperties {
  return {
    padding: '10px 24px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    touchAction: 'manipulation',
    pointerEvents: 'auto',
  };
}
