/**
 * Central hybrid AI score resolver for score-based minigames.
 *
 * Resolves AI scores AFTER the human score is known, using a hybrid of:
 *  - A per-game realistic score envelope (floor/ceiling based on actual game rules)
 *  - Limited human-score anchoring: 30% human score influence + 70% game baseline
 *    → prevents a human score of 0 from collapsing all AI scores near 0
 *  - Seeded, per-player randomness (deterministic given the same inputs)
 *  - Soft AI profile nudge (very small so the same player never always wins/loses)
 *
 * DOES NOT apply to endurance / survival / last-player-standing competitions.
 * Those remain on the existing precomputed-score path in startMinigame.
 */

import { mulberry32 } from '../../store/rng';
import { getMinigameAiModel } from './index';
import type { CompetitionSkillProfile, MinigameAiModel } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fraction of the human score blended into the anchor (0 = fully ignore human). */
const HUMAN_INFLUENCE = 0.3;

/**
 * Spread factor: offset = (maxScore - minScore) × SPREAD_FACTOR.
 * This controls how wide each outcome bucket is relative to the score range.
 */
const SPREAD_FACTOR = 0.20;

/**
 * Scale factor for the within-bucket profile nudge.
 * Applied as: nudge = (skill − 0.5) × PROFILE_NUDGE_SCALE
 * Since skill ∈ [0, 1] the nudge range is [−0.5, +0.5] × 0.20 = ±0.10
 * (i.e., ±10% of bucket span), keeping outcomes unpredictable.
 */
const PROFILE_NUDGE_SCALE = 0.20;

/** Default score max for games without an explicit range. */
const DEFAULT_SCORE_MAX = 100;

/** Default score min. */
const DEFAULT_SCORE_MIN = 0;

// ── Outcome buckets ───────────────────────────────────────────────────────────

/**
 * Relative outcome buckets, defined as multipliers on the spread offset from anchor.
 * Positive multiplier = better than anchor for the game's scoreDirection.
 *
 * Weights sum to 1.0.
 *  10% → AI performs much worse than human
 *  30% → AI performs somewhat worse
 *  40% → AI performs similarly
 *  15% → AI performs somewhat better
 *   5% → AI performs much better
 */
const OUTCOME_BUCKETS = [
  { lowerMult: -1.4, upperMult: -0.7, weight: 0.10 }, // much-worse
  { lowerMult: -0.7, upperMult: -0.2, weight: 0.30 }, // worse
  { lowerMult: -0.2, upperMult:  0.2, weight: 0.40 }, // around
  { lowerMult:  0.2, upperMult:  0.7, weight: 0.15 }, // better
  { lowerMult:  0.7, upperMult:  1.4, weight: 0.05 }, // much-better
] as const;

// ── Per-game score envelopes ──────────────────────────────────────────────────

/**
 * Explicit score envelope overrides for games where the AI registry's minScore/maxScore
 * are not calibrated against real human play ranges, or where they are missing.
 *
 * baseline: expected score for an average-skill player in a typical run.
 * Used (blended with human score) as the anchor for AI score generation.
 */
