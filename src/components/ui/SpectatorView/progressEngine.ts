/**
 * progressEngine — simulation + authoritative reconciliation for SpectatorView.
 *
 * Provides a React hook that:
 *   1. Runs a bounded speculative progress simulation for each competitor.
 *      The full SIM_DURATION_MS sequence always plays — even when the winner
 *      is known at mount — so spectators see the complete visualization.
 *   2. Reconciles smoothly to the authoritative winner when it arrives
 *      (via Redux store, 'minigame:end' CustomEvent, or window.game.__authoritativeWinner).
 *   3. Enforces a MIN_FLOOR_MS (15 s) minimum overlay duration: onReconciled
 *      will not fire until at least MIN_FLOOR_MS has elapsed since mount
 *      unless the user explicitly calls skip() after sequenceComplete.
 *   4. Fires `onReconciled` once the reveal animation completes.
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
  /** Simulation progress 0–99 during 'simulating', 100 when complete. */
  simPct: number;
  /**
   * True once the full simulation sequence has finished playing (all
   * questions / content shown).  The Skip button becomes enabled at this point.
   */
  sequenceComplete: boolean;
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
/**
 * Minimum time the SpectatorView overlay must stay visible (ms).
 * Even if the sequence finishes before this, the close callback is deferred
 * until the floor has elapsed — unless the user presses Skip.
 */
const MIN_FLOOR_MS = 15000;

