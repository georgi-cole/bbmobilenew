/**
 * Headless Snake AI simulator.
 *
 * Runs a complete Snake game session for an AI participant using the same
 * board rules as the playable SnakeGame component (20×20 grid, wall/self
 * collision, race-to-1000 scoring).
 *
 * The AI is intentionally imperfect to produce believable human-like scores:
 *  - Safety-first direction selection avoids immediate collisions.
 *  - Bounded flood-fill lookahead (capped, not full-depth) evaluates moves.
 *  - Mistake probability grows as the snake lengthens, simulating pressure.
 *  - Periodic mistake windows (seeded randomness) cause occasional bad turns.
 *  - Loop/stall detection: if the snake hasn't eaten in too long it "gives up"
 *    and makes a fatal move, modelling human frustration.
 *
 * Results are deterministic: same seed + skill → same accumulated score.
 *
 * @module snakeAiSimulator
 */

import { mulberry32 } from '../../store/rng';
import type { CompetitionSkillProfile } from './types';

// ── Constants (must match SnakeGame.tsx) ──────────────────────────────────────

/** Board dimension (cells per side). */
const GRID_SIZE = 20;

/** Milliseconds per game tick (matches SnakeGame.tsx TICK_MS). */
const TICK_MS = 150;

/** Points awarded for a standard food item (matches SnakeGame.tsx). */
const POINTS_PER_STANDARD_FOOD = 25;

/** Points awarded for a bonus food item (matches SnakeGame.tsx). */
const POINTS_PER_BONUS_FOOD = 75;

/** Points deducted for a penalty food item (matches SnakeGame.tsx). */
const POINTS_PER_PENALTY_FOOD = -20;

/** Probability that a newly placed food item is a bonus (matches SnakeGame.tsx). */
const BONUS_FOOD_CHANCE = 0.15;

/** Probability that a newly placed food item is a penalty (matches SnakeGame.tsx). */
const PENALTY_FOOD_CHANCE = 0.10;

/** Target score — run ends when accumulated score reaches this (matches SnakeGame.tsx). */
const TARGET_SCORE = 1000;

/** Normalised score upper bound (matches SnakeGame.tsx SCORE_SCALE). */
const SCORE_SCALE = 1000;

/** Hard tick ceiling — prevents runaway simulations. */
const MAX_TICKS = 12_000;

// ── Types ─────────────────────────────────────────────────────────────────────

type Vec2 = { x: number; y: number };

const DIRECTIONS: readonly Vec2[] = [
  { x: 0, y: -1 }, // up
  { x: 0, y:  1 }, // down
  { x: -1, y: 0 }, // left
  { x:  1, y: 0 }, // right
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function inBounds(pos: Vec2): boolean {
  return pos.x >= 0 && pos.x < GRID_SIZE && pos.y >= 0 && pos.y < GRID_SIZE;
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function posKey(v: Vec2): string {
  return `${v.x},${v.y}`;
}

/**
 * Bounded flood-fill: count open cells reachable from `start`, given an
 * occupied set.  Exploration is capped at `maxCells` so the lookahead cost
 * is bounded even for large snakes.
 */
function floodFill(start: Vec2, occupied: Set<string>, maxCells: number): number {
  const visited = new Set<string>([posKey(start)]);
  const queue: Vec2[] = [start];
  let count = 0;
  while (queue.length > 0 && count < maxCells) {
    const cur = queue.shift()!;
    count++;
    for (const d of DIRECTIONS) {
      const nxt = add(cur, d);
      const k = posKey(nxt);
      if (inBounds(nxt) && !occupied.has(k) && !visited.has(k)) {
        visited.add(k);
        queue.push(nxt);
      }
    }
  }
  return count;
}

/**
 * Place food at a random free cell using the supplied RNG.
 * Falls back to a deterministic scan if random placement takes too long
 * (snake nearly fills the grid).
 */
function placeFood(snake: Vec2[], rng: () => number): Vec2 {
  const occupied = new Set(snake.map(posKey));
  const totalCells = GRID_SIZE * GRID_SIZE;
  const maxAttempts = Math.min(totalCells * 2, 400);

  for (let i = 0; i < maxAttempts; i++) {
    const candidate: Vec2 = {
      x: Math.floor(rng() * GRID_SIZE),
      y: Math.floor(rng() * GRID_SIZE),
    };
    if (!occupied.has(posKey(candidate))) return candidate;
  }

  // Linear scan fallback (very long snakes)
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const candidate: Vec2 = { x, y };
      if (!occupied.has(posKey(candidate))) return candidate;
    }
  }

  // Should never reach here (would require a completely full grid).
  return { x: 0, y: 0 };
}

