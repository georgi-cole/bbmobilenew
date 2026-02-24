/**
 * weekSocialSeed — seeds background social relationships at the start of each week.
 *
 * Runs when the game transitions to `week_start`.  For every pair of active
 * (non-evicted, non-jury) players it dispatches `updateRelationship` with a
 * small seeded-random affinity adjustment.  This creates the organic, non-zero
 * relationship web the user sees in the social panel, without cluttering
 * sessionLogs or Diary Room entries.
 *
 * Design notes:
 *  - If a relationship pair already exists the delta is small (±2–4), so
 *    existing history is preserved and only gently drifts.
 *  - If a pair has never interacted a larger seed delta (5–25) is applied so
 *    week-1 relationships start at a meaningful non-zero value.
 *  - All deltas use the display-scale (0–100), matching `affinityDeltas`.
 *  - Uses a deterministic LCG seeded by `game.seed XOR week` for reproducibility.
 */

import { updateRelationship } from './socialSlice';

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface SeedState {
  game: {
    players: Array<{ id: string; status: string; isUser?: boolean }>;
    seed: number;
    week: number;
  };
  social: {
    relationships: Record<string, Record<string, { affinity: number; tags: string[] }>>;
  };
}

/**
 * Simple LCG pseudo-random number generator.
 * Returns a function that yields the next value in [0, 1) each call.
 */
function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = ((s * 1664525 + 1013904223) >>> 0);
    return s / 0x100000000;
  };
}

/**
 * Seed or refresh relationships at week start.
 *
 * Called from socialMiddleware when transitioning into `week_start`.
 */
export function seedWeekRelationships(store: StoreAPI): void {
  const state = store.getState() as SeedState;
  const players = state.game?.players ?? [];
  const week = state.game?.week ?? 1;
  const gameSeed = state.game?.seed ?? 0;
  const relationships = state.social?.relationships ?? {};

  const active = players.filter(
    (p) => p.status !== 'evicted' && p.status !== 'jury',
  );

  if (active.length < 2) return;

  // Mix game seed with week number for per-week variation.
  const rng = makeLcg(gameSeed ^ (week * 2654435761));

  for (let i = 0; i < active.length; i++) {
    for (let j = 0; j < active.length; j++) {
      if (i === j) continue;
      const actor = active[i];
      const target = active[j];
      const existing = relationships[actor.id]?.[target.id];
      const r = rng();

      let delta: number;
      if (!existing) {
        // New pair: seed a meaningful starting affinity between -12 and +25.
        delta = Math.round(-12 + r * 37);
      } else {
        // Existing pair: apply a small weekly drift of ±3.
        delta = Math.round(-3 + r * 6);
      }

      if (delta !== 0) {
        store.dispatch(updateRelationship({ source: actor.id, target: target.id, delta }));
      }
    }
  }
}
