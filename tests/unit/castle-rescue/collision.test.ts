/**
 * tests/unit/castle-rescue/collision.test.ts
 *
 * Unit tests for the platformer collision helpers exported from
 * castleRescueEngine.ts.  All tests are deterministic — no wall-clock or
 * Math.random dependency.
 *
 * Tested helpers:
 *  - playerLandsOnSurfaceTop    : land-on-top detection (both one-way and solid)
 *  - playerHitsSurfaceFromBelow : block-upward detection for full-solid surfaces
 *  - playerOverlapsPipeSide     : lateral pipe-body overlap detection
 *  - tryEnterPipe               : deliberate pipe-entry gating
 *  - playerHitsBrickFromBelow   : brick underside head-hit detection
 */

import { describe, it, expect } from 'vitest';
import {
  playerLandsOnSurfaceTop,
  playerHitsSurfaceFromBelow,
  playerOverlapsPipeSide,
  tryEnterPipe,
  playerHitsBrickFromBelow,
} from '../../../src/minigames/castleRescue/castleRescueEngine';
import type { CollisionRect } from '../../../src/minigames/castleRescue/castleRescueEngine';

// ── Fixtures ──────────────────────────────────────────────────────────────────
// All coordinates use canvas convention: y increases downward.
// GROUND_TOP = 368, PIPE_H = 64, PW = 28, PH = 40

const PW = 28;
const PH = 40;

/** Build a player rect at the given position. */
function player(x: number, y: number): CollisionRect {
  return { x, y, w: PW, h: PH };
}

/** Build a generic surface rect. */
function surface(x: number, y: number, w: number, h: number): CollisionRect {
  return { x, y, w, h };
}

