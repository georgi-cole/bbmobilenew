/**
 * voteSimulator — generic real-time voting simulator.
 *
 * Provides a factory that simulates live public vote percentages with realistic
 * drift and timed elimination of the lowest candidate.
 *
 * Designed with an `attachRealtimeAdapter` hook so a real backend (e.g.,
 * Firebase Realtime Database or Socket.IO) can replace the built-in simulation
 * without changing consumer code.
 *
 * Usage (simulated):
 *   const sim = createVoteSimulator({ candidates: ['p1', 'p2', 'p3'], seed: 42 });
 *   sim.start();
 *   // subscribe via sim.subscribe(callback)
 *   // later: sim.stop();
 *
 * Usage (real backend):
 *   const sim = createVoteSimulator({ candidates, seed });
 *   sim.attachRealtimeAdapter(myFirebaseAdapter);
 *   sim.start();
 */

/** Mulberry32 PRNG — no external imports for portability. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Scale values so they are non-negative integers summing to 100. */
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

function randomPercentages(rng: () => number, count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [100];
  const raw = Array.from({ length: count }, () => rng() + 0.1);
  return toIntPercentages(raw);
}

function driftPercentages(current: number[], rng: () => number, drift = 5): number[] {
  if (current.length <= 1) return current;
  const deltas = current.map(() => (rng() - 0.5) * drift * 2);
  const next = current.map((v, i) => Math.max(1, v + deltas[i]));
  return toIntPercentages(next);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface VoteSnapshot {
  /** Current percentages keyed by candidate ID. */
  votes: Record<string, number>;
  /** Candidates eliminated so far, in order. */
  eliminated: string[];
  /** Winner once only one candidate remains; null otherwise. */
  winnerId: string | null;
  /** True once a winner has been determined. */
  isComplete: boolean;
}

export type VoteSnapshotListener = (snapshot: VoteSnapshot) => void;

export interface RealtimeAdapter {
  /**
   * Called with the current candidate list when the simulation starts.
   * The adapter should start emitting `onData` updates.
   */
  start(candidates: string[]): void;
  /** Called to stop any subscriptions. */
  stop(): void;
  /** Register a callback that the adapter calls with live vote data. */
  onData(callback: (votes: Record<string, number>) => void): void;
}

export interface VoteSimulatorOptions {
  /** Candidate IDs competing in the vote. */
  candidates: string[];
  /** Seeded RNG seed for reproducible simulation. */
  seed: number;
  /** Interval between eliminations in ms. Default: 3500. */
  eliminationIntervalMs?: number;
  /** Tick interval for percentage drift in ms. Default: 400. */
  tickIntervalMs?: number;
}

export interface VoteSimulator {
  /** Start the simulation (or real adapter). */
  start(): void;
  /** Stop all timers / subscriptions. */
  stop(): void;
  /** Subscribe to vote snapshots. Returns an unsubscribe function. */
  subscribe(listener: VoteSnapshotListener): () => void;
  /** Get the current snapshot without subscribing. */
  getSnapshot(): VoteSnapshot;
  /**
   * Attach a real-time backend adapter.
   * When set, the built-in simulation is bypassed and the adapter drives updates.
   * Must be called before `start()`.
   */
  attachRealtimeAdapter(adapter: RealtimeAdapter): void;
}

/** Create a new vote simulator instance. */
export function createVoteSimulator({
  candidates,
  seed,
  eliminationIntervalMs = 3500,
  tickIntervalMs = 400,
}: VoteSimulatorOptions): VoteSimulator {
  const rng = mulberry32(seed);
  let active = [...candidates];
  let pcts = randomPercentages(rng, active.length);
  let eliminated: string[] = [];
  let winnerId: string | null = null;
  let listeners: VoteSnapshotListener[] = [];
  let driftTimer: ReturnType<typeof setInterval> | null = null;
  let elimTimer: ReturnType<typeof setInterval> | null = null;
  let realtimeAdapter: RealtimeAdapter | null = null;
  /** Guard against duplicate start() calls creating extra intervals/handlers. */
  let started = false;

  function buildSnapshot(): VoteSnapshot {
    const votes: Record<string, number> = {};
    active.forEach((id, i) => { votes[id] = pcts[i] ?? 0; });
    eliminated.forEach((id) => { votes[id] = 0; });
    return { votes, eliminated: [...eliminated], winnerId, isComplete: winnerId !== null };
  }

  function notify() {
    const snap = buildSnapshot();
    listeners.forEach((fn) => fn(snap));
  }

  function eliminateLowest() {
    if (active.length <= 1) return;
    let lowestIdx = 0;
    for (let i = 1; i < pcts.length; i++) {
      if (pcts[i] < pcts[lowestIdx]) lowestIdx = i;
    }
    const lowestId = active[lowestIdx];
    const remaining = active.filter((_, i) => i !== lowestIdx);
    const remainingPcts = pcts.filter((_, i) => i !== lowestIdx);
    const freed = pcts[lowestIdx];
    const total = remainingPcts.reduce((a, b) => a + b, 0) || 1;
    const bumped = remainingPcts.map((v) => v + (v / total) * freed);
    active = remaining;
    pcts = toIntPercentages(bumped);
    eliminated = [...eliminated, lowestId];
    if (active.length === 1) {
      winnerId = active[0];
      stop();
    }
    notify();
  }

  function start() {
    if (started) return; // idempotent — ignore duplicate start() calls
    started = true;

    if (realtimeAdapter) {
      // Real backend drives vote totals; simulator still runs elimination/winner logic
      // so that eliminated, winnerId, and isComplete stay in sync for consumers.
      realtimeAdapter.onData((incomingVotes) => {
        active.forEach((id, i) => { pcts[i] = incomingVotes[id] ?? pcts[i]; });
        notify();
      });
      realtimeAdapter.start(candidates);
      // Elimination timer runs on adapter-driven percentages
      elimTimer = setInterval(() => {
        if (winnerId) return;
        eliminateLowest();
      }, eliminationIntervalMs);
      notify();
      return;
    }
    // Built-in simulation
    driftTimer = setInterval(() => {
      if (winnerId) return;
      pcts = driftPercentages(pcts, rng);
      notify();
    }, tickIntervalMs);
    elimTimer = setInterval(() => {
      if (winnerId) return;
      eliminateLowest();
    }, eliminationIntervalMs);
    notify();
  }

  function stop() {
    if (driftTimer !== null) { clearInterval(driftTimer); driftTimer = null; }
    if (elimTimer !== null) { clearInterval(elimTimer); elimTimer = null; }
    if (realtimeAdapter) { realtimeAdapter.stop(); }
    started = false;
  }

  function subscribe(listener: VoteSnapshotListener): () => void {
    listeners = [...listeners, listener];
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }

  function attachRealtimeAdapter(adapter: RealtimeAdapter) {
    realtimeAdapter = adapter;
  }

  return { start, stop, subscribe, getSnapshot: buildSnapshot, attachRealtimeAdapter };
}