const GAME_ENVELOPES: Record<string, { minScore: number; maxScore: number; baseline: number }> = {
  // Quick Tap Race — 30s tap game, boosters active; human typically scores 130–200+
  quickTap: { minScore: 80, maxScore: 280, baseline: 165 },
  // Bullseye Blitz — precision tap game, human typically scores 80–160
  targetPractice: { minScore: 30, maxScore: 220, baseline: 120 },
  // Snake — arcade game with open-ended scoring; typical casual play ~100–400
  snake: { minScore: 0, maxScore: 500, baseline: 200 },
  // Estimation Game — total-score 0–300
  estimationGame: { minScore: 0, maxScore: 300, baseline: 210 },
  // Traveling Dots — route planning puzzle; range 150–880
  travelingDots: { minScore: 150, maxScore: 880, baseline: 500 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Simple DJB2-like hash of a player ID string → numeric seed contribution.
 * Matches the pattern used elsewhere in the AI competition module.
 */
function hashPlayerId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Compute a weighted skill score (0–1) from the AI profile using the game's weights.
 * Falls back to 0.5 (neutral) when no profile or weights are available.
 */
function computeProfileSkill(
  profile: CompetitionSkillProfile | undefined,
  model: MinigameAiModel,
): number {
  if (!profile) return 0.5;
  const w = model.weights;
  if (!w) return clamp((profile.overall ?? 50) / 100, 0, 1);

  const entries: Array<[number | undefined, number | undefined]> = [
    [profile.physical,    w.physical],
    [profile.mental,      w.mental],
    [profile.precision,   w.precision],
    [profile.nerve,       w.nerve],
    [profile.luck,        w.luck],
    [profile.consistency, w.consistency],
    [profile.clutch,      w.clutch],
  ];

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [stat, weight] of entries) {
    if (!weight || weight === 0) continue;
    weightedSum += (stat ?? 50) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return clamp((profile.overall ?? 50) / 100, 0, 1);
  return clamp(weightedSum / totalWeight / 100, 0, 1);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true when the game should use the central hybrid score resolver.
 * Endurance / survival / last-player-standing games are excluded.
 */
export function isHybridScoredGame(gameKey: string): boolean {
  const model = getMinigameAiModel(gameKey);
  // Only exclude endurance-category games; all other score-based games are included.
  return model.category !== 'endurance';
}

export interface HybridAiParticipant {
  id: string;
  profile?: CompetitionSkillProfile;
}

export interface ResolveHybridAiScoresArgs {
  /** The minigame key (e.g. 'quickTap', 'snake'). */
  gameKey: string;
  /** The human player's final score. */
  humanScore: number;
  /** All AI (non-human) participants to resolve scores for. */
  aiParticipants: ReadonlyArray<HybridAiParticipant>;
  /** Session seed (for reproducible results given the same human score). */
  seed: number;
}

/**
 * Resolve final scores for all AI participants after the human finishes playing.
 *
 * The anchor is blended: 30% human score + 70% game baseline.
 * This prevents a human score of 0 from collapsing all AI scores near 0.
 *
 * Profile attributes serve as a small soft nudge (±10% within the chosen bucket)
 * so the same AI player never always wins or always loses.
 *
 * Results are deterministic: same seed + humanScore + aiParticipants → same output.
 */
export function resolveHybridAiScores({
  gameKey,
  humanScore,
  aiParticipants,
  seed,
}: ResolveHybridAiScoresArgs): Record<string, number> {
  const model = getMinigameAiModel(gameKey);

  // Get score envelope — explicit per-game config takes priority over AI registry
  const envelope = GAME_ENVELOPES[gameKey];
  const minScore = envelope?.minScore ?? model.minScore ?? DEFAULT_SCORE_MIN;
  const maxScore = envelope?.maxScore ?? model.maxScore ?? DEFAULT_SCORE_MAX;
  const baseline =
    envelope?.baseline ??
    (model.scoreDirection === 'lower-is-better'
      ? minScore + (maxScore - minScore) * 0.4  // slightly lower (better) side of midpoint
      : minScore + (maxScore - minScore) * 0.6); // slightly upper (better) side of midpoint

  // Clamp human score to the valid game range before using it as anchor input
  const clampedHuman = clamp(humanScore, minScore, maxScore);

  // Hybrid anchor: mostly game baseline, partially influenced by human score
  const anchor = clampedHuman * HUMAN_INFLUENCE + baseline * (1 - HUMAN_INFLUENCE);

  // Spread in score units: controls how wide the outcome buckets are
  const offset = (maxScore - minScore) * SPREAD_FACTOR;

  // Direction sign: positive = "better" means higher score; negative = lower score
  const dirSign = model.scoreDirection === 'lower-is-better' ? -1 : 1;

  const result: Record<string, number> = {};

  for (const participant of aiParticipants) {
    const idHash = hashPlayerId(participant.id);

    // Independent RNGs per participant (bucket selection and position-within-bucket)
    const bucketRng = mulberry32(((seed >>> 0) ^ idHash ^ 0x1a2b3c4d) >>> 0);
    const posRng    = mulberry32(((seed >>> 0) ^ idHash ^ 0xf00dcafe) >>> 0);

    // ── Bucket selection (weighted) ──────────────────────────────────────────
    const roll = bucketRng();
    let cumulative = 0;
    let chosenBucket = OUTCOME_BUCKETS[OUTCOME_BUCKETS.length - 1];
    for (const bucket of OUTCOME_BUCKETS) {
      cumulative += bucket.weight;
      if (roll < cumulative) {
        chosenBucket = bucket;
        break;
      }
    }

    // ── Position within bucket ───────────────────────────────────────────────
    // Triangular distribution (avg of 2 rolls) centres around 0.5.
    const triangular = (posRng() + posRng()) * 0.5;
    // Profile nudge — tiny: high skill biases toward the "better" end of the bucket
    const skill = computeProfileSkill(participant.profile, model);
    const nudge = (skill - 0.5) * PROFILE_NUDGE_SCALE;
    const pos = clamp(triangular + nudge, 0, 1);

    // ── Convert to raw score ─────────────────────────────────────────────────
    // "Better" direction for this game (positive for HiB, negative for LiB).
    const scoreA = anchor + dirSign * chosenBucket.lowerMult * offset;
    const scoreB = anchor + dirSign * chosenBucket.upperMult * offset;
    const bucketLow  = Math.min(scoreA, scoreB);
    const bucketHigh = Math.max(scoreA, scoreB);

    const rawScore = bucketLow + pos * (bucketHigh - bucketLow);
    result[participant.id] = clamp(Math.round(rawScore), minScore, maxScore);
  }

  return result;
}
