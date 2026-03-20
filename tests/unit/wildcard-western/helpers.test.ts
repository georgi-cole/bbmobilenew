/**
 * Unit tests — Wildcard Western pure helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  dealCards,
  getFirstPair,
  getNextQuestion,
  selectRandomPair,
} from '../../../src/features/wildcardWestern/helpers';
import { mulberry32 } from '../../../src/store/rng';
import { WILDCARD_QUESTIONS } from '../../../src/features/wildcardWestern/wildcardWesternQuestions';

const SEED = 42;
const PLAYERS = ['alice', 'bob', 'carol', 'dave'];

describe('dealCards', () => {
  it('assigns unique cards to all players', () => {
    const rng = mulberry32(SEED);
    const cards = dealCards(PLAYERS, rng);
    
    expect(Object.keys(cards)).toHaveLength(PLAYERS.length);
    
    const values = Object.values(cards);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('assigns cards in range 1-99', () => {
    const rng = mulberry32(SEED);
    const cards = dealCards(PLAYERS, rng);
    
    for (const value of Object.values(cards)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(99);
    }
  });

  it('is deterministic', () => {
    const rng1 = mulberry32(SEED);
    const cards1 = dealCards(PLAYERS, rng1);
    
    const rng2 = mulberry32(SEED);
    const cards2 = dealCards(PLAYERS, rng2);
    
    expect(cards1).toEqual(cards2);
  });
});

describe('getFirstPair', () => {
  it('returns lowest and highest card holders', () => {
    const cards = { alice: 10, bob: 50, carol: 90, dave: 30 };
    const aliveIds = ['alice', 'bob', 'carol', 'dave'];
    
    const [low, high] = getFirstPair(cards, aliveIds);
    
    expect(low).toBe('alice');
    expect(high).toBe('carol');
  });

  it('works with subset of alive players', () => {
    const cards = { alice: 10, bob: 50, carol: 90, dave: 30 };
    const aliveIds = ['bob', 'dave'];
    
    const [low, high] = getFirstPair(cards, aliveIds);
    
    expect(low).toBe('dave');
    expect(high).toBe('bob');
  });

  it('handles two players correctly', () => {
    const cards = { alice: 25, bob: 75 };
    const aliveIds = ['alice', 'bob'];
    
    const [low, high] = getFirstPair(cards, aliveIds);
    
    expect(low).toBe('alice');
    expect(high).toBe('bob');
  });
});

describe('getNextQuestion', () => {
  it('returns a valid question from the bank', () => {
    const order = WILDCARD_QUESTIONS.map((q) => q.id);
    const result = getNextQuestion(order, 0, SEED, 1);
    
    expect(result.question).toBeDefined();
    expect(WILDCARD_QUESTIONS).toContainEqual(result.question);
  });

  it('advances cursor', () => {
    const order = WILDCARD_QUESTIONS.map((q) => q.id);
    const result = getNextQuestion(order, 0, SEED, 1);
    
    expect(result.newCursor).toBe(1);
  });

  it('reshuffles when exhausted', () => {
    const order = WILDCARD_QUESTIONS.map((q) => q.id);
    const cursor = order.length;
    
    const result = getNextQuestion(order, cursor, SEED, 1);
    
    expect(result.newOrder).toBeDefined();
    expect(result.newOrder).toHaveLength(WILDCARD_QUESTIONS.length);
    expect(result.newCursor).toBe(1);
  });
});

describe('selectRandomPair', () => {
  it('returns two distinct players', () => {
    const rng = mulberry32(SEED);
    const [p1, p2] = selectRandomPair(PLAYERS, rng);
    
    expect(p1).not.toBe(p2);
    expect(PLAYERS).toContain(p1);
    expect(PLAYERS).toContain(p2);
  });

  it('is deterministic', () => {
    const rng1 = mulberry32(SEED);
    const pair1 = selectRandomPair(PLAYERS, rng1);
    
    const rng2 = mulberry32(SEED);
    const pair2 = selectRandomPair(PLAYERS, rng2);
    
    expect(pair1).toEqual(pair2);
  });
});
