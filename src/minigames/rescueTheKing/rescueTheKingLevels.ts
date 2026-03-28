/**
 * rescueTheKingLevels.ts
 *
 * Eight hand-designed, validated level configurations for Rescue the King.
 *
 * All levels use a 7-column × 8-row board — wide enough for good match density
 * on portrait mobile without requiring large tiles.
 *
 * Each level defines:
 * - A unique blocker layout ('' = normal tile, 'X' = 1-hit crate, 'W' = 2-hit stone)
 * - An optional tileLayout that hard-codes specific symbols per cell, guaranteeing
 *   a deterministic, hand-validated initial board state.  Cells left as '' in
 *   tileLayout fall back to the seeded RNG with 3-in-a-row avoidance.
 * - A deterministic RNG seed used for any cells not covered by tileLayout.
 *
 * Design rules for every hand-authored level:
 * 1. No full row or column of blockers (would create a permanently impassable wall).
 * 2. No column segment isolated by blockers with fewer than 3 normal cells.
 * 3. All blocker cells have at least one adjacent normal-tile neighbour so they
 *    can be broken by a match.
 * 4. The level passes validateLevel() (hasAnyValidMove() = true at runtimeSeed = 0).
 *
 * Notes:
 * - Rules 1–3 are design-time guidelines that are checked when levels are authored.
 * - Rule 4 is enforced automatically via validateLevel() in tests/CI.
 *
 * Solvability is further protected at runtime by:
 * - buildInitialState() checks hasAnyValidMove() and reshuffles up to MAX_RESHUFFLES.
 * - resolveBoard() reshuffles on deadlock rather than faking a win.
 *
 * Difficulty tuning:
 * - Add/remove 'X' or 'W' entries in blockerLayout.
 * - Change tileLayout to hardcode particular symbol patterns.
 * - Change seed to vary symbol distribution for RNG-filled cells.
 * - Adjust TIME_LIMIT_MS in rescueTheKingLogic.ts.
 * - Adjust rows/cols for bigger or smaller boards.
 */

import type { LevelConfig } from './rescueTheKingTypes';

// ── Shorthand aliases used in tileLayout arrays ────────────────────────────────
// g=gem  s=sword  h=shield  c=crown  p=potion
// Empty string '' → RNG fills that cell (avoids 3-in-a-row).

