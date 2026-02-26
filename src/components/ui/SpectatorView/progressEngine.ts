/**
 * progressEngine — simulation + authoritative reconciliation for SpectatorView.
 *
 * Provides a React hook that:
 *   1. Runs a bounded speculative progress simulation for each competitor.
 *   2. Reconciles smoothly to the authoritative winner when it arrives
 *      (via Redux store, 'minigame:end' CustomEvent, or window.game.__authoritativeWinner).
 *   3. Fires `onReconciled` once the reveal animation completes.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompetitorProgress {
  id: string;
  /** Simulated progress 0–100. */
  score: number;
  /** True once the authoritative winner is locked in and this competitor won. */
  isWinner: boolean;
}

export interface SpectatorSimulationState {
  competitors: CompetitorProgress[];
  phase: 'simulating' | 'reconciling' | 'revealed';
  /** The authoritative winner ID once known. */
  authoritativeWinnerId: string | null;
}

export interface UseSpectatorSimulationOptions {
  competitorIds: string[];
  /** If provided the simulation resolves immediately to this winner. */
  initialWinnerId?: string | null;
  onReconciled?: (winnerId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seeded pseudo-random number generator (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Clamp a number between lo and hi. */
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const TICK_MS = 80;
const SIM_DURATION_MS = 6000;
const RECONCILE_DURATION_MS = 1200;

export function useSpectatorSimulation({
  competitorIds,
  initialWinnerId,
  onReconciled,
}: UseSpectatorSimulationOptions): {
  state: SpectatorSimulationState;
  setAuthoritativeWinner: (winnerId: string) => void;
} {
  const seed = useRef(Date.now());
  const rngRef = useRef(mulberry32(seed.current));
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconcileRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<SpectatorSimulationState>(() => ({
    competitors: competitorIds.map((id) => ({ id, score: 0, isWinner: false })),
    phase: initialWinnerId ? 'reconciling' : 'simulating',
    authoritativeWinnerId: initialWinnerId ?? null,
  }));

  const onReconciledRef = useRef(onReconciled);
  onReconciledRef.current = onReconciled;

  const doReconcile = useCallback((winnerId: string) => {
    setState((prev) => ({
      ...prev,
      phase: 'reconciling',
      authoritativeWinnerId: winnerId,
      competitors: prev.competitors.map((c) => ({
        ...c,
        score: c.id === winnerId ? 100 : Math.min(c.score, 85),
      })),
    }));

    reconcileRef.current = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        phase: 'revealed',
        competitors: prev.competitors.map((c) => ({
          ...c,
          score: c.id === winnerId ? 100 : c.score,
          isWinner: c.id === winnerId,
        })),
      }));
      onReconciledRef.current?.(winnerId);
    }, RECONCILE_DURATION_MS);
  }, []);

  const setAuthoritativeWinner = useCallback(
    (winnerId: string) => {
      setState((prev) => {
        if (prev.authoritativeWinnerId) return prev; // already locked
        return { ...prev, authoritativeWinnerId: winnerId };
      });
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      doReconcile(winnerId);
    },
    [doReconcile],
  );

  // Capture initial values in refs so the effect runs exactly once on mount
  // while still having access to the initial configuration.
  const competitorIdsRef = useRef(competitorIds);
  const initialWinnerRef = useRef(initialWinnerId);
  const doReconcileRef = useRef(doReconcile);
  doReconcileRef.current = doReconcile;

  // Start simulation tick
  useEffect(() => {
    if (initialWinnerRef.current) {
      // Winner already known → reconcile immediately
      doReconcileRef.current(initialWinnerRef.current);
      return;
    }

    const ids = competitorIdsRef.current;
    const startTime = Date.now();
    const rng = rngRef.current;

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = clamp(elapsed / SIM_DURATION_MS, 0, 1);

      setState((prev) => {
        if (prev.phase !== 'simulating') return prev;

        const updated = prev.competitors.map((c) => {
          const delta = rng() * 4 + 1;
          const cap = progress * 90 + 5; // never reaches 100 until authoritative
          return { ...c, score: clamp(c.score + delta, 0, cap) };
        });

        return { ...prev, competitors: updated };
      });

      if (elapsed >= SIM_DURATION_MS) {
        // Simulation time expired — pick a pseudo-random winner
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        const idx = Math.floor(rng() * ids.length);
        const simulatedWinner = ids[idx] ?? ids[0];
        setState((prev) => {
          if (prev.authoritativeWinnerId) return prev;
          return { ...prev, authoritativeWinnerId: simulatedWinner };
        });
        doReconcileRef.current(simulatedWinner);
      }
    }, TICK_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []); // run once on mount — values captured via refs above

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (reconcileRef.current) clearTimeout(reconcileRef.current);
    },
    [],
  );

  return { state, setAuthoritativeWinner };
}
