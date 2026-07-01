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

import { useReducer, useEffect, useRef, useCallback } from 'react';

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
  /** Strength of each drift tick. Lower values create calmer vote swings. */
  driftAmount?: number;
  /** Optional temporary momentum boost for a single active candidate. */
  surgeTargetId?: string | null;
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
  surgeIndex: number | null = null,
): number[] {
  if (current.length <= 1) return current;
  const deltas = current.map(() => (rng() - 0.5) * drift * 2);
  const next = current.map((v, i) => Math.max(1, v + deltas[i]));

  if (surgeIndex !== null && surgeIndex >= 0 && surgeIndex < next.length) {
    const availableHeadroom = Math.max(0, 100 - current[surgeIndex]);
    const momentumShift = Math.min(0.75, 0.25 + availableHeadroom * 0.003);
    const donorTotal = next.reduce(
      (sum, value, index) => (index === surgeIndex ? sum : sum + Math.max(0, value - 1)),
      0,
    );

    if (donorTotal > 0) {
      next[surgeIndex] += momentumShift;
      for (let index = 0; index < next.length; index += 1) {
        if (index === surgeIndex) continue;
        const donorWeight = Math.max(0, next[index] - 1) / donorTotal;
        next[index] = Math.max(1, next[index] - momentumShift * donorWeight);
      }
    }
  }

  return toIntPercentages(next);
}

// ── Internal reducer ─────────────────────────────────────────────────────────

type VotingState = {
  active: string[];
  pcts: number[];
  eliminated: string[];
  winnerId: string | null;
  isComplete: boolean;
};

type VotingAction =
  | { type: 'reset'; active: string[]; pcts: number[] }
  | { type: 'drift'; pcts: number[] }
  | { type: 'eliminate'; remaining: string[]; pcts: number[]; lowestId: string; winnerId: string | null };

function votingReducer(state: VotingState, action: VotingAction): VotingState {
  switch (action.type) {
    case 'reset':
      return { active: action.active, pcts: action.pcts, eliminated: [], winnerId: null, isComplete: false };
    case 'drift':
      return { ...state, pcts: action.pcts };
    case 'eliminate':
      return {
        ...state,
        active: action.remaining,
        pcts: action.pcts,
        eliminated: [...state.eliminated, action.lowestId],
        winnerId: action.winnerId,
        isComplete: action.winnerId !== null,
      };
  }
}

function makeInitialState(candidateList: string[], rngSeed: number): VotingState {
  const rng = mulberry32(rngSeed);
  return {
    active: [...candidateList],
    pcts: randomPercentages(rng, candidateList.length),
    eliminated: [],
    winnerId: null,
    isComplete: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export function useBattleBackVoting({
  candidates,
  seed,
  eliminationIntervalMs = 3500,
  tickIntervalMs = 400,
  driftAmount = 5,
  surgeTargetId = null,
}: Options): BattleBackVoteState {
  const rngRef = useRef(mulberry32(seed));
  const surgeTargetRef = useRef<string | null>(surgeTargetId);

  // All mutable voting state in a single reducer so the reset effect only
  // needs one dispatch call (satisfies react-hooks/set-state-in-effect).
  const [state, dispatch] = useReducer(
    votingReducer,
    undefined,
    () => makeInitialState(candidates, seed),
  );

  // Stable refs so interval callbacks always see fresh state without
  // creating new intervals.
  const activeRef = useRef(state.active);
  const pctsRef = useRef(state.pcts);
  const eliminatedRef = useRef(state.eliminated);
  useEffect(() => { activeRef.current = state.active; }, [state.active]);
  useEffect(() => { pctsRef.current = state.pcts; }, [state.pcts]);
  useEffect(() => { eliminatedRef.current = state.eliminated; }, [state.eliminated]);
  useEffect(() => { surgeTargetRef.current = surgeTargetId; }, [surgeTargetId]);

  // Reset simulation and re-seed RNG when seed or candidates change.
  // Single dispatch satisfies react-hooks/set-state-in-effect.
  useEffect(() => {
    const nextActive = [...candidates];
    const baseRng = mulberry32(seed);
    const initialPcts = randomPercentages(baseRng, candidates.length);

    rngRef.current = mulberry32((seed ^ 0x5a7d3c1e) >>> 0);

    // Ensure interval callbacks see the reset state immediately
    activeRef.current = nextActive;
    pctsRef.current = initialPcts;
    eliminatedRef.current = [];

    dispatch({ type: 'reset', active: nextActive, pcts: initialPcts });
  }, [seed, candidates]);

  // ── Percentage drift tick ───────────────────────────────────────────────
  useEffect(() => {
    if (state.isComplete) return;
    const id = setInterval(() => {
      const currentSurgeId = surgeTargetRef.current;
      const currentSurgeIndex = currentSurgeId ? activeRef.current.indexOf(currentSurgeId) : -1;
      dispatch({
        type: 'drift',
        // Keep the same interval loop and only bias the active player's drift so
        // countdowns/eliminations stay on the existing cadence.
        pcts: driftPercentages(
          pctsRef.current,
          rngRef.current,
          driftAmount,
          currentSurgeIndex >= 0 ? currentSurgeIndex : null,
        ),
      });
    }, tickIntervalMs);
    return () => clearInterval(id);
  }, [state.isComplete, tickIntervalMs, driftAmount]);

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

    dispatch({
      type: 'eliminate',
      remaining,
      pcts: newPcts,
      lowestId,
      winnerId: remaining.length === 1 ? remaining[0] : null,
    });
  }, []);

  useEffect(() => {
    if (state.isComplete) return;
    const id = setInterval(eliminateLowest, eliminationIntervalMs);
    return () => clearInterval(id);
  }, [state.isComplete, eliminationIntervalMs, eliminateLowest]);

  // ── Build votes map ──────────────────────────────────────────────────────
  const votes: Record<string, number> = {};
  state.active.forEach((id, i) => { votes[id] = state.pcts[i] ?? 0; });
  state.eliminated.forEach((id) => { votes[id] = 0; });

  return { votes, eliminated: state.eliminated, winnerId: state.winnerId, isComplete: state.isComplete };
}
