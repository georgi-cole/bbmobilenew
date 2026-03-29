import type { Player } from '../../types';
import { mulberry32 } from '../../store/rng';
import { resolveAvatar } from '../../utils/avatar';

export type TargetKind = 'standard' | 'bonus' | 'hazard';

export interface BullseyeRoundConfig {
  roundNumber: number;
  durationSeconds: number;
  spawnIntervalMs: number;
  maxTargets: number;
  targetWeights: Record<TargetKind, number>;
  targetLifetimes: Record<TargetKind, number>;
  hazardPenalty: number;
  difficultyLabel: string;
}

interface TargetConfig {
  emoji: string;
  /** Base score delta when tapped. */
  points: number;
  /** Milliseconds the target lives before disappearing. */
  lifetimeMs: number;
  /** CSS class modifier. */
  cls: string;
  /** Tooltip / aria label. */
  label: string;
}

export const TARGET_CONFIGS: Record<TargetKind, TargetConfig> = {
  standard: {
    emoji: '🎯',
    points: 10,
    lifetimeMs: 2200,
    cls: 'bbl__target--standard',
    label: 'Standard target +10',
  },
  bonus: {
    emoji: '⭐',
    points: 25,
    lifetimeMs: 1300,
    cls: 'bbl__target--bonus',
    label: 'Bonus target +25',
  },
  hazard: {
    emoji: '💣',
    points: -15,
    lifetimeMs: 2800,
    cls: 'bbl__target--hazard',
    label: 'Hazard! −15 if tapped',
  },
};

const DEFAULT_TARGET_WEIGHTS: Record<TargetKind, number> = {
  standard: 0.6,
  bonus: 0.25,
  hazard: 0.15,
};

const ROUND_PRESETS = [
  {
    durationSeconds: 18,
    spawnIntervalMs: 560,
    maxTargets: 6,
    targetWeights: { standard: 0.58, bonus: 0.27, hazard: 0.15 },
    lifetimeMultiplier: 1,
    hazardPenalty: -15,
    difficultyLabel: 'Opening round — balanced targets and a steady pace.',
  },
  {
    durationSeconds: 17,
    spawnIntervalMs: 500,
    maxTargets: 7,
    targetWeights: { standard: 0.54, bonus: 0.24, hazard: 0.22 },
    lifetimeMultiplier: 0.94,
    hazardPenalty: -20,
    difficultyLabel: 'Things speed up — and the bombs get cheekier.',
  },
  {
    durationSeconds: 16,
    spawnIntervalMs: 450,
    maxTargets: 8,
    targetWeights: { standard: 0.5, bonus: 0.22, hazard: 0.28 },
    lifetimeMultiplier: 0.88,
    hazardPenalty: -25,
    difficultyLabel: 'Pressure round — blink and you might miss your shot.',
  },
  {
    durationSeconds: 15,
    spawnIntervalMs: 410,
    maxTargets: 8,
    targetWeights: { standard: 0.46, bonus: 0.21, hazard: 0.33 },
    lifetimeMultiplier: 0.82,
    hazardPenalty: -30,
    difficultyLabel: 'Semi-final scramble — the arena gets wild now.',
  },
  {
    durationSeconds: 14,
    spawnIntervalMs: 370,
    maxTargets: 9,
    targetWeights: { standard: 0.42, bonus: 0.2, hazard: 0.38 },
    lifetimeMultiplier: 0.76,
    hazardPenalty: -35,
    difficultyLabel: 'Final sprint — pure chaos, pure glory.',
  },
] as const;

export const BULLSEYE_CHALLENGE_ROUNDS = ROUND_PRESETS.length;

/**
 * Envelope ceiling for the targetPractice hybrid score resolver.
 * Used to normalise an AI's per-round baseScore to a 0–1 skill level so that
 * the full envelope range (80–500) maps to distinct, graded skill levels:
 *   baseScore  80 → skill ≈ 0.16 (weakest)
 *   baseScore 300 → skill ≈ 0.60 (average-human baseline)
 *   baseScore 500 → skill = 1.00 (near-perfect)
 */
const AI_SCORE_MAX = 500;

/**
 * Select a random target kind using weighted distribution.
 * Defaults to:
 *  standard:  60 %
 *  bonus:     25 %
 *  hazard:    15 %
 * Callers can override the default weights for harder tournament rounds.
 */
export function pickTargetKind(
  random01: number,
  weights: Record<TargetKind, number> = DEFAULT_TARGET_WEIGHTS,
): TargetKind {
  const standardThreshold = weights.standard;
  const bonusThreshold = standardThreshold + weights.bonus;
  if (random01 < standardThreshold) return 'standard';
  if (random01 < bonusThreshold) return 'bonus';
  return 'hazard';
}

