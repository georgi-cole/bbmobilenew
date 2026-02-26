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
  // rngRef is initialised inside the mount effect because Date.now() is an
  // impure function that cannot be called during render.
  const rngRef = useRef<(() => number) | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconcileRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether a winner has been locked in; prevents double-reconcile calls.
  const lockedRef = useRef(false);

  const [state, setState] = useState<SpectatorSimulationState>(() => ({
    competitors: competitorIds.map((id) => ({ id, score: 0, isWinner: false })),
    phase: initialWinnerId ? 'reconciling' : 'simulating',
    authoritativeWinnerId: initialWinnerId ?? null,
  }));

  // Sync onReconciled callback via effect (not during render) to satisfy
  // the react-hooks/refs lint rule.
  const onReconciledRef = useRef(onReconciled);
  useEffect(() => {
    onReconciledRef.current = onReconciled;
  }, [onReconciled]);

  // `setState` is stable from useState — empty deps intentional.
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

    // Clear any existing reveal timeout before scheduling a new one so
    // multiple rapid calls to doReconcile don't fire onReconciled twice.
    if (reconcileRef.current) {
      clearTimeout(reconcileRef.current);
    }
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
  }, []); // setState is stable from useState; empty deps intentional

  const setAuthoritativeWinner = useCallback(
    (winnerId: string) => {
      // No-op once a winner is locked — prevents multiple reconcile timeouts
      // from repeated Space/Enter key presses or duplicate events.
      if (lockedRef.current) return;
      lockedRef.current = true;
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setState((prev) => ({ ...prev, authoritativeWinnerId: winnerId }));
      doReconcile(winnerId);
    },
    [doReconcile],
  );

  // Capture initial values in refs so the effect runs exactly once on mount
  // while still having access to the initial configuration.
  const competitorIdsRef = useRef(competitorIds);
  const initialWinnerRef = useRef(initialWinnerId);

  // Start simulation tick — runs once on mount; values captured via refs above.
  useEffect(() => {
    // Initialise RNG here (Date.now() is impure, cannot be called during render).
    rngRef.current = mulberry32(Date.now());

    if (initialWinnerRef.current) {
      // Winner already known → lock and reconcile immediately.
      lockedRef.current = true;
      doReconcile(initialWinnerRef.current);
      return;
    }

    const ids = competitorIdsRef.current;

    // Guard: if no competitors, nothing to simulate.
    if (!ids.length) return;

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
        // Simulation time expired — pick a pseudo-random winner.
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        // Skip if an authoritative source already locked in a winner.
        if (lockedRef.current) return;
        const idx = Math.floor(rng() * ids.length);
        const simulatedWinner = ids[idx] ?? ids[0];
        lockedRef.current = true;
        setState((prev) => ({ ...prev, authoritativeWinnerId: simulatedWinner }));
        doReconcile(simulatedWinner);
      }
    }, TICK_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; values captured via refs
  }, []);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (reconcileRef.current) clearTimeout(reconcileRef.current);
    },
    [],
  );

  return { state, setAuthoritativeWinner };
}