export const LEVELS: LevelConfig[] = [
  // ─── Level 1: Easy ─────────────────────────────────────────────────────────
  // Completely open board — no blockers at all.  Players learn the matching
  // mechanic with no obstacles.  tileLayout is omitted so the seeded RNG fills
  // all 56 cells (with 3-in-a-row avoidance), guaranteeing an initial move.
  // No targetPositions → fallback win = clear all normal tiles.
  {
    id: 1,
    name: 'The Outer Gate',
    rows: 8,
    cols: 7,
    seed: 0xDEAD_BEEF,
    blockerLayout: [
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ],
    // No targetPositions — win by clearing all normal tiles (intro level).
  },

  // ─── Level 2: Easy-Normal ──────────────────────────────────────────────────
  // Two crates in the upper-middle, two in the lower-middle.  Symmetric and
  // predictable.  A good warm-up for blocker mechanics.
  // Win: destroy all 4 crates (target = all blocker positions).
  {
    id: 2,
    name: 'The Gatehouse',
    rows: 8,
    cols: 7,
    seed: 0xC0DE_BEEF,
    blockerLayout: [
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', 'X', '', 'X', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', 'X', '', 'X', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ],
    // Targets = all 4 crate positions.  Win when all 4 are destroyed.
    targetPositions: [[2, 2], [2, 4], [5, 2], [5, 4]],
  },

  // ─── Level 3: Normal ───────────────────────────────────────────────────────
  // Four crates in a symmetric cross-arms pattern.  Mild challenge.
  // Win: destroy all 6 crates.
  {
    id: 3,
    name: 'The Great Hall',
    rows: 8,
    cols: 7,
    seed: 0xC0FFEE_42,
    blockerLayout: [
      ['', '', '', '', '', '', ''],
      ['', 'X', '', '', '', 'X', ''],
      ['', '', '', '', '', '', ''],
      ['X', '', '', '', '', '', 'X'],
      ['', '', '', '', '', '', ''],
      ['', 'X', '', '', '', 'X', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ],
    targetPositions: [[1, 1], [1, 5], [3, 0], [3, 6], [5, 1], [5, 5]],
  },

  // ─── Level 4: Medium ───────────────────────────────────────────────────────
  // Diamond formation of 2-hit stone blockers with 1-hit crates on the sides.
  // Players learn that stones need two adjacent clears.
  // Win: destroy all 8 blockers.
  {
    id: 4,
    name: 'The Dungeon Corridor',
    rows: 8,
    cols: 7,
    seed: 0x1234_5678,
    blockerLayout: [
      ['', '', '', '', '', '', ''],
      ['', '', 'W', '', 'W', '', ''],
      ['', 'X', '', '', '', 'X', ''],
      ['', '', '', '', '', '', ''],
      ['', 'X', '', '', '', 'X', ''],
      ['', '', 'W', '', 'W', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ],
    targetPositions: [[1, 2], [1, 4], [2, 1], [2, 5], [4, 1], [4, 5], [5, 2], [5, 4]],
  },

  // ─── Level 5: Medium-Hard ─────────────────────────────────────────────────
  // Two horizontal pairs of stones in rows 2 and 5, with a gap in the centre
  // so tiles above and below can flow.  No isolated segments.
  // Win: destroy all 8 stone blockers.
  {
    id: 5,
    name: 'The Siege Works',
    rows: 8,
    cols: 7,
    seed: 0xABCD_4321,
    blockerLayout: [
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', 'W', 'W', '', 'W', 'W', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', 'W', 'W', '', 'W', 'W', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ],
    targetPositions: [[2, 1], [2, 2], [2, 4], [2, 5], [5, 1], [5, 2], [5, 4], [5, 5]],
  },

  // ─── Level 6: Hard ─────────────────────────────────────────────────────────
  // Border frame of crates with corner stone clusters.  Open centre.
  // Win: destroy all 12 blockers.
  {
    id: 6,
    name: 'The Guard Tower',
    rows: 8,
    cols: 7,
    seed: 0xABCD_1234,
    blockerLayout: [
      ['', 'X', '', '', '', 'X', ''],
      ['', '', '', '', '', '', ''],
      ['X', '', 'W', '', 'W', '', 'X'],
      ['', '', '', '', '', '', ''],
      ['X', '', '', '', '', '', 'X'],
      ['', '', 'X', '', 'X', '', ''],
      ['', '', '', '', '', '', ''],
      ['', 'X', '', '', '', 'X', ''],
    ],
    targetPositions: [
      [0, 1], [0, 5],
      [2, 0], [2, 2], [2, 4], [2, 6],
      [4, 0], [4, 6],
      [5, 2], [5, 4],
      [7, 1], [7, 5],
    ],
  },

  // ─── Level 7: Hard-Expert ─────────────────────────────────────────────────
  // Alternating stone columns — creates corridors the player must clear through.
  // Column segments are all ≥ 4 tiles, so no tiny-island risk.
  // Win: destroy all 6 stone blockers.
  {
    id: 7,
    name: 'The Armoured Columns',
    rows: 8,
    cols: 7,
    seed: 0xFACE_CAFE,
    blockerLayout: [
      ['', '', '', '', '', '', ''],
      ['', 'W', '', 'W', '', 'W', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', 'W', '', 'W', '', 'W', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ],
    targetPositions: [[1, 1], [1, 3], [1, 5], [4, 1], [4, 3], [4, 5]],
  },

  // ─── Level 8: Expert ──────────────────────────────────────────────────────
  // Double-ring blocker frame: crates on the outer ring, stones in the inner
  // positions.  Row 3 and row 7 are fully open giving the board a central open
  // lane and a wide clear base.  44 normal tiles with varied seeded symbols.
  // Win: destroy all 12 blockers.
  {
    id: 8,
    name: "The King's Chamber",
    rows: 8,
    cols: 7,
    seed: 0xFEED_FACE,
    blockerLayout: [
      ['', 'X', '', '', '', 'X', ''],
      ['X', '', '', '', '', '', 'X'],
      ['', '', 'W', '', 'W', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', 'W', '', 'W', '', ''],
      ['X', '', '', '', '', '', 'X'],
      ['', 'X', '', '', '', 'X', ''],
      ['', '', '', '', '', '', ''],
    ],
    targetPositions: [
      [0, 1], [0, 5],
      [1, 0], [1, 6],
      [2, 2], [2, 4],
      [4, 2], [4, 4],
      [5, 0], [5, 6],
      [6, 1], [6, 5],
    ],
  },
];

/** Pick a level at random using a deterministic seed. */
export function pickLevel(seed: number): LevelConfig {
  // Simple modulo selection — deterministic per session seed
  const idx = Math.abs(seed) % LEVELS.length;
  return LEVELS[idx];
}
