/**
 * rescueTheKingLevels.ts
 *
 * Five hand-designed level configurations for Rescue the King.
 *
 * Each level defines:
 * - A unique blocker layout ('' = normal tile, 'X' = 1-hit crate, 'W' = 2-hit stone)
 * - A deterministic RNG seed for symbol placement
 *
 * Grid is 6 columns × 7 rows. Row 0 is the top.
 *
 * Solvability is ensured by:
 * 1. Blocker layouts are sparse enough that normal tiles always have room to match.
 * 2. The buildBoard() function avoids placing 3-in-a-row at startup.
 * 3. hasAnyValidMove() is checked after board creation; auto-reshuffle up to
 *    MAX_RESHUFFLES times if no moves exist.
 * 4. Win condition is 0 normal tiles remaining (not counting blockers).
 *
 * To tune difficulty:
 * - Add/remove 'X' or 'W' entries in blockerLayout
 * - Change the seed to alter symbol distribution
 * - Adjust TIME_LIMIT_MS in rescueTheKingLogic.ts
 */

import type { LevelConfig } from './rescueTheKingTypes';

export const LEVELS: LevelConfig[] = [
  // ─── Level 1: Easy ─────────────────────────────────────────────────────────
  // Few blockers, wide open board. Good for learning the mechanics.
  {
    id: 1,
    name: 'The Outer Gate',
    rows: 7,
    cols: 6,
    seed: 0xDEAD_BEEF,
    blockerLayout: [
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', 'X', 'X', '', ''],
      ['', '', '', '', '', ''],
      ['', 'X', '', '', 'X', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
    ],
  },

  // ─── Level 2: Normal ───────────────────────────────────────────────────────
  // Four crates in a symmetrical cross pattern. Mild challenge.
  {
    id: 2,
    name: 'The Great Hall',
    rows: 7,
    cols: 6,
    seed: 0xC0FFEE_42,
    blockerLayout: [
      ['', '', '', '', '', ''],
      ['', 'X', '', '', 'X', ''],
      ['', '', '', '', '', ''],
      ['X', '', '', '', '', 'X'],
      ['', '', '', '', '', ''],
      ['', 'X', '', '', 'X', ''],
      ['', '', '', '', '', ''],
    ],
  },

  // ─── Level 3: Medium ───────────────────────────────────────────────────────
  // Mix of 1-hit and 2-hit blockers in a diamond formation.
  {
    id: 3,
    name: 'The Dungeon Corridor',
    rows: 7,
    cols: 6,
    seed: 0x1234_5678,
    blockerLayout: [
      ['', '', '', '', '', ''],
      ['', '', 'W', 'W', '', ''],
      ['', 'X', '', '', 'X', ''],
      ['', '', '', '', '', ''],
      ['', 'X', '', '', 'X', ''],
      ['', '', 'W', 'W', '', ''],
      ['', '', '', '', '', ''],
    ],
  },

  // ─── Level 4: Hard ─────────────────────────────────────────────────────────
  // Dense blocker placement with a central stone wall cluster.
  {
    id: 4,
    name: 'The Guard Tower',
    rows: 7,
    cols: 6,
    seed: 0xABCD_1234,
    blockerLayout: [
      ['', 'X', '', '', 'X', ''],
      ['', '', '', '', '', ''],
      ['X', '', 'W', 'W', '', 'X'],
      ['', '', '', '', '', ''],
      ['X', '', '', '', '', 'X'],
      ['', '', 'X', 'X', '', ''],
      ['', '', '', '', '', ''],
    ],
  },

  // ─── Level 5: Very Hard ────────────────────────────────────────────────────
  // Border ring of mixed blockers — board feels "caged". Strong challenge.
  {
    id: 5,
    name: 'The King\'s Chamber',
    rows: 7,
    cols: 6,
    seed: 0xFEED_FACE,
    blockerLayout: [
      ['', '', 'X', 'X', '', ''],
      ['', 'X', '', '', 'X', ''],
      ['X', '', '', '', '', 'X'],
      ['X', '', 'W', 'W', '', 'X'],
      ['X', '', '', '', '', 'X'],
      ['', 'X', '', '', 'X', ''],
      ['', '', 'X', 'X', '', ''],
    ],
  },
];

/** Pick a level at random using a deterministic seed. */
export function pickLevel(seed: number): LevelConfig {
  // Simple modulo selection — good enough for 5 levels
  const idx = Math.abs(seed) % LEVELS.length;
  return LEVELS[idx];
}
