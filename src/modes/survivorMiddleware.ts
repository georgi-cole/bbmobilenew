import type { Middleware } from '@reduxjs/toolkit';
import type { GameState, Player, TvEvent } from '../types';
import type { SurvivorModeState } from './modeTypes';
import { advance, consumeForcedShock, finalizePendingEviction, hydrateGame } from '../store/gameSlice';
import { getDefaultCompetitionSeasonState } from '../ai/competition';
import { buildReplacementRobo, createSurvivorModeState } from './survivorRun';
import { isSocialModeEnabled, shouldReplaceEvictedPlayers } from './gameModes';

const SURVIVOR_BLOCKED_SHOCK_ACTIONS = new Set([
  'game/activateBattleBack',
  'game/activateSpecialVeto',
  'game/activateDayStartShock',
  'game/activateDemocracia',
  'game/triggerSecretMission',
]);

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
  const evicteeIndex = game.players.findIndex((player) => player.id === evicteeId);
  const evictee = evicteeIndex >= 0 ? game.players[evicteeIndex] : undefined;
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
  const players = game.players.map((player, index) => (index === evicteeIndex ? replacement : player));
  const replacementEvent: TvEvent = {
    id: `survivor-replacement-${replacement.id}`,
    text: `${replacement.name} enters as a replacement synthetic contestant.`,
    type: 'game',
    timestamp: Date.now(),
    meta: { phase: game.phase, week: game.week, mode: 'survivor' },
  };

  return {
    ...game,
    players,
    competitionSeasonStateByPlayerId: nextCompetitionState,
    modeSpecific: {
      ...modeSpecific,
      currentDay,
      bestDayReached: Math.max(modeSpecific.bestDayReached, currentDay),
      totalRoboContestantsEvicted,
      nextRoboIndex: modeSpecific.nextRoboIndex + 1,
    },
    lastPlayedAt: Date.now(),
    tvFeed: [replacementEvent, ...game.tvFeed].slice(0, 50),
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
  const typedAction = action as { type?: string; payload?: unknown };
  const stateBefore = storeApi.getState() as { game: GameState };

  if (stateBefore.game.mode === 'survivor' && typedAction.type && SURVIVOR_BLOCKED_SHOCK_ACTIONS.has(typedAction.type)) {
    if (stateBefore.game.pendingForcedShock?.type && stateBefore.game.pendingForcedShock.type !== 'doubleEviction') {
      storeApi.dispatch(consumeForcedShock());
    }
    return undefined;
  }

  const result = next(action);
  const stateAfter = storeApi.getState() as { game: GameState };
  const game = stateAfter.game;

  if (game.mode !== 'survivor') return result;

  if (typedAction.type === 'game/finalizePendingEviction' && typeof typedAction.payload === 'string') {
    const nextGame = withReplacementIfNeeded(game, typedAction.payload);
    if (nextGame) {
      storeApi.dispatch(hydrateGame(nextGame));
      return result;
    }
  }

  const latest = (storeApi.getState() as { game: GameState }).game;
  if (
    typedAction.type !== 'game/finalizePendingEviction' &&
    latest.pendingEviction &&
    !latest.voteResults
  ) {
    storeApi.dispatch(finalizePendingEviction(latest.pendingEviction.evicteeId));
    return result;
  }

  if (typedAction.type === 'game/advance') {
    const advanced = (storeApi.getState() as { game: GameState }).game;
    if (!isSocialModeEnabled(advanced.mode) && (advanced.phase === 'social_1' || advanced.phase === 'social_2')) {
      storeApi.dispatch(advance());
      return result;
    }

    const synced = withSurvivorDaySync(advanced);
    if (synced) storeApi.dispatch(hydrateGame(synced));
  }

  return result;
};
