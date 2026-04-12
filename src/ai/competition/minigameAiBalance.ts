/**
 * Central per-minigame AI score balance configuration.
 *
 * This is the single authoritative location for tuning AI score distributions.
 * Edit entries here whenever AI scores feel unrealistic — no other file needs
 * to change for a pure balancing adjustment.
 *
 * Shape:
 *   scoreBands   — weighted probability bands; chances must sum to 1.0.
 *   jitter       — small ±N random offset applied after band selection.
 *   hotStreakChance / hotStreakBonusMin / hotStreakBonusMax
 *                — occasional burst above the rolled band score.
 *   slumpChance  / slumpPenaltyMin / slumpPenaltyMax
 *                — occasional dip below the rolled band score.
 *
 * Only games that need custom band-based scoring need an entry here.
 * Games handled by the generic simulateAiPerformance() path do not require
 * an entry (their model data lives in minigameAiRegistry.ts).
 */

export interface ScoreBand {
  /** Probability weight for this band (0–1). All bands in a config should sum to 1.0. */
  chance: number;
  min: number;
  max: number;
}

export interface MinigameAiTuning {
  scoringModel: 'bands';
  scoreBands: ScoreBand[];
  /** Small random jitter ±jitter applied after band selection (default 0). */
  jitter?: number;
  /** Probability of a hot-streak run that adds a bonus on top of the base score. */
  hotStreakChance?: number;
  hotStreakBonusMin?: number;
  hotStreakBonusMax?: number;
  /** Probability of a slump run that subtracts a penalty from the base score. */
  slumpChance?: number;
  slumpPenaltyMin?: number;
  slumpPenaltyMax?: number;
}

/**
 * Validate that the score band chances in a tuning config sum to 1.0 (within ±0.01
 * floating-point tolerance). Logs a warning in development — does not throw in
 * production so a misconfiguration never crashes the game.
 */
function validateBandChances(key: string, tuning: MinigameAiTuning): void {
  const total = tuning.scoreBands.reduce((sum, b) => sum + b.chance, 0);
  if (Math.abs(total - 1.0) > 0.01) {
    const msg = `[minigameAiBalance] "${key}" scoreBand chances sum to ${total.toFixed(4)}, expected 1.0`;
    if (import.meta.env.DEV) {
      console.warn(msg);
    }
  }
}

/**
 * Per-minigame AI balance configuration.
 *
 * Quick Tap target behaviour (humans routinely score 175–220):
 *   - Most AI results land around 180–235 (competitive zone).
 *   - Occasional standout AI performances reach 240–265.
 *   - Some weaker outcomes exist (135–160) so results don't feel scripted.
 *   - Hot-streak / slump modifiers add extra variance without being identity-locked.
 */
export const minigameAiBalance: Record<string, MinigameAiTuning> = {
  quickTap: {
    scoringModel: 'bands',
    scoreBands: [
      { chance: 0.08, min: 105, max: 120 },
      { chance: 0.22, min: 121, max: 165 },
      { chance: 0.32, min: 166, max: 189 },
      { chance: 0.25, min: 190, max: 205 },
      { chance: 0.13, min: 206, max: 235 },
    ],
    jitter: 4,
    hotStreakChance: 0.10,
    hotStreakBonusMin: 8,
    hotStreakBonusMax: 18,
    slumpChance: 0.08,
    slumpPenaltyMin: 6,
    slumpPenaltyMax: 14,
  },
};

// Validate all entries at module load time so misconfiguration is caught early.
for (const [key, tuning] of Object.entries(minigameAiBalance)) {
  validateBandChances(key, tuning);
}
