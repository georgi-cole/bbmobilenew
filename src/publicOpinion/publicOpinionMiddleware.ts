import type { Middleware } from '@reduxjs/toolkit';
import type { Player } from '../types';
import {
  initializeProfiles,
  updateApproval,
  addDirection,
  pruneExpiredDirections,
} from './publicOpinionSlice';
import { publicOpinionConfig } from './publicOpinionConfig';
import { generateDirectionsForCycle } from './PublicDirectionService';

interface GameState {
  phase: string;
  week: number;
  hohId: string | null;
  povWinnerId: string | null;
  nomineeIds: string[];
  players: Player[];
  seed: number;
}

interface StateWithGame {
  game: GameState;
  publicOpinion?: { profiles: Record<string, unknown> };
}

export const publicOpinionMiddleware: Middleware = (store) => (next) => (action) => {
  const prevState = store.getState() as StateWithGame;
  const prevPhase = prevState.game?.phase;

  const result = next(action);

  const nextState = store.getState() as StateWithGame;
  const newPhase = nextState.game?.phase;
  const game = nextState.game;

  if (!game) return result;

  const actionType = (action as { type: string }).type;

  if (actionType === 'game/resetGame') {
    const playerIds = game.players?.map((p) => p.id) ?? [];
    if (playerIds.length > 0) {
      store.dispatch(initializeProfiles(playerIds));
    }
    return result;
  }

  if (
    actionType === 'game/advance' ||
    actionType === 'game/setPhase' ||
    actionType === 'game/forcePhase'
  ) {
    const profiles = nextState.publicOpinion?.profiles ?? {};
    const hasProfiles = Object.keys(profiles).length > 0;

    if (!hasProfiles && game.players?.length > 0) {
      const playerIds = game.players.map((p) => p.id);
      store.dispatch(initializeProfiles(playerIds));
    }

    if (prevPhase !== newPhase) {
      const week = game.week ?? 1;

      if (newPhase === 'hoh_results') {
        if (game.hohId) {
          store.dispatch(
            updateApproval({
              playerId: game.hohId,
              delta: publicOpinionConfig.competitionImpact.hohWin,
              reason: 'hoh_win',
              week,
            }),
          );
        }
      }

      if (newPhase === 'pov_results') {
        if (game.povWinnerId) {
          store.dispatch(
            updateApproval({
              playerId: game.povWinnerId,
              delta: publicOpinionConfig.competitionImpact.povWin,
              reason: 'pov_win',
              week,
            }),
          );
        }
      }

      if (newPhase === 'eviction_results') {
        for (const nomineeId of game.nomineeIds ?? []) {
          store.dispatch(
            updateApproval({
              playerId: nomineeId,
              delta: publicOpinionConfig.competitionImpact.nominated,
              reason: 'nominated',
              week,
            }),
          );
        }
      }

      if (newPhase === 'week_end') {
        store.dispatch(pruneExpiredDirections({ week: week + 1 }));

        const activePlayers = (game.players ?? []).filter(
          (p) => p.status !== 'evicted' && p.status !== 'jury',
        );

        if (activePlayers.length > 0) {
          const newDirections = generateDirectionsForCycle({
            players: activePlayers,
            week: week + 1,
            seed: game.seed ?? 0,
            count: publicOpinionConfig.directionsPerCycle,
          });
          for (const direction of newDirections) {
            store.dispatch(addDirection(direction));
          }
        }
      }
    }
  }

  return result;
};
