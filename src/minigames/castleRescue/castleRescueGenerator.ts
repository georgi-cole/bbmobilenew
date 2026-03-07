/**
 * castleRescueGenerator.ts
 *
 * Deterministic level-configuration generator for the Castle Rescue platformer.
 *
 * The castle level has PIPE_SLOT_COUNT (6) fixed pipe positions.  Each run the
 * seed is used to decide which 3 of those slots are the "correct" route pipes
 * (and in what order they must be entered).  The physical level geometry is
 * fixed so the castle always looks and feels the same; only the pipe
 * configuration changes per competition seed.
 *
 * Key guarantees:
 *  - All randomness derives solely from the caller-supplied seed (mulberry32).
 *    No Date.now() or Math.random() is used inside this module.
 *  - Same seed always produces exactly the same LevelConfig.
 *  - All three correct-pipe slot indices are distinct and within [0, PIPE_SLOT_COUNT).
 */

import { mulberry32 } from '../../store/rng';
import { PIPE_SLOT_COUNT, CORRECT_ROUTE_LENGTH } from './castleRescueConstants';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Seed-derived configuration for one Castle Rescue run.
 *
 * correctPipeSlots[0] is the first pipe the player must enter,
 * correctPipeSlots[1] is the second, correctPipeSlots[2] is the third.
 * All other pipe slots are "wrong" pipes.
 */
export interface LevelConfig {
  seed: number;
  /**
   * The three pipe slot indices (0 … PIPE_SLOT_COUNT-1) that form the
   * correct route, in the exact order they must be entered.
   */
  correctPipeSlots: [number, number, number];
}

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generate the deterministic level configuration for the given seed.
 *
 * Uses a Fisher-Yates shuffle of the PIPE_SLOT_COUNT slot indices, seeded with
 * mulberry32, and takes the first CORRECT_ROUTE_LENGTH shuffled positions as
 * the ordered correct route.
 */
export function generateLevelConfig(seed: number): LevelConfig {
  const rng = mulberry32((seed ^ 0xCAFEBABE) >>> 0);

  const slots: number[] = Array.from({ length: PIPE_SLOT_COUNT }, (_, i) => i);

  // Fisher-Yates full shuffle
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = slots[i];
    slots[i] = slots[j];
    slots[j] = tmp;
  }

  return {
    seed,
    correctPipeSlots: [slots[0], slots[1], slots[2]] as [number, number, number],
  };
}

/**
 * Validate a LevelConfig for structural correctness.
 *
 * Checks:
 *  - Exactly CORRECT_ROUTE_LENGTH correct pipe slots.
 *  - All slot indices are within [0, PIPE_SLOT_COUNT).
 *  - No duplicate slot indices.
 *
 * Returns true when all checks pass.
 */
export function validateLevelConfig(config: LevelConfig): boolean {
  const { correctPipeSlots } = config;
  if (correctPipeSlots.length !== CORRECT_ROUTE_LENGTH) return false;
  const seen = new Set<number>();
  for (const slot of correctPipeSlots) {
    if (slot < 0 || slot >= PIPE_SLOT_COUNT) return false;
    if (seen.has(slot)) return false;
    seen.add(slot);
  }
  return true;
}
