/**
 * Fast, synchronous background AI simulation for the Risk Wheel.
 *
 * Runs entirely in-memory without any Redux dispatches so the caller
 * can compute final scores quickly (e.g. before showing the leaderboard)
 * without waiting for the full animated turn loop.
 *
 * The simulation mirrors the logic inside `riskWheelSlice.resolveAllAiTurns`:
 * each AI player spins up to MAX_SPINS_PER_TURN times, applies sector effects,
 * and stops when they decide to bank or when their spins are exhausted.
 */
import { mulberry32 } from '../../store/rng';
import { cryptoSeed } from './cryptoSpin';
import {
  WHEEL_SECTORS,
  MAX_SPINS_PER_TURN,
  pickSectorIndex,
  resolve666Effect,
  type RiskWheelAiPersonality,
} from './riskWheelSlice';

export interface AiSimPlayer {
  id: string;
  personality?: RiskWheelAiPersonality;
}

export interface AiSimResult {
  id: string;
  score: number;
}

/**
 * Simulate a single round of Risk Wheel turns for all provided AI players.
 *
 * @param players    List of AI participants (id + optional personality).
 * @param seed       Optional deterministic seed. Pass a non-zero value for
 *                   reproducible results. Omit or pass `0` to use a fresh
 *                   crypto-random seed. Both `undefined` and `0` are treated
 *                   as "no seed provided — use random", which is consistent
 *                   with the `0 = default/unset` convention used by MinigameHost.
 * @returns          Array of {id, score} for each simulated player.
 */
export function simulateAiTurns(
  players: AiSimPlayer[],
  seed?: number,
): AiSimResult[] {
  // seed=0 and seed=undefined are both treated as "no seed provided" — use
  // crypto-random.  Any other value (including negative numbers, which become
  // large positive values after >>>0) is used as a deterministic seed.
  const effectiveSeed = seed !== undefined && seed !== 0 ? seed >>> 0 : cryptoSeed();
  // Use a separate RNG stream from the spin RNG to avoid entanglement.
  const decisionRng = mulberry32((effectiveSeed ^ 0xdeadbeef) >>> 0);

  const results: AiSimResult[] = [];
  let rngCallCount = 0;

  for (const player of players) {
    let score = 0;
    const personality = player.personality ?? 'balanced';
    const stopThreshold = personality === 'cautious' ? 0.45 : personality === 'risky' ? 0.65 : 0.55;

    for (let spin = 0; spin < MAX_SPINS_PER_TURN; spin++) {
      const sectorIdx = pickSectorIndex(effectiveSeed, rngCallCount);
      rngCallCount += 1;

      const sector = WHEEL_SECTORS[sectorIdx];
      if (!sector) break;

      if (sector.type === 'bankrupt') {
        score = 0;
        break;
      } else if (sector.type === 'skip') {
        break;
      } else if (sector.type === 'zero') {
        // No score change; AI may still spin again unless last spin.
      } else if (sector.type === 'devil') {
        const effect = resolve666Effect(effectiveSeed, rngCallCount);
        rngCallCount += 1;
        score += effect === 'add' ? 666 : -666;
      } else if (sector.type === 'points') {
        score += sector.value ?? 0;
      }

      // Decision: spin again?
      const isLastSpin = spin >= MAX_SPINS_PER_TURN - 1;
      if (isLastSpin) break;

      const roll = decisionRng();
      const shouldStop = score > 0 && roll > stopThreshold;
      if (shouldStop) break;
    }

    results.push({ id: player.id, score });
  }

  return results;
}
