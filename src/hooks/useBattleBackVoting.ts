/**
 * useBattleBackVoting — real-time Battle Back voting simulator.
 *
 * Simulates a live public vote for the Jury Return / Battle Back twist.
 * Vote percentages drift smoothly between updates, and the lowest-ranked
 * candidate is eliminated every `eliminationIntervalMs` (default 3500ms).
 * When one candidate remains they are declared the winner.
 *
 * Provides an adapter-hook shape so a real backend can be substituted later:
 * swap out the `useEffect` internals for a WebSocket/SSE subscription while
 * keeping the same returned interface.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface BattleBackVoteState {
  /** Current vote percentages keyed by candidate ID (0–100, sum ≈ 100). */
  votes: Record<string, number>;
  /** IDs eliminated so far, in elimination order. */
  eliminated: string[];
  /** ID of the winning candidate; null while voting is in progress. */
  winnerId: string | null;
  /** True once a winner has been determined. */
  isComplete: boolean;
}

interface Options {
  /** Candidates competing in the Battle Back (juror IDs). */
  candidates: string[];
  /** Seeded RNG seed for reproducible initial percentages. */
  seed: number;
  /** Interval between eliminations in ms. Default: 3500. */
  eliminationIntervalMs?: number;
  /** Tick interval for percentage drift in ms. Default: 400. */
  tickIntervalMs?: number;
}

/** Mulberry32 PRNG (inline copy so this hook has no circular imports). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Scale `values` proportionally so they sum to 100 and are non-negative
 * integers, using the largest-remainder method to distribute rounding error.
 */
function toIntPercentages(values: number[]): number[] {
  if (values.length === 0) return [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const scaled = values.map((v) => (v / total) * 100);
  const floored = scaled.map(Math.floor);
  const remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const fracs = scaled.map((v, i) => ({ i, frac: v - Math.floor(v) }));
  fracs.sort((a, b) => b.frac - a.frac);
  fracs.slice(0, remainder).forEach(({ i }) => { floored[i]++; });
  return floored;
}

/** Distribute 100 points randomly among `count` buckets using the given RNG. */
function randomPercentages(rng: () => number, count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [100];
  const raw = Array.from({ length: count }, () => rng() + 0.1);
  return toIntPercentages(raw);
}

/** Drift percentages by ±drift each tick, keeping all values ≥ 1 and sum = 100. */
function driftPercentages(
  current: number[],
  rng: () => number,
  drift: number,
): number[] {
  if (current.length <= 1) return current;
  const deltas = current.map(() => (rng() - 0.5) * drift * 2);
  const next = current.map((v, i) => Math.max(1, v + deltas[i]));
  return toIntPercentages(next);
}

export function useBattleBackVoting({
  candidates,
  seed,
  eliminationIntervalMs = 3500,
  tickIntervalMs = 400,
}: Options): BattleBackVoteState {
  const rngRef = useRef(mulberry32(seed));

  // Build initial vote state from candidates
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Track active candidates and their percentages as parallel arrays so
  // ordering is stable (React state must be serialisable).
  const [active, setActive] = useState<string[]>(() => [...candidates]);
  const [pcts, setPcts] = useState<number[]>(() => {
    const rng = mulberry32(seed);
    return randomPercentages(rng, candidates.length);
  });

  // Stable refs so interval callbacks always see fresh state without
  // creating new intervals.
  const activeRef = useRef(active);
  const pctsRef = useRef(pcts);
  const eliminatedRef = useRef(eliminated);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { pctsRef.current = pcts; }, [pcts]);
  useEffect(() => { eliminatedRef.current = eliminated; }, [eliminated]);

  // Re-seed rng on candidates change (XOR with twist-specific constant)
  useEffect(() => {
    rngRef.current = mulberry32((seed ^ 0x5a7d3c1e) >>> 0);
  }, [seed]);

  // ── Percentage drift tick ───────────────────────────────────────────────
  useEffect(() => {
    if (isComplete) return;
    const id = setInterval(() => {
      setPcts((prev) => driftPercentages(prev, rngRef.current, 5));
    }, tickIntervalMs);
    return () => clearInterval(id);
  }, [isComplete, tickIntervalMs]);

  // ── Elimination tick ─────────────────────────────────────────────────────
  const eliminateLowest = useCallback(() => {
    const cur = activeRef.current;
    const curPcts = pctsRef.current;
    if (cur.length <= 1) return;

    // Find index of lowest percentage
    let lowestIdx = 0;
    for (let i = 1; i < curPcts.length; i++) {
      if (curPcts[i] < curPcts[lowestIdx]) lowestIdx = i;
    }
    const lowestId = cur[lowestIdx];
    const remaining = cur.filter((_, i) => i !== lowestIdx);
    const remainingPcts = curPcts.filter((_, i) => i !== lowestIdx);

    // Redistribute eliminated candidate's votes
    const freed = curPcts[lowestIdx];
    const total = remainingPcts.reduce((a, b) => a + b, 0) || 1;
    const bumped = remainingPcts.map((v) => v + (v / total) * freed);
    const newPcts = toIntPercentages(bumped);

    setEliminated((prev) => [...prev, lowestId]);
    setActive(remaining);
    setPcts(newPcts);

    if (remaining.length === 1) {
      setWinnerId(remaining[0]);
      setIsComplete(true);
    }
  }, []);

  useEffect(() => {
    if (isComplete) return;
    const id = setInterval(eliminateLowest, eliminationIntervalMs);
    return () => clearInterval(id);
  }, [isComplete, eliminationIntervalMs, eliminateLowest]);

  // ── Build votes map ──────────────────────────────────────────────────────
  const votes: Record<string, number> = {};
  active.forEach((id, i) => { votes[id] = pcts[i] ?? 0; });
  eliminated.forEach((id) => { votes[id] = 0; });

  return { votes, eliminated, winnerId, isComplete };
}
