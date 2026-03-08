/**
 * castleRescueTestData.ts
 *
 * Canned test fixtures for Castle Rescue unit tests.
 * Using fixed maps rather than generated ones keeps tests fast and ensures
 * they never break due to changes in the generator (only changes to types/
 * engine can break test data).
 *
 * ALL positions in this file have been manually verified to satisfy
 * validateLevelConfig.
 */

import type { CastleRescueGridMap, RunState } from './castleRescueTypes';

/**
 * Minimal valid map: straight 3-pipe path across the middle row.
 *
 *   S  r0 r1 r2  E
 * (source=2,0  sink=2,4  route: 2,1→2,2→2,3)
 * Decoys at (0,0), (0,4), (4,0) — chosen to be far from the route.
 */
export const FIXTURE_MAP_STRAIGHT: CastleRescueGridMap = {
  gridRows: 5,
  gridCols: 5,
  source: { row: 2, col: 0 },
  sink: { row: 2, col: 4 },
  pipes: [
    { id: 'route-0', row: 2, col: 1, isRoute: true },
    { id: 'route-1', row: 2, col: 2, isRoute: true },
    { id: 'route-2', row: 2, col: 3, isRoute: true },
    { id: 'decoy-0', row: 0, col: 0, isRoute: false },
    { id: 'decoy-1', row: 0, col: 4, isRoute: false },
    { id: 'decoy-2', row: 4, col: 0, isRoute: false },
  ],
  correctRoute: ['route-0', 'route-1', 'route-2'],
};

/**
 * Map with an L-shaped route (goes right then up).
 *
 *   S  r0 r1  E
 *      ↑
 *   S  r? …  (source at 2,0, first route pipe right at 2,1, then up to 1,1, then right to 1,2, sink at 1,3)
 */
export const FIXTURE_MAP_LSHAPED: CastleRescueGridMap = {
  gridRows: 5,
  gridCols: 5,
  source: { row: 2, col: 0 },
  sink: { row: 1, col: 3 },
  pipes: [
    { id: 'route-0', row: 2, col: 1, isRoute: true },
    { id: 'route-1', row: 1, col: 1, isRoute: true },
    { id: 'route-2', row: 1, col: 2, isRoute: true },
    { id: 'decoy-0', row: 4, col: 4, isRoute: false },
    { id: 'decoy-1', row: 0, col: 0, isRoute: false },
    { id: 'decoy-2', row: 3, col: 3, isRoute: false },
  ],
  correctRoute: ['route-0', 'route-1', 'route-2'],
};

/**
 * Returns an active RunState positioned at the map source, ready to play.
 * Uses a fixed startTimeMs of 0 to keep tests independent of wall-clock time.
 */
export function makeActiveState(map: CastleRescueGridMap): RunState {
  return {
    status: 'active',
    map,
    selectedPipeIds: [],
    currentHeadPos: { ...map.source },
    wrongAttempts: 0,
    startTimeMs: 0,
    endTimeMs: null,
    score: null,
    outcomeResolved: false,
  };
}

/**
 * Returns a completed RunState with a specific elapsed time and wrong-attempts
 * count.  Useful for scoring / ranking tests.
 *
 * Note: currentHeadPos is set to the last route pipe cell, matching the engine's
 * behavior in handlePipeClick — the head advances to the last route pipe on
 * completion, NOT to the sink.
 */
export function makeCompleteState(
  map: CastleRescueGridMap,
  elapsedMs: number,
  wrongAttempts: number,
  score: number,
): RunState {
  // Resolve the last route pipe cell to match what the engine sets on completion.
  const lastRouteId = map.correctRoute[map.correctRoute.length - 1];
  const lastRoutePipe = map.pipes.find((p) => p.id === lastRouteId);
  const headPos = lastRoutePipe
    ? { row: lastRoutePipe.row, col: lastRoutePipe.col }
    : { ...map.sink }; // fallback (should never occur with valid maps)

  return {
    status: 'complete',
    map,
    selectedPipeIds: [...map.correctRoute],
    currentHeadPos: headPos,
    wrongAttempts,
    startTimeMs: 0,
    endTimeMs: elapsedMs,
    score,
    outcomeResolved: false,
  };
}