export function useSpectatorSimulation({
  competitorIds,
  initialWinnerId,
  onReconciled,
}: UseSpectatorSimulationOptions): {
  state: SpectatorSimulationState;
  setAuthoritativeWinner: (winnerId: string) => void;
  /** Call once sequenceComplete to finish immediately (bypasses the 15 s floor). */
  skip: () => void;
} {
  // rngRef is initialised inside the mount effect because Date.now() is an
  // impure function that cannot be called during render.
  const rngRef = useRef<(() => number) | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconcileRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether a winner has been locked in; prevents double-reconcile calls.
  const lockedRef = useRef(false);
  // Authoritative winner that arrived before the sequence ended (stored so the
  // sim can continue playing and pick up the winner when it finishes).
  const pendingWinnerRef = useRef<string | null>(initialWinnerId ?? null);
  // Mirrors state.sequenceComplete for use inside callbacks without a re-render dep.
  const sequenceCompleteRef = useRef(false);
  // Unix timestamp recorded when the mount effect runs (used for MIN_FLOOR_MS).
  const mountTimeRef = useRef<number>(0);

  const [state, setState] = useState<SpectatorSimulationState>(() => ({
    competitors: competitorIds.map((id) => ({ id, score: 0, isWinner: false })),
    // Always start in 'simulating' — the full sequence must play even when the
    // winner is already known (initialWinnerId is stored and used at sequence end).
    phase: 'simulating',
    authoritativeWinnerId: null,
    simPct: 0,
    sequenceComplete: false,
  }));

  // Sync onReconciled callback via effect (not during render) to satisfy
  // the react-hooks/refs lint rule.
  const onReconciledRef = useRef(onReconciled);
  useEffect(() => {
    onReconciledRef.current = onReconciled;
  }, [onReconciled]);

  // `setState` is stable from useState — empty deps intentional.
  const doReconcile = useCallback((winnerId: string, skipFloor = false) => {
    setState((prev) => ({
      ...prev,
      phase: 'reconciling',
      authoritativeWinnerId: winnerId,
      simPct: 100,
      competitors: prev.competitors.map((c) => ({
        ...c,
        score: c.id === winnerId ? 100 : Math.min(c.score, 85),
      })),
    }));

    // Enforce minimum overlay duration unless the user explicitly skipped.
    const elapsed = mountTimeRef.current ? Date.now() - mountTimeRef.current : 0;
    const floorRemaining = skipFloor ? 0 : Math.max(0, MIN_FLOOR_MS - elapsed);
    const revealDelay = Math.max(RECONCILE_DURATION_MS, floorRemaining);

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
    }, revealDelay);
  }, []); // setState is stable from useState; empty deps intentional

  const setAuthoritativeWinner = useCallback(
    (winnerId: string) => {
      // Always store as the pending winner so the sim uses it when it ends.
      pendingWinnerRef.current = winnerId;
      setState((prev) => ({ ...prev, authoritativeWinnerId: winnerId }));

      // If the sequence has already completed and we're not yet locked, reconcile now.
      if (sequenceCompleteRef.current && !lockedRef.current) {
        lockedRef.current = true;
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        doReconcile(winnerId);
      }
      // Otherwise the sim tick will pick up pendingWinnerRef when it ends.
    },
    [doReconcile],
  );

  /**
   * Skip to the immediate reveal (bypasses the MIN_FLOOR_MS wait).
   * Only has an effect after sequenceComplete is true.
   * Safe to call even after the normal reconcile has been scheduled with the
   * floor delay — it cancels the pending timer and re-schedules immediately.
   */
  const skip = useCallback(() => {
    if (!sequenceCompleteRef.current) return; // sequence not done — cannot skip yet
    const winner = pendingWinnerRef.current ?? competitorIdsRef.current[0];
    if (!winner) return;
    // Lock reconcile so no other path can start a parallel reconcile.
    lockedRef.current = true;
    // doReconcile clears any pending reconcileRef internally, then schedules
    // the reveal with skipFloor = true (RECONCILE_DURATION_MS, no floor wait).
    doReconcile(winner, /* skipFloor */ true);
  }, [doReconcile]);

  // Capture initial values in refs so the effect runs exactly once on mount
  // while still having access to the initial configuration.
  //
  // NOTE: this hook intentionally does NOT react to `competitorIds` changes
  // after mount. If the caller needs to show a completely different set of
  // competitors, it must remount `SpectatorView` (and therefore this hook) by
  // changing the component `key` prop. This avoids mid-simulation state resets
  // while still supporting the repeated `spectator:show` use-case via remount.
  const competitorIdsRef = useRef(competitorIds);

  // Start simulation tick — runs once on mount; values captured via refs above.
  useEffect(() => {
    // Record mount time for MIN_FLOOR_MS enforcement.
    mountTimeRef.current = Date.now();
    // Initialise RNG here (Date.now() is impure, cannot be called during render).
    rngRef.current = mulberry32(mountTimeRef.current);

    // NOTE: initialWinnerId (if any) is stored in pendingWinnerRef and will be
    // used at the end of the simulation instead of a random pick.  The full
    // sequence always runs so spectators see the complete visualization.

    const ids = competitorIdsRef.current;

    // Guard: if no competitors, nothing to simulate.
    if (!ids.length) return;

    const startTime = mountTimeRef.current;
    // rngRef.current is set a few lines above; non-null assertion is safe here.
    const rng = rngRef.current!;

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = clamp(elapsed / SIM_DURATION_MS, 0, 1);
      const simPct = Math.min(99, Math.round(progress * 100));

      setState((prev) => {
        if (prev.phase !== 'simulating') return prev;

        const updated = prev.competitors.map((c) => {
          const delta = rng() * 4 + 1;
          const cap = progress * 90 + 5; // never reaches 100 until authoritative
          return { ...c, score: clamp(c.score + delta, 0, cap) };
        });

        return { ...prev, competitors: updated, simPct };
      });

      if (elapsed >= SIM_DURATION_MS) {
        // Simulation time expired — sequence is now complete.
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }

        // Mark sequence as complete and enable the Skip button.
        sequenceCompleteRef.current = true;
        setState((prev) => ({ ...prev, sequenceComplete: true }));

        // Skip if an authoritative source already locked in a winner.
        if (lockedRef.current) return;
        lockedRef.current = true;

        // Use the pending authoritative winner if one arrived during simulation;
        // otherwise fall back to a pseudo-random pick.
        const idx = Math.floor(rng() * ids.length);
        const winner = pendingWinnerRef.current ?? (ids[idx] ?? ids[0]);
        setState((prev) => ({ ...prev, authoritativeWinnerId: winner }));
        doReconcile(winner); // floor applies (skipFloor = false)
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

  return { state, setAuthoritativeWinner, skip };
}

