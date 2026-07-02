import type { Middleware } from '@reduxjs/toolkit';
import type { GameState, Player } from '../types';
import type { SurvivorModeState } from './modeTypes';
import { advance, hydrateGame } from '../store/gameSlice';
import { getDefaultCompetitionSeasonState } from '../ai/competition';
import { buildReplacementRobo, createSurvivorModeState } from './survivorRun';
import { isSocialModeEnabled, shouldReplaceEvictedPlayers } from './gameModes';

function isExited(player: Player | undefined): boolean {
  return player?.status === 'evicted' || player?.status === 'jury';
}

function getSurvivorState(game: GameState): SurvivorModeState {
  return game.modeSpecific?.kind === 'survivor'
    ? game.modeSpecific
    : createSurvivorModeState(game.players.filter((player) => !isExited(player)).length);
}

function withReplacementIfNeeded(game: GameState, evicteeId: string): GameState | null {
  if (game.mode !== 'survivor' || !shouldReplaceEvictedPlayers(game.mode)) return null;
  const evictee = game.players.find((player) => player.id === evicteeId);
  if (!isExited(evictee) || evictee?.isUser) return null;

  const modeSpecific = getSurvivorState(game);
  const activeCastSize = game.players.filter((player) => !isExited(player)).length;
  if (activeCastSize >= modeSpecific.startingCastSize) return null;

  const replacement = buildReplacementRobo(game);
  const nextCompetitionState = {
    ...(game.competitionSeasonStateByPlayerId ?? {}),
    [replacement.id]: getDefaultCompetitionSeasonState(),
  };
  const totalRoboContestantsEvicted = modeSpecific.totalRoboContestantsEvicted + 1;
  const currentDay = Math.max(modeSpecific.currentDay, game.week);

  return {
    ...game,
    players: [...game.players, replacement],
    competitionSeasonStateByPlayerId: nextCompetitionState,
    modeSpecific: {
      ...modeSpecific,
      currentDay,
      bestDayReached: Math.max(modeSpecific.bestDayReached, currentDay),
      totalRoboContestantsEvicted,
      nextRoboIndex: modeSpecific.nextRoboIndex + 1,
    },
    lastPlayedAt: Date.now(),
    tvFeed: [
      {
        id: `survivor-replacement-${replacement.id}`,
        text: `${replacement.name} enters as a replacement synthetic contestant.`,
        type: 'game',
        timestamp: Date.now(),
        meta: { phase: game.phase, week: game.week, mode: 'survivor' },
      },
      ...game.tvFeed,
    ].slice(0, 50),
  };
}

function withSurvivorDaySync(game: GameState): GameState | null {
  if (game.mode !== 'survivor') return null;
  const modeSpecific = getSurvivorState(game);
  const currentDay = Math.max(modeSpecific.currentDay, game.week);
  const bestDayReached = Math.max(modeSpecific.bestDayReached, currentDay);
  if (currentDay === modeSpecific.currentDay && bestDayReached === modeSpecific.bestDayReached) return null;
  return {
    ...game,
    modeSpecific: {
      ...modeSpecific,
      currentDay,
      bestDayReached,
    },
    lastPlayedAt: Date.now(),
  };
}

export const survivorMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);
  const typedAction = action as { type?: string; payload?: unknown };
  const game = storeApi.getState().game as GameState;

  if (game.mode !== 'survivor') return result;

  if (typedAction.type === 'game/finalizePendingEviction' && typeof typedAction.payload === 'string') {
    const nextGame = withReplacementIfNeeded(game, typedAction.payload);
    if (nextGame) {
      storeApi.dispatch(hydrateGame(nextGame));
      return result;
    }
  }

  if (typedAction.type === 'game/advance') {
    const latest = storeApi.getState().game as GameState;
    if (!isSocialModeEnabled(latest.mode) && (latest.phase === 'social_1' || latest.phase === 'social_2')) {
      storeApi.dispatch(advance());
      return result;
    }

    const synced = withSurvivorDaySync(latest);
    if (synced) storeApi.dispatch(hydrateGame(synced));
  }

  return result;
};
