/**
 * tests/unit/castle-rescue/resolveFullSolidCollision.test.ts
 *
 * Unit tests for resolveFullSolidCollision — the full AABB minimal-axis
 * separation resolver exported from castleRescueEngine.ts.
 *
 * Tested scenarios:
 *  - Landing on top     : falling player lands on platform top → onGround=true, vy=0
 *  - Hitting underside  : rising player hits platform bottom → pushed below, vy=0
 *  - Side collision     : player walks into platform side → pushed out, vx=0
 *  - No overlap         : non-overlapping rects → state unchanged
 */

import { describe, it, expect } from 'vitest';
import { resolveFullSolidCollision } from '../../../src/minigames/castleRescue/castleRescueEngine';
import type { CollisionRect } from '../../../src/minigames/castleRescue/castleRescueEngine';

// ── Fixtures ──────────────────────────────────────────────────────────────────
// All coordinates use canvas convention: y increases downward.

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
// Landing on top
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveFullSolidCollision — landing on top', () => {
  it('returns onGround=true, vy=0, and y=surface.y-player.h when falling onto platform', () => {
    // Platform at y=300, h=16. Player feet at 303 (just past surface top).
    const surf   = surface(100, 300, 200, 16);
    const p      = player(150, 263); // feet at 263+40=303 — inside platform
    const prevY  = 258;              // feet at 258+40=298 — above (≤ 300+4)
    const result = resolveFullSolidCollision(p, p.x, prevY, 0, 3, surf);

    expect(result.onGround).toBe(true);
    expect(result.vy).toBe(0);
    expect(result.y).toBe(surf.y - PH); // 300 - 40 = 260
  });

  it('lands correctly when player is exactly at the 4 px grace boundary', () => {
    // prevY feet = surf.y + 4 exactly → still counts as landing
    const surf   = surface(100, 300, 200, 16);
    const p      = player(150, 262); // feet at 302 — inside
    const prevY  = 264;              // feet at 304 = surf.y + 4 — boundary
    const result = resolveFullSolidCollision(p, p.x, prevY, 0, 2, surf);

    expect(result.onGround).toBe(true);
    expect(result.vy).toBe(0);
    expect(result.y).toBe(surf.y - PH);
  });

  it('works for a wide ground surface', () => {
    const ground = surface(0, 368, 4800, 32);
    const p      = player(80, 329); // feet at 369 — just landed
    const prevY  = 326;             // feet at 366 ≤ 368+4
    const result = resolveFullSolidCollision(p, p.x, prevY, 0, 4, ground);

    expect(result.onGround).toBe(true);
    expect(result.vy).toBe(0);
    expect(result.y).toBe(ground.y - PH); // 368 - 40 = 328
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hitting underside
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveFullSolidCollision — hitting underside', () => {
  it('pushes player below surface and zeros vy when rising into underside', () => {
    // Platform: y=200, h=16 → bottom at 216.
    // Player top at 213 — overlapping from below; prev top at 222 (≥ 216-4=212).
    const plat   = surface(50, 200, 160, 16);
    const p      = player(80, 213); // top at 213, inside platform
    const prevY  = 222;             // top at 222 — was below platform bottom
    const result = resolveFullSolidCollision(p, p.x, prevY, 0, -5, plat);

    expect(result.onGround).toBe(false);
    expect(result.vy).toBe(0);
    expect(result.y).toBe(plat.y + plat.h); // 200 + 16 = 216
  });

  it('zeros vy on underside hit regardless of how fast player was moving up', () => {
    const plat   = surface(50, 200, 160, 16);
    const p      = player(80, 212);
    const prevY  = 225;
    const result = resolveFullSolidCollision(p, p.x, prevY, 0, -12, plat);

    expect(result.vy).toBe(0);
    expect(result.y).toBe(plat.y + plat.h);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Side collision
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveFullSolidCollision — side collision', () => {
  it('pushes player to the left of the surface and zeros vx when approaching from left', () => {
    // Surface at x=200, w=80 → right edge 280.
    // Player right edge at 205 — small horizontal overlap.
    const surf   = surface(200, 280, 80, 16);
    // Player standing at y=250 — vertical overlap is large (feet at 290 past surf y=280)
    // so horizontal should be minimal axis.
    const p      = player(177, 250); // x+28=205 → 5px horizontal overlap; y+40=290 → 10px vertical overlap
    const prevX  = 170;              // was to the left
    const prevY  = 248;              // was above → but with large vertical overlap we'd land
    // Make overlapX < overlapY by positioning so horizontal is definitely smaller
    // surf y=280, p.y=255: overlapY = min(255+40,280+16)-max(255,280) = min(295,296)-280 = 295-280 = 15
    // surf x=200, p.x+28=203: overlapX = min(203,280)-max(175,200) = 203-200 = 3
    const p2     = player(175, 255);
    const result = resolveFullSolidCollision(p2, 170, 253, 3, 0, surf);

    expect(result.vx).toBe(0);
    expect(result.x).toBe(surf.x - PW); // 200 - 28 = 172
    expect(result.onGround).toBe(false);
  });

  it('pushes player to the right of the surface when approaching from right', () => {
    // Surface at x=100, w=80 → right edge 180.
    // Player approaching from the right: prev center > surf center.
    const surf   = surface(100, 280, 80, 16);
    // Player x=175 → overlap = min(175+28,180)-max(175,100) = min(203,180)-175 = 180-175 = 5px horiz
    // vertical overlap: min(255+40,296)-max(255,280) = min(295,296)-280 = 295-280 = 15px
    // overlapX(5) < overlapY(15) → horizontal resolution
    const p      = player(175, 255);
    const result = resolveFullSolidCollision(p, 182, 253, -3, 0, surf);

    expect(result.vx).toBe(0);
    expect(result.x).toBe(surf.x + surf.w); // 100 + 80 = 180
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No overlap
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveFullSolidCollision — no overlap', () => {
  it('returns unchanged state when player and surface do not overlap', () => {
    const surf   = surface(200, 300, 80, 16);
    const p      = player(100, 200); // completely above and to the left
    const result = resolveFullSolidCollision(p, 98, 198, 3, 2, surf);

    expect(result.x).toBe(p.x);
    expect(result.y).toBe(p.y);
    expect(result.vx).toBe(3);
    expect(result.vy).toBe(2);
    expect(result.onGround).toBe(false);
  });

  it('returns unchanged state when player is directly below the surface (no vertical overlap)', () => {
    const surf   = surface(100, 200, 160, 16);
    const p      = player(120, 220); // top at 220 > surf bottom 216 → no overlap
    const result = resolveFullSolidCollision(p, 120, 218, 0, 2, surf);

    expect(result.y).toBe(220);
    expect(result.onGround).toBe(false);
  });
});