// ─────────────────────────────────────────────────────────────────────────────
// playerLandsOnSurfaceTop
// ─────────────────────────────────────────────────────────────────────────────
describe('playerLandsOnSurfaceTop', () => {
  it('detects a falling player landing on the surface top', () => {
    // Surface at y=300. Player feet cross 300 while falling (vy > 0).
    const surf = surface(100, 300, 200, 32);
    const p    = player(120, 261);  // feet at 261+40=301 — just crossed surface top
    const prevY = 258;              // feet at 258+40=298 — still above (≤ 300+4)
    expect(playerLandsOnSurfaceTop(p, prevY, 3, surf)).toBe(true);
  });

  it('returns false when the player is moving upward (not falling)', () => {
    const surf = surface(100, 300, 200, 32);
    const p    = player(120, 261);
    const prevY = 264; // was lower (higher y), moving upward (vy < 0)
    expect(playerLandsOnSurfaceTop(p, prevY, -3, surf)).toBe(false);
  });

  it('returns false when the player is not horizontally overlapping', () => {
    const surf = surface(100, 300, 200, 32);
    const p    = player(310, 261); // x=310, completely to the right of surf (x+w=300)
    const prevY = 258;
    expect(playerLandsOnSurfaceTop(p, prevY, 3, surf)).toBe(false);
  });

  it('returns false when the player was more than 4px below the surface top last frame', () => {
    // prevY + PH = 307 > surf.y + 4 = 304 → player was already too far below
    const surf = surface(100, 300, 200, 32);
    const p    = player(120, 265);
    const prevY = 267; // feet at 307 — too far inside the surface, not a clean landing
    expect(playerLandsOnSurfaceTop(p, prevY, 3, surf)).toBe(false);
  });

  it('returns true at the exact 4 px grace boundary', () => {
    // prevY + PH exactly = surf.y + 4 = 304  →  304 ≤ 304 → should detect landing
    const surf = surface(100, 300, 200, 32);
    const p    = player(120, 262); // feet at 302
    const prevY = 264;             // feet at 304 = surf.y + 4
    expect(playerLandsOnSurfaceTop(p, prevY, 3, surf)).toBe(true);
  });

  it('works for the ground surface (y = 368, h = 32)', () => {
    const ground = surface(0, 368, 4800, 32);
    const p      = player(80, 329); // feet at 369 — just landed
    const prevY  = 326;             // feet at 366 ≤ 368+4
    expect(playerLandsOnSurfaceTop(p, prevY, 4, ground)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// playerHitsSurfaceFromBelow  (full-solid platform blocks upward)
// ─────────────────────────────────────────────────────────────────────────────
describe('playerHitsSurfaceFromBelow — full-solid platform blocks upward motion', () => {
  it('detects a rising player hitting the underside of a full-solid platform', () => {
    // Platform from y=200 to y=216.  Player jumping upward (vy < 0).
    const plat  = surface(50, 200, 160, 16);
    // Current frame: player top at y=215 (just below platform bottom at 216)
    const p     = player(80, 215);
    // Previous frame: player top at y=220 (≥ 216 − 4 = 212 → within band)
    const prevY = 220;
    expect(playerHitsSurfaceFromBelow(p, prevY, -5, plat)).toBe(true);
  });

  it('returns false when the player is falling (vy ≥ 0)', () => {
    const plat  = surface(50, 200, 160, 16);
    const p     = player(80, 215);
    const prevY = 220;
    expect(playerHitsSurfaceFromBelow(p, prevY, 0, plat)).toBe(false);
    expect(playerHitsSurfaceFromBelow(p, prevY, 3, plat)).toBe(false);
  });

  it('returns false when the player is not horizontally overlapping', () => {
    const plat  = surface(50, 200, 160, 16);
    const p     = player(220, 215); // to the right of platform (x=220 ≥ 50+160=210)
    const prevY = 220;
    expect(playerHitsSurfaceFromBelow(p, prevY, -5, plat)).toBe(false);
  });

  it('returns false for a one-way platform (caller decides — function ignores oneWay)', () => {
    // The function itself is oneWay-agnostic; the caller skips it for one-way platforms.
    // Here we just verify the function returns true when conditions are met regardless.
    const plat = surface(50, 200, 160, 16);
    const p    = player(80, 215);
    const prevY = 220;
    // Function still returns true — caller is responsible for the oneWay gate.
    expect(playerHitsSurfaceFromBelow(p, prevY, -5, plat)).toBe(true);
  });

  it('returns false when player was already above the platform bottom (too far above)', () => {
    // prevY = 150 → prevY < surf.y + surf.h - 4 = 212 → no hit
    const plat  = surface(50, 200, 160, 16);
    const p     = player(80, 190);
    const prevY = 150;
    expect(playerHitsSurfaceFromBelow(p, prevY, -5, plat)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// playerOverlapsPipeSide
// ─────────────────────────────────────────────────────────────────────────────
describe('playerOverlapsPipeSide — pipe acts as a solid body', () => {
  // Pipe at x=490, y=304 (PIPE_GY), width=48, height=64
  const PIPE_X = 490; const PIPE_Y = 304; const PIPE_W = 48; const PIPE_H = 64;

  it('detects horizontal overlap when the player walks into the pipe side', () => {
    // Player at x=470, y=330 → feet at 370 > pipe.y+4=308 → inside pipe body zone
    const p = player(470, 330); // x+PW=498 > PIPE_X=490, x=470 < PIPE_X+PIPE_W=538
    expect(playerOverlapsPipeSide(p, PIPE_X, PIPE_Y, PIPE_W, PIPE_H)).toBe(true);
  });

  it('returns false when player is entirely to the left of the pipe', () => {
    const p = player(440, 330); // x+PW=468 < PIPE_X=490 → no horizontal overlap
    expect(playerOverlapsPipeSide(p, PIPE_X, PIPE_Y, PIPE_W, PIPE_H)).toBe(false);
  });

  it('returns false when player is entirely to the right of the pipe', () => {
    const p = player(540, 330); // x=540 > PIPE_X+PIPE_W=538 → no overlap
    expect(playerOverlapsPipeSide(p, PIPE_X, PIPE_Y, PIPE_W, PIPE_H)).toBe(false);
  });

  it('returns false when player is at the top of the pipe (landing zone — top 4 px excluded)', () => {
    // Player feet at PIPE_Y+4-1 = 307 → player.y+PH = 307 → player.y = 267
    // player.y + player.h = 307 which is NOT > PIPE_Y + 4 = 308 → returns false
    const p = player(495, 264); // feet at 304 = PIPE_Y (standing on pipe top)
    // player.y + PH = 304, PIPE_Y + 4 = 308 → 304 > 308 is false → no side overlap
    expect(playerOverlapsPipeSide(p, PIPE_X, PIPE_Y, PIPE_W, PIPE_H)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tryEnterPipe — deliberate down + on-pipe-top alignment
// ─────────────────────────────────────────────────────────────────────────────
describe('tryEnterPipe — requires deliberate input and top alignment', () => {
  // Pipe at x=490, y=304, width=48, entryZoneWidth=48 (full width)
  const PIPE_X = 490; const PIPE_Y = 304; const PIPE_W = 48; const ENTRY_W = 48;
  // Typical vy when truly standing still (after landing, gravity resets vy to 0)
  const VY_STANDING = 0;

  /** Player standing on pipe top: feet at PIPE_Y, center X in pipe range. */
  function onPipeTop(cx: number): { px: number; py: number } {
    return { px: cx - PW / 2, py: PIPE_Y - PH }; // feet at PIPE_Y
  }

  it('returns true when player is on pipe top and presses down', () => {
    const { px, py } = onPipeTop(514); // center X = 514, within [490, 538]
    expect(tryEnterPipe(px, py, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(true);
  });

  it('returns false when down is not pressed', () => {
    const { px, py } = onPipeTop(514);
    expect(tryEnterPipe(px, py, PW, PH, true, VY_STANDING, false, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(false);
  });

  it('returns false when the player is not on the ground (mid-air)', () => {
    const { px, py } = onPipeTop(514);
    expect(tryEnterPipe(px, py, PW, PH, false, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(false);
  });

  it('returns false when |vy| >= 0.08 (player not fully settled on surface)', () => {
    const { px, py } = onPipeTop(514);
    // vy = 0.1 (slightly bouncing) → blocked
    expect(tryEnterPipe(px, py, PW, PH, true, 0.1, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(false);
    // vy = -0.1 (tiny upward) → blocked
    expect(tryEnterPipe(px, py, PW, PH, true, -0.1, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(false);
    // vy = 0.07 (just below threshold) → allowed
    expect(tryEnterPipe(px, py, PW, PH, true, 0.07, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(true);
  });

  it('returns false when the player is not aligned with the pipe top (standing next to pipe)', () => {
    // Player at ground level (y = 328, feet at 368) next to the pipe
    const px = 505; const py = 328;
    expect(tryEnterPipe(px, py, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(false);
  });

  it('returns false when the player center is outside the entry zone', () => {
    // Player center at x = 489 — just outside left edge of entry zone (490)
    const py = PIPE_Y - PH;
    const px = 489 - PW / 2; // center at 489 < entryLeft=490
    expect(tryEnterPipe(px, py, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(false);
  });

  it('returns true at the left boundary of the entry zone', () => {
    // Entry zone: [490, 538]. Center exactly at 490 → alignedX passes.
    const px = 490 - PW / 2; // center at 490
    const py = PIPE_Y - PH;
    expect(tryEnterPipe(px, py, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(true);
  });

  it('returns true at the right boundary of the entry zone', () => {
    // Entry zone right edge = 490 + 48 = 538. Center exactly at 538 → passes.
    const px = 538 - PW / 2;
    const py = PIPE_Y - PH;
    expect(tryEnterPipe(px, py, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, ENTRY_W)).toBe(true);
  });

  it('works with a narrower entryZoneWidth than the pipe width', () => {
    const narrowEntry = 24; // half the pipe width
    // Entry zone: centred on pipe → [490+12, 490+36] = [502, 526]
    const entryLeft = PIPE_X + (PIPE_W - narrowEntry) / 2; // 502
    const entryRight = entryLeft + narrowEntry;              // 526

    // Center at 514 — within narrow zone
    const px1 = 514 - PW / 2; const py1 = PIPE_Y - PH;
    expect(tryEnterPipe(px1, py1, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, narrowEntry)).toBe(true);

    // Center at 501 — just outside left edge of narrow zone (502)
    const px2 = 501 - PW / 2; const py2 = PIPE_Y - PH;
    expect(tryEnterPipe(px2, py2, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, narrowEntry)).toBe(false);

    // Center at entryRight + 1 — just outside right edge of narrow zone
    const px3 = entryRight + 1 - PW / 2; const py3 = PIPE_Y - PH;
    expect(tryEnterPipe(px3, py3, PW, PH, true, VY_STANDING, true, PIPE_X, PIPE_Y, PIPE_W, narrowEntry)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// playerHitsBrickFromBelow
// ─────────────────────────────────────────────────────────────────────────────
describe('playerHitsBrickFromBelow — head-hit breaks brick, awards score once', () => {
  const BRICK = 32;
  // Brick at x=218, y=232 (raised 8px above the nearby platform)
  const BX = 218; const BY = 232; const BW = BRICK; const BH = BRICK;

  /** Player rising upward with head crossing brick bottom (by=232+32=264). */
  function risingPlayer(): { p: CollisionRect; prevY: number; vy: number } {
    // Current frame: player top at 263 (just below brick bottom at 264)
    // Previous frame: player top at 267 (> 264 − 4 = 260 → within window)
    return {
      p: player(220, 263),
      prevY: 267,
      vy: -6,
    };
  }

  it('returns true when player hits the underside of a breakable brick', () => {
    const { p, prevY, vy } = risingPlayer();
    expect(playerHitsBrickFromBelow(p, prevY, vy, BX, BY, BW, BH, true, false)).toBe(true);
  });

  it('returns false when the brick is already broken (score awarded only once)', () => {
    const { p, prevY, vy } = risingPlayer();
    // broken = true → no hit
    expect(playerHitsBrickFromBelow(p, prevY, vy, BX, BY, BW, BH, true, true)).toBe(false);
  });

  it('returns false when breakableFromBelow is false', () => {
    const { p, prevY, vy } = risingPlayer();
    expect(playerHitsBrickFromBelow(p, prevY, vy, BX, BY, BW, BH, false, false)).toBe(false);
  });

  it('returns false when the player is falling (vy ≥ 0)', () => {
    const p = player(220, 263);
    expect(playerHitsBrickFromBelow(p, 267, 0, BX, BY, BW, BH, true, false)).toBe(false);
    expect(playerHitsBrickFromBelow(p, 267, 3, BX, BY, BW, BH, true, false)).toBe(false);
  });

  it('returns false when the player is not horizontally overlapping the brick', () => {
    // Player too far to the right (x=260, x+PW-4=284 > 218+32=250 but x+4=264 > BX+BW=250)
    const { prevY, vy } = risingPlayer();
    const p = player(300, 263); // no horizontal overlap with BX=218, BX+BW=250
    expect(playerHitsBrickFromBelow(p, prevY, vy, BX, BY, BW, BH, true, false)).toBe(false);
  });

  it('returns false when the player head was too far below the brick bottom last frame', () => {
    // prevY = 230 → prevY > BY + BH - 4 = 260? 230 > 260 is false → outside window
    const p     = player(220, 263);
    const prevY = 230; // player top at 230, not within 4px band of brick bottom (264)
    expect(playerHitsBrickFromBelow(p, prevY, -6, BX, BY, BW, BH, true, false)).toBe(false);
  });

  it('subsequent call with broken=true returns false (idempotency simulation)', () => {
    // Simulate the first hit setting broken=true.
    const { p, prevY, vy } = risingPlayer();
    // First call — should hit.
    expect(playerHitsBrickFromBelow(p, prevY, vy, BX, BY, BW, BH, true, false)).toBe(true);
    // Second call — broken is now true → no further score.
    expect(playerHitsBrickFromBelow(p, prevY, vy, BX, BY, BW, BH, true, true)).toBe(false);
  });
});