/**
 * Pick the next direction for the AI snake.
 *
 * Strategy (in order of priority):
 *  1. Skip 180° reversals (immediate self-collision in next tick).
 *  2. Among moves that don't immediately collide, score each by:
 *       – flood-fill open space after the move (survival priority)
 *       – Manhattan distance to food (secondary)
 *  3. If `forceRandom` or the mistake roll fires, return a random safe move
 *     to simulate human error.
 *  4. If no safe moves exist, return the current direction (die next tick).
 */
function pickDirection(
  snake: Vec2[],
  currentDir: Vec2,
  food: Vec2,
  rng: () => number,
  mistakeProb: number,
  forceRandom: boolean,
  floodCap: number,
): Vec2 {
  const head = snake[0];
  const occupied = new Set(snake.map(posKey));

  // NOTE: keep the tail in `occupied`.  SnakeGame.tsx checks collision before
  // removing the tail, so moving into the tail cell is a self-collision.
  // Matching this rule makes the AI's safety analysis consistent with the
  // actual game logic (more conservative, avoids classifying fatal moves safe).

  // Collect candidate directions (no reversal, no immediate collision).
  const safe: Vec2[] = [];
  for (const d of DIRECTIONS) {
    if (d.x === -currentDir.x && d.y === -currentDir.y) continue; // reversal
    const nxt = add(head, d);
    if (!inBounds(nxt)) continue;
    if (occupied.has(posKey(nxt))) continue;
    safe.push(d);
  }

  if (safe.length === 0) return currentDir; // no escape — die next tick

  // ── Mistake window ─────────────────────────────────────────────────────────
  if (forceRandom || rng() < mistakeProb) {
    return safe[Math.floor(rng() * safe.length)];
  }

  // ── Score each safe move ───────────────────────────────────────────────────
  const scored = safe.map((d) => {
    const nxt = add(head, d);
    // Simulate the move: add new head, temporarily exclude its position.
    const afterOccupied = new Set(occupied);
    afterOccupied.add(posKey(nxt));
    const space = floodFill(nxt, afterOccupied, floodCap);
    const dist = Math.abs(nxt.x - food.x) + Math.abs(nxt.y - food.y);
    return { d, space, dist };
  });

  // Sort: prefer larger open space; break ties by closer food distance.
  scored.sort((a, b) => {
    const spaceDiff = b.space - a.space;
    if (Math.abs(spaceDiff) > 2) return spaceDiff;
    return a.dist - b.dist;
  });

  return scored[0].d;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Result of a single simulated Snake run. */
export interface SnakeAiRunResult {
  /** Accumulated score at the end of the run (0–TARGET_SCORE). */
  score: number;
  /** Total ticks elapsed (for the full run, whether or not the target was reached). */
  ticks: number;
  /** True when the run ended by reaching TARGET_SCORE (not a collision). */
  completed: boolean;
}

/**
 * Simulate a full Snake run for one AI participant.
 *
 * Uses race-to-1000 scoring:
 *  - Standard food: +POINTS_PER_STANDARD_FOOD
 *  - Bonus food:    +POINTS_PER_BONUS_FOOD
 *  - Penalty food:  POINTS_PER_PENALTY_FOOD (negative)
 *  - Run ends when accumulated score reaches TARGET_SCORE or on collision.
 *
 * @param seed  - Per-participant deterministic seed.
 * @param skill - Skill level in [0, 1]; higher → fewer mistakes, better survival.
 */
export function simulateSnakeAiRun(seed: number, skill: number): SnakeAiRunResult {
  const rng = mulberry32(seed >>> 0);
  const clampedSkill = Math.max(0, Math.min(1, skill));

  // ── Initial state (mirrors SnakeGame.tsx startGame) ─────────────────────
  let snake: Vec2[] = [{ x: 10, y: 10 }];
  let dir: Vec2 = { x: 1, y: 0 };
  let food: Vec2 = placeFood(snake, rng);
  // Assign first food type using RNG (mirrors SnakeGame.tsx placeFood)
  let foodTypeRoll = rng();
  let currentFoodType: 'standard' | 'bonus' | 'penalty' =
    foodTypeRoll < BONUS_FOOD_CHANCE ? 'bonus'
    : foodTypeRoll < BONUS_FOOD_CHANCE + PENALTY_FOOD_CHANCE ? 'penalty'
    : 'standard';

  let accumulatedScore = 0;
  let ticksSinceFood = 0;
  /** Actual tick at which the loop last executed a body iteration. */
  let lastTick = 0;

  // Position fingerprint buffer for loop detection (head position + direction).
  const recentPositions: string[] = [];

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    lastTick = tick + 1; // record every executed tick so early-exit is accurate
    // ── Compute mistake probability ────────────────────────────────────────
    // Probability grows with snake length (simulates mounting pressure) and
    // decreases with skill level.  At skill=1 and length=1 it is ~3%; at
    // skill=0 and length ≥30 it reaches ~40%.
    const growthFactor = Math.min(1, (snake.length - 1) / 30);
    const mistakeProb = (0.03 + growthFactor * 0.20) * (1 - clampedSkill * 0.65);

    // ── Loop detection ─────────────────────────────────────────────────────
    // Track (head position + direction) fingerprint to detect circular routing.
    const fingerprint = `${snake[0].x},${snake[0].y}:${dir.x},${dir.y}`;
    recentPositions.push(fingerprint);
    if (recentPositions.length > 24) recentPositions.shift();
    const repeatCount = recentPositions.filter((k) => k === fingerprint).length;
    const isLooping = repeatCount >= 3;

    // ── Flood-fill lookahead cap ───────────────────────────────────────────
    // Bounded by skill: a high-skill AI "looks further ahead".
    // Kept small intentionally to prevent perfect play.
    const floodCap = Math.round(12 + clampedSkill * 18);

    // ── Choose direction ───────────────────────────────────────────────────
    dir = pickDirection(snake, dir, food, rng, mistakeProb, isLooping, floodCap);

    // ── Move ───────────────────────────────────────────────────────────────
    const newHead = add(snake[0], dir);

    // Check collisions (same rules as SnakeGame.tsx tick()).
    if (!inBounds(newHead)) break;
    if (snake.some((s) => s.x === newHead.x && s.y === newHead.y)) break;

    snake = [newHead, ...snake];

    // ── Food check ─────────────────────────────────────────────────────────
    if (newHead.x === food.x && newHead.y === food.y) {
      const points =
        currentFoodType === 'bonus' ? POINTS_PER_BONUS_FOOD
        : currentFoodType === 'penalty' ? POINTS_PER_PENALTY_FOOD
        : POINTS_PER_STANDARD_FOOD;

      // Clamp to TARGET_SCORE (mirrors SnakeGame.tsx — no overshooting)
      const rawScore = Math.max(0, accumulatedScore + points);
      accumulatedScore = rawScore >= TARGET_SCORE ? TARGET_SCORE : rawScore;
      ticksSinceFood = 0;
      recentPositions.length = 0; // reset loop detector on food

      if (accumulatedScore >= TARGET_SCORE) {
        return { score: TARGET_SCORE, ticks: tick + 1, completed: true };
      }

      if (snake.length >= GRID_SIZE * GRID_SIZE) break; // board is full

      food = placeFood(snake, rng);
      foodTypeRoll = rng();
      currentFoodType =
        foodTypeRoll < BONUS_FOOD_CHANCE ? 'bonus'
        : foodTypeRoll < BONUS_FOOD_CHANCE + PENALTY_FOOD_CHANCE ? 'penalty'
        : 'standard';
    } else {
      snake = snake.slice(0, -1);
      ticksSinceFood++;
    }

    // ── Stall protection ───────────────────────────────────────────────────
    // If no food has been eaten for too long the AI is stuck in a dead-end
    // loop.  We model this as the human making a fatal mistake from frustration.
    // Stall limit shrinks at higher snake lengths (less room to manoeuvre).
    const stallLimit = Math.round(
      (120 + clampedSkill * 80) - growthFactor * 60,
    );
    if (ticksSinceFood > Math.max(40, stallLimit)) break;
  }

  // Return the actual tick at which the run ended, not the MAX_TICKS ceiling.
  return { score: accumulatedScore, ticks: lastTick, completed: false };
}