export function getBullseyeRoundConfig(roundNumber: number): BullseyeRoundConfig {
  const preset = ROUND_PRESETS[Math.min(Math.max(roundNumber - 1, 0), ROUND_PRESETS.length - 1)];

  return {
    roundNumber,
    durationSeconds: preset.durationSeconds,
    spawnIntervalMs: preset.spawnIntervalMs,
    maxTargets: preset.maxTargets,
    targetWeights: preset.targetWeights,
    targetLifetimes: {
      standard: Math.round(TARGET_CONFIGS.standard.lifetimeMs * preset.lifetimeMultiplier),
      bonus: Math.round(TARGET_CONFIGS.bonus.lifetimeMs * preset.lifetimeMultiplier),
      hazard: Math.round(TARGET_CONFIGS.hazard.lifetimeMs * preset.lifetimeMultiplier),
    },
    hazardPenalty: preset.hazardPenalty,
    difficultyLabel: preset.difficultyLabel,
  };
}

/**
 * Compute how many players to cut after a Bullseye Blitz round.
 *
 * The default target is to remove roughly the bottom 20% of the active field,
 * while also pacing the bracket so a five-round tournament reaches a final
 * duel with two contestants by the last round. Once exactly two contestants
 * remain, callers should treat that as the final duel and skip this helper.
 */
export function getBullseyeEliminationCount(
  activeCount: number,
  roundNumber: number,
  totalRounds: number = BULLSEYE_CHALLENGE_ROUNDS,
): number {
  if (activeCount <= 2) return 0;

  const remainingEliminationRounds = Math.max(1, totalRounds - roundNumber);
  const minimumCut = Math.max(1, Math.floor(activeCount * 0.2));
  const paceCut = Math.floor((activeCount - 2) / remainingEliminationRounds);

  return Math.min(activeCount - 2, Math.max(minimumCut, paceCut));
}

export interface ScoreEntry {
  id: string;
  name: string;
  avatar: string;
  score: number;
  hits: { standard: number; bonus: number; hazard: number };
  isHuman: boolean;
}

/**
 * Build a ranked leaderboard from raw scores + participant list.
 *
 * Tie-breaking rule (deterministic):
 *   Equal scores → lower participant index wins (earlier in the participants array).
 *   This is explicit and documented so it is never silently falling back to
 *   arbitrary order.
 */
export function buildRankedLeaderboard(
  participants: string[],
  scores: Record<string, number>,
  humanId: string | undefined,
  players: Player[],
  humanHits?: { standard: number; bonus: number; hazard: number },
): ScoreEntry[] {
  type RankedEntry = ScoreEntry & { participantIndex: number };

  const entries: RankedEntry[] = participants.map((id, idx) => {
    const p = players.find((pl) => pl.id === id);
    const isHuman = id === humanId;
    return {
      id,
      name: p?.name ?? id,
      avatar: p ? resolveAvatar(p) : '🧑',
      score: scores[id] ?? 0,
      hits: isHuman && humanHits
        ? humanHits
        : { standard: 0, bonus: 0, hazard: 0 },
      isHuman,
      participantIndex: idx,
    };
  });

  const rankedEntries = entries.sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) return diff;
    return a.participantIndex - b.participantIndex;
  });

  return rankedEntries.map(({ participantIndex: _participantIndex, ...entry }) => entry);
}

