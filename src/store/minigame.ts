import { mulberry32 } from './rng';

/** AI difficulty level for TapRace competitions. */
export type AiDifficulty = 'HARD';

/** Default TapRace options used for test/normal gameplay. */
export const DEFAULT_TAPRACE_OPTIONS = { timeLimit: 10 } as const;

/**
 * Simulate a deterministic TapRace score for an AI player.
 *
 * HARD difficulty: 75–90 taps in a 10-second window.
 * The score is fully determined by `seed` so replays are reproducible.
 */
export function simulateTapRaceAI(seed: number, difficulty: AiDifficulty = 'HARD'): number {
  void difficulty; // Reserved for future difficulty tiers
  const rng = mulberry32(seed >>> 0);
  // HARD: [75, 90] taps — highly competitive, near human maximum
  return 75 + Math.floor(rng() * 16);
}
