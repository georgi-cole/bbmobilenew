import { mulberry32 } from './rng';

/** AI difficulty level for TapRace competitions. */
export type AiDifficulty = 'HARD';

/** Default TapRace options used for test/normal gameplay. */
export const DEFAULT_TAPRACE_OPTIONS = { timeLimit: 10 } as const;

/**
 * Simulate a deterministic TapRace score for an AI player.
 *
 * HARD difficulty baseline (10 s window): 75–90 taps.
 * The score is fully determined by `seed` so replays are reproducible.
 * For other time limits the expected tap range is scaled linearly from the
 * 10-second baseline, preserving the exact [75, 90] result when timeLimit = 10.
 */
export function simulateTapRaceAI(
  seed: number,
  difficulty: AiDifficulty = 'HARD',
  timeLimitSeconds: number = DEFAULT_TAPRACE_OPTIONS.timeLimit,
): number {
  void difficulty; // Reserved for future difficulty tiers
  const rng = mulberry32(seed >>> 0);

  // Baseline parameters for a 10-second window.
  const BASE_WINDOW_SECONDS = 10;
  const BASE_MIN_TAPS = 75;
  const BASE_RANGE_TAPS = 16; // inclusive range: [75, 90]

  const scale = timeLimitSeconds / BASE_WINDOW_SECONDS;

  // Preserve exact integer arithmetic when timeLimitSeconds === 10 (common path).
  if (scale === 1) {
    return BASE_MIN_TAPS + Math.floor(rng() * BASE_RANGE_TAPS);
  }

  // Scale min and range for non-default time limits. Always ensure range >= 1.
  const scaledMin = Math.round(BASE_MIN_TAPS * scale);
  const scaledRange = Math.max(1, Math.round(BASE_RANGE_TAPS * scale));
  return scaledMin + Math.floor(rng() * scaledRange);
}
