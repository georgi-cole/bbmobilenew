/**
 * wildcardWesternAi.ts – Seeded deterministic AI behavior for Wildcard Western.
 */

import type { WildcardQuestion } from './wildcardWesternQuestions';

export type AiPersonality = 'Gambler' | 'Hunter' | 'Coward' | 'Sniper' | 'Panicker';

export interface AiDuelPlan {
  willBuzz: boolean;
  buzzDelayMs: number;
  willAnswer: boolean;
  chosenAnswerIndex: 0 | 1 | 2;
  willTimeout: boolean;
}

/**
 * Derive AI personality from player ID and seed.
 */
export function getAiPersonality(playerId: string, seed: number): AiPersonality {
  const hash = playerId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const combined = (hash + seed) % 5;
  const personalities: AiPersonality[] = ['Gambler', 'Hunter', 'Coward', 'Sniper', 'Panicker'];
  return personalities[combined];
}

/**
 * Precompute AI's plan for a single duel.
 */
export function precomputeAiDuelPlan(
  playerId: string,
  personality: AiPersonality,
  question: WildcardQuestion,
  seed: number,
  duelNumber: number,
): AiDuelPlan {
  const rng = (() => {
    let s = (seed + duelNumber * 7919 + playerId.charCodeAt(0) * 997) >>> 0;
    return function next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
  })();

  let buzzProbability = 0.5;
  let minDelay = 500;
  let maxDelay = 4000;
  let accuracy = 0.5;

  switch (personality) {
    case 'Gambler':
      buzzProbability = 0.85;
      minDelay = 100;
      maxDelay = 1500;
      accuracy = 0.6;
      break;
    case 'Hunter':
      buzzProbability = 0.75;
      minDelay = 400;
      maxDelay = 2500;
      accuracy = 0.8;
      break;
    case 'Coward':
      buzzProbability = 0.3;
      minDelay = 3000;
      maxDelay = 7000;
      accuracy = 0.5;
      break;
    case 'Sniper':
      buzzProbability = 0.4;
      minDelay = 500;
      maxDelay = 3000;
      accuracy = 0.9;
      break;
    case 'Panicker':
      buzzProbability = 0.9;
      minDelay = 50;
      maxDelay = 800;
      accuracy = 0.3;
      break;
  }

  const willBuzz = rng() < buzzProbability;
  const buzzDelayMs = Math.floor(minDelay + rng() * (maxDelay - minDelay));

  if (!willBuzz) {
    return {
      willBuzz: false,
      buzzDelayMs: 0,
      willAnswer: false,
      chosenAnswerIndex: 0,
      willTimeout: false,
    };
  }

  const willAnswer = rng() < 0.95;
  let chosenAnswerIndex: 0 | 1 | 2;

  if (rng() < accuracy) {
    chosenAnswerIndex = question.correctIndex;
  } else {
    const wrongIndices = [0, 1, 2].filter((i) => i !== question.correctIndex) as (0 | 1 | 2)[];
    chosenAnswerIndex = wrongIndices[Math.floor(rng() * wrongIndices.length)];
  }

  return {
    willBuzz,
    buzzDelayMs,
    willAnswer,
    chosenAnswerIndex,
    willTimeout: !willAnswer,
  };
}

/**
 * Precompute which player the AI chooser will eliminate.
 */
export function precomputeAiEliminationChoice(
  chooserId: string,
  aliveIds: string[],
  seed: number,
  duelNumber: number,
): string {
  const rng = (() => {
    let s = (seed + duelNumber * 8831 + chooserId.charCodeAt(0) * 1009) >>> 0;
    return function next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
  })();

  const eligibleTargets = aliveIds.filter((id) => id !== chooserId);
  if (eligibleTargets.length === 0) return chooserId;

  const idx = Math.floor(rng() * eligibleTargets.length);
  return eligibleTargets[idx];
}

/**
 * Precompute which pair the AI chooser will select for the next duel.
 */
export function precomputeAiNextPair(
  chooserId: string,
  aliveIds: string[],
  seed: number,
  duelNumber: number,
): [string, string] {
  const rng = (() => {
    let s = (seed + duelNumber * 9337 + chooserId.charCodeAt(0) * 1013) >>> 0;
    return function next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
  })();

  const eligibleIds = aliveIds.filter((id) => id !== chooserId);

  if (eligibleIds.length < 2) {
    // Not enough other players, fallback
    return [aliveIds[0] ?? chooserId, aliveIds[1] ?? aliveIds[0] ?? chooserId];
  }

  const shuffled = [...eligibleIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return [shuffled[0], shuffled[1]];
}
