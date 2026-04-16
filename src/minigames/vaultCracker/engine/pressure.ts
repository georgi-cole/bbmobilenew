import { clamp } from '../utils/math';

export function computeVaultCrackerPressure({
  attempts,
  bestBulls,
  elapsedMs,
  timeLimitMs,
}: {
  attempts: number;
  bestBulls: number;
  elapsedMs: number;
  timeLimitMs: number | null;
}): number {
  if (timeLimitMs !== null && timeLimitMs > 0) {
    return clamp(elapsedMs / timeLimitMs, 0.04, 1);
  }

  return clamp(attempts / 12 + bestBulls * 0.08 + elapsedMs / 180_000, 0.06, 1);
}
