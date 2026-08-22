import type { ChallengeRun } from '../store/challengeSlice';
import type { GameState, Player } from '../types';

export type SurvivorStandoutMode = 'full-card' | 'compact-strip' | 'mini-chip';
export type SurvivorStandoutTieBreaker = 'days' | 'averagePlacement';

export type SurvivorStandoutPlayer = {
  player: Player;
  daysInGame: number;
  averagePlacement: number | null;
  placementCount: number;
  lohWins: number;
  posWins: number;
};

export type SurvivorStandoutResult =
  | {
      status: 'leader';
      leader: SurvivorStandoutPlayer;
      tiedPlayers: SurvivorStandoutPlayer[];
      tieBreaker: SurvivorStandoutTieBreaker;
      currentDay: number;
    }
  | {
      status: 'tied';
      leader: null;
      tiedPlayers: SurvivorStandoutPlayer[];
      tieBreaker: SurvivorStandoutTieBreaker;
      currentDay: number;
    }
  | {
      status: 'unavailable';
      leader: null;
      tiedPlayers: [];
      tieBreaker: 'days';
      currentDay: number;
    };

function isAliveSurvivorPlayer(player: Player) {
  return player.status !== 'evicted' && player.status !== 'jury';
}

function getCurrentSurvivorDay(game: GameState) {
  const survivorDay = game.modeSpecific?.kind === 'survival'
    ? game.modeSpecific.currentDay
    : undefined;
  return Math.max(1, survivorDay ?? game.week ?? 1);
}

function getDaysInGame(player: Player, currentDay: number) {
  return Math.max(1, currentDay - (player.survivorEntryDay ?? 1) + 1);
}

function buildAveragePlacementByPlayerId(
  history: ChallengeRun[],
  playerIds: Set<string>,
): Map<string, { total: number; count: number }> {
  const placements = new Map<string, { total: number; count: number }>();

  history.forEach((run) => {
    if (run.ranking && run.ranking.length > 0) {
      run.ranking
        .filter((playerId) => playerIds.has(playerId) && run.participants.includes(playerId))
        .forEach((playerId, index) => {
          const current = placements.get(playerId) ?? { total: 0, count: 0 };
          placements.set(playerId, {
            total: current.total + index + 1,
            count: current.count + 1,
          });
        });
      return;
    }
    const scoreEntries = Object.entries(run.canonicalScores ?? {})
      .filter(([playerId]) => playerIds.has(playerId) && run.participants.includes(playerId))
      .sort((a, b) => b[1] - a[1]);

    if (scoreEntries.length === 0) return;

    let rank = 0;
    let seen = 0;
    let previousScore: number | null = null;
    scoreEntries.forEach(([playerId, score]) => {
      seen += 1;
      if (previousScore === null || score !== previousScore) {
        rank = seen;
        previousScore = score;
      }
      const current = placements.get(playerId) ?? { total: 0, count: 0 };
      placements.set(playerId, {
        total: current.total + rank,
        count: current.count + 1,
      });
    });
  });

  return placements;
}

export function selectSurvivorStandout(
  game: GameState,
  challengeHistory: ChallengeRun[] = [],
): SurvivorStandoutResult | null {
  if (game.mode !== 'survival') return null;

  const currentDay = getCurrentSurvivorDay(game);
  const alivePlayers = game.players.filter(isAliveSurvivorPlayer);
  if (alivePlayers.length === 0) {
    return {
      status: 'unavailable',
      leader: null,
      tiedPlayers: [],
      tieBreaker: 'days',
      currentDay,
    };
  }

  const aliveIds = new Set(alivePlayers.map((player) => player.id));
  const averagePlacements = buildAveragePlacementByPlayerId(challengeHistory, aliveIds);
  const rows = alivePlayers.map((player): SurvivorStandoutPlayer => {
    const placement = averagePlacements.get(player.id);
    return {
      player,
      daysInGame: getDaysInGame(player, currentDay),
      averagePlacement: placement && placement.count > 0 ? placement.total / placement.count : null,
      placementCount: placement?.count ?? 0,
      lohWins: player.stats?.lohWins ?? 0,
      posWins: player.stats?.posWins ?? 0,
    };
  });

  const bestDays = Math.max(...rows.map((row) => row.daysInGame));
  const dayLeaders = rows.filter((row) => row.daysInGame === bestDays);
  if (dayLeaders.length === 1) {
    return {
      status: 'leader',
      leader: dayLeaders[0],
      tiedPlayers: dayLeaders,
      tieBreaker: 'days',
      currentDay,
    };
  }

  const everyDayLeaderHasPlacement = dayLeaders.every((row) => row.averagePlacement !== null);
  if (everyDayLeaderHasPlacement) {
    const bestAveragePlacement = Math.min(
      ...dayLeaders.map((row) => row.averagePlacement ?? Number.POSITIVE_INFINITY),
    );
    const averageLeaders = dayLeaders.filter((row) => row.averagePlacement === bestAveragePlacement);
    if (averageLeaders.length === 1) {
      return {
        status: 'leader',
        leader: averageLeaders[0],
        tiedPlayers: averageLeaders,
        tieBreaker: 'averagePlacement',
        currentDay,
      };
    }
    return {
      status: 'tied',
      leader: null,
      tiedPlayers: averageLeaders,
      tieBreaker: 'averagePlacement',
      currentDay,
    };
  }

  return {
    status: 'tied',
    leader: null,
    tiedPlayers: dayLeaders,
    tieBreaker: 'days',
    currentDay,
  };
}