function hashTournamentSeed(seed: number, participantId: string, roundNumber: number): number {
  let hash = seed ^ (roundNumber * 0x9e3779b9);
  for (let i = 0; i < participantId.length; i += 1) {
    hash = Math.imul(hash ^ participantId.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

/**
 * Simulate one complete Bullseye Blitz round for an AI player.
 *
 * The simulation advances in steps of `spawnIntervalMs` (matching the real
 * spawner tick) and maintains an active-target list with per-target expiry
 * timestamps.  This mirrors the real spawner's maxTargets gate: when the
 * screen is full of un-tapped targets the spawner skips a tick, exactly as
 * `BullseyeBlitz.tsx` does with `if (prev.length >= currentRoundConfig.maxTargets) return prev`.
 *
 * Skill traits derived from `skillLevel` (0–1):
 *   - reactionSpeed:   reduces the effective tap window for short-lived targets
 *   - hitAccuracy:     probability of successfully tapping a reachable target
 *   - bonusFocusRatio: extra difficulty modifier for the short-lived bonus targets
 *   - hazardAvoidance: probability of NOT accidentally tapping a hazard target
 *
 * @param config     Round configuration (spawn rate, lifetimes, weights, penalties)
 * @param skillLevel Composite 0–1 AI skill (0 = weakest, 1 = near-perfect)
 * @param rng        Seeded RNG for deterministic, per-player results
 */
function runBullseyeAiRound(
  config: BullseyeRoundConfig,
  skillLevel: number,
  rng: () => number,
): number {
  // Skill-to-trait mapping:
  //   skill 0 → slow reactions, low accuracy, frequently hits hazards
  //   skill 1 → fast reactions, near-perfect accuracy, rarely hits hazards
  const reactionSpeed   = 0.30 + skillLevel * 0.60; // 0.30–0.90
  const hitAccuracy     = 0.40 + skillLevel * 0.50; // 0.40–0.90
  const bonusFocusRatio = 0.70 + skillLevel * 0.30; // 0.70–1.00
  const hazardAvoidance = 0.55 + skillLevel * 0.40; // 0.55–0.95

  // Reaction-time penalty: slower players miss short-lived targets before they expire.
  // At skill 0: reactionSpeed=0.30 → penalty = (1−0.30)×450 = 315 ms.
  // At skill 1: reactionSpeed=0.90 → penalty = (1−0.90)×450 =  45 ms.
  const reactionPenaltyMs = (1 - reactionSpeed) * 450;

  const standardReachable = Math.max(0.05, Math.min(1,
    (config.targetLifetimes.standard - reactionPenaltyMs) / config.targetLifetimes.standard,
  ));
  const bonusReachable = Math.max(0.05, Math.min(1,
    (config.targetLifetimes.bonus - reactionPenaltyMs) / config.targetLifetimes.bonus,
  ));

  const durationMs = config.durationSeconds * 1000;

  // Active targets on-screen, represented by their expiry timestamps.
  // Missed/ignored targets stay here until they expire, potentially blocking
  // future spawns when the screen reaches maxTargets — same as the real spawner.
  const activeExpiries: number[] = [];

  let nowMs = 0;
  let score = 0;

  while (nowMs < durationMs) {
    // Expire any targets whose lifetime has elapsed at this tick.
    // Filter is O(n) and avoids mutating the array mid-iteration.
    const beforeLength = activeExpiries.length;
    let writeIdx = 0;
    for (let i = 0; i < beforeLength; i++) {
      if (activeExpiries[i] > nowMs) activeExpiries[writeIdx++] = activeExpiries[i];
    }
    activeExpiries.length = writeIdx;

    // Spawn gating: real spawner skips this tick when the screen is full.
    if (activeExpiries.length < config.maxTargets) {
      const kind = pickTargetKind(rng(), config.targetWeights);
      const expiresAt = nowMs + config.targetLifetimes[kind];

      if (kind === 'hazard') {
        // AI either accidentally taps the hazard (score deducted, slot freed)
        // or ignores it (slot occupied until expiry).
        if (rng() > hazardAvoidance) {
          score += config.hazardPenalty;
        } else {
          activeExpiries.push(expiresAt);
        }
      } else {
        const hitRate = kind === 'standard'
          ? hitAccuracy * standardReachable
          : hitAccuracy * bonusFocusRatio * bonusReachable;

        if (rng() < hitRate) {
          score += TARGET_CONFIGS[kind].points;
          // Tapped target clears its slot immediately.
        } else {
          // Missed target stays on screen and may block future spawns.
          activeExpiries.push(expiresAt);
        }
      }
    }

    nowMs += config.spawnIntervalMs;
  }

  return Math.max(0, score);
}

/**
 * Simulate a single Bullseye Blitz round score for an AI participant.
 *
 * The `baseScore` parameter is the AI's per-round capacity produced by the
 * hybrid score resolver.  It spans the full targetPractice envelope (80–500)
 * and is normalised against the envelope ceiling (`AI_SCORE_MAX = 500`) so
 * every point in the range maps to a distinct skill level:
 *   baseScore  80 → skill ≈ 0.16 (low)
 *   baseScore 300 → skill ≈ 0.60 (average human)
 *   baseScore 500 → skill = 1.00 (near-perfect)
 *
 * The normalised skill feeds `runBullseyeAiRound`, which uses the real round
 * mechanics (spawn intervals, maxTargets cap, target lifetimes, point values,
 * hazard penalties) to produce a final score.
 *
 * Human-like mistakes are modelled via per-target RNG rolls:
 *   - reaction delays that cause some short-lived targets to be missed
 *   - imperfect hit accuracy on standard and bonus targets
 *   - occasional accidental hazard taps (more frequent for low-skill AI)
 *   - missed targets fill the screen, triggering the maxTargets cap and
 *     suppressing future spawns (exactly as in the live game)
 *
 * Results are deterministic: same (baseScore, roundNumber, seed, participantId)
 * inputs always produce the same output.
 */
export function simulateBullseyeAiRoundScore(
  baseScore: number,
  roundNumber: number,
  seed: number,
  participantId: string,
): number {
  const rng    = mulberry32(hashTournamentSeed(seed, participantId, roundNumber));
  const config = getBullseyeRoundConfig(roundNumber);

  // Normalise baseScore against the envelope ceiling so the full 80–500 range
  // maps to distinct skill levels.  Values outside [0, AI_SCORE_MAX] are clamped.
  const rawSkill = Math.max(0, baseScore) / AI_SCORE_MAX;

  // Add ±5 % per-player, per-round variance so AI contestants never produce
  // identical scores even when they share the same baseScore.
  const jitter     = (rng() - 0.5) * 0.10;
  const skillLevel = Math.min(1, Math.max(0, rawSkill + jitter));

  return runBullseyeAiRound(config, skillLevel, rng);
}
