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
 * Quick Tap target behaviour (strong human runs can reach 300–350 with a
 * favourable booster sequence):
 *   - AI score bands were reduced by 15% (issue #951) so the field is easier
 *     for the player to catch up to.
 *   - Most AI results land around 155–190 (competitive zone).
 *   - Occasional standout AI performances reach ~225–265.
 *   - A 1% perfect-run outcome can reach 350, matching an exceptional human
 *     run that collects the time, 2×, and 3× boosts cleanly.
 *   - Some weaker outcomes exist (~115–135) so results don't feel scripted.
 *   - Hot-streak / slump modifiers add extra variance without being identity-locked.
 */
export const minigameAiBalance: Record<string, MinigameAiTuning> = {
  quickTap: {
    scoringModel: 'bands',
    // Bands reduced by 15% vs the original tuning (issue #951, item 6) to make
    // Quick Tap Race easier for the player to catch up to.
    scoreBands: [
      { chance: 0.03, min: 89, max: 118 },
      { chance: 0.17, min: 119, max: 157 },
      { chance: 0.20, min: 158, max: 187 },
      { chance: 0.30, min: 187, max: 225 },
      { chance: 0.25, min: 226, max: 264 },
      // Rare perfect booster run. With jitter and a hot streak this tops out at 350.
      { chance: 0.05, min: 300, max: 328 },
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
