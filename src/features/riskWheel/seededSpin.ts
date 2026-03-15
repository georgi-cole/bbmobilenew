/**
 * Seeded RNG helpers for the Risk Wheel.
 *
 * Use these when a deterministic, reproducible spin sequence is required
 * (e.g. automated tests, replay modes). The RNG instance must be created
 * ONCE per match/round and then REUSED for all subsequent spins — never
 * recreate it per spin, or you will get the same first value every time.
 *
 * For interactive UI spins use cryptoSpin.ts instead.
 */
import { mulberry32 } from '../../store/rng';

/** A stateful RNG function that returns a float in [0, 1). */
export type RNG = () => number;

/**
 * Create a seeded RNG using mulberry32.
 * Store the returned function and call it for each draw.
 *
 * @example
 * const rng = createSeededRng(matchSeed);
 * const sector = spinOnceSeeded(rng, WHEEL_SECTORS); // first spin
 * const sector2 = spinOnceSeeded(rng, WHEEL_SECTORS); // second spin — advances state
 */
export function createSeededRng(seed: number): RNG {
  return mulberry32(seed >>> 0);
}

/**
 * Pick one sector from `sectors` by advancing the shared RNG once.
 * Calling this multiple times with the same `rng` advances the sequence
 * so each call produces a different result.
 */
export function spinOnceSeeded<T>(rng: RNG, sectors: readonly T[]): T {
  const idx = Math.floor(rng() * sectors.length);
  return sectors[idx];
}

/**
 * Fair coin flip using the shared seeded RNG.
 * Returns `true` with probability 0.5.
 */
export function coinFlipSeeded(rng: RNG): boolean {
  return rng() < 0.5;
}
