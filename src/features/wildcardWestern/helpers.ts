/**
 * helpers.ts – Pure helper functions for Wildcard Western.
 */

import { WILDCARD_QUESTIONS, type WildcardQuestion } from './wildcardWesternQuestions';
import { seededPickN } from '../../store/rng';

/**
 * Assign unique random card values (1-99) to each player.
 * Uses Fisher-Yates shuffle to ensure no duplicates.
 */
export function dealCards(
  playerIds: string[],
  rng: () => number,
): Record<string, number> {
  // Generate pool of 1-99
  const pool = Array.from({ length: 99 }, (_, i) => i + 1);
  
  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  
  // Assign first N cards to players
  const result: Record<string, number> = {};
  playerIds.forEach((id, idx) => {
    result[id] = pool[idx];
  });
  
  return result;
}

/**
 * Get the lowest and highest card holders from the alive players.
 * Returns [lowestCardHolder, highestCardHolder].
 */
export function getFirstPair(
  cardsByPlayerId: Record<string, number>,
  aliveIds: string[],
): [string, string] {
  let minId = aliveIds[0];
  let maxId = aliveIds[0];
  let minVal = cardsByPlayerId[minId] ?? Infinity;
  let maxVal = cardsByPlayerId[maxId] ?? -Infinity;
  
  for (const id of aliveIds) {
    const val = cardsByPlayerId[id] ?? 0;
    if (val < minVal) {
      minVal = val;
      minId = id;
    }
    if (val > maxVal) {
      maxVal = val;
      maxId = id;
    }
  }
  
  return [minId, maxId];
}

/**
 * Get the next question from the question bank.
 * Uses a cursor to iterate through a shuffled order.
 * When exhausted, reshuffles and returns new order.
 */
export function getNextQuestion(
  questionOrder: string[],
  cursor: number,
  seed: number,
  duelNumber: number,
): { question: WildcardQuestion; newCursor: number; newOrder?: string[] } {
  // If exhausted, reshuffle
  if (cursor >= questionOrder.length) {
    const rng = (() => {
      let s = (seed + duelNumber * 9973) >>> 0;
      return function next(): number {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
      };
    })();
    
    const newOrder = [...WILDCARD_QUESTIONS.map((q) => q.id)];
    for (let i = newOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
    }
    
    const questionId = newOrder[0];
    const question = WILDCARD_QUESTIONS.find((q) => q.id === questionId)!;
    return { question, newCursor: 1, newOrder };
  }
  
  const questionId = questionOrder[cursor];
  const question = WILDCARD_QUESTIONS.find((q) => q.id === questionId)!;
  return { question, newCursor: cursor + 1 };
}

/**
 * Select a random pair of distinct players from the alive list.
 */
export function selectRandomPair(
  aliveIds: string[],
  rng: () => number,
): [string, string] {
  const picked = seededPickN(rng, aliveIds, 2);
  return [picked[0], picked[1]];
}