/**
 * Compute the weighted skill score (0–1) for a Snake AI from the player's
 * competition profile.  Snake rewards precision and nerve.
 */
function snakeSkillFromProfile(profile: CompetitionSkillProfile | undefined): number {
  if (!profile) return 0.5;
  // Weights: precision 40%, nerve 30%, mental 20%, physical 10%
  const precision  = (profile.precision  ?? 50) / 100;
  const nerve      = (profile.nerve      ?? 50) / 100;
  const mental     = (profile.mental     ?? 50) / 100;
  const physical   = (profile.physical   ?? 50) / 100;
  const raw = precision * 0.4 + nerve * 0.3 + mental * 0.2 + physical * 0.1;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Derive a per-participant seed from the session seed and the player ID.
 * Uses a DJB2-like hash, matching the pattern in hybridScoreResolver.ts.
 */
function hashPlayerId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Convert an accumulated score to the normalised 0–1000 value used by the store.
 * In race-to-1000 mode the score is already in [0, TARGET_SCORE], so this
 * simply clamps it to [0, SCORE_SCALE].
 */
export function normaliseSnakeScore(score: number): number {
  return Math.max(0, Math.min(SCORE_SCALE, score));
}

/** Result returned by simulateSnakeAiScore. */
export interface SnakeAiScoreResult {
  /** Normalised 0–1000 score. */
  score: number;
  /**
   * Completion time in milliseconds (ticks × TICK_MS) when the AI reached
   * TARGET_SCORE; null if the run ended by collision.
   */
  completionMs: number | null;
}

/**
 * Simulate a Snake AI run for a named participant and return a normalised
 * 0–1000 score together with the completion time (if the target was reached).
 *
 * @param sessionSeed - The competition session seed.
 * @param playerId    - The participant's ID (used to derive a per-player seed).
 * @param profile     - Optional competition skill profile for the player.
 */
export function simulateSnakeAiScore({
  sessionSeed,
  playerId,
  profile,
}: {
  sessionSeed: number;
  playerId: string;
  profile?: CompetitionSkillProfile;
}): SnakeAiScoreResult {
  const idHash = hashPlayerId(playerId);
  const participantSeed = ((sessionSeed >>> 0) ^ idHash ^ 0xa3f5c1e7) >>> 0;
  const skill = snakeSkillFromProfile(profile);
  const result = simulateSnakeAiRun(participantSeed, skill);
  const score = normaliseSnakeScore(result.score);
  const completionMs = result.completed ? result.ticks * TICK_MS : null;
  return { score, completionMs };
}
