import type { GameState, Player } from '../types';
import type { SurvivorModeState } from './modeTypes';
import { getDefaultCompetitionProfile, getDefaultCompetitionSeasonState } from '../ai/competition';
import { createInitialGameState } from '../store/gameSlice';

const ROBO_NAMES = [
  'Lira', 'Kang', 'Sora', 'Mako', 'Venn', 'Rika', 'Nexo', 'Zari', 'Kiro', 'Tavi',
  'Oren', 'Miri', 'Juno', 'Rexo', 'Fenn', 'Kova', 'Lumi', 'Silo', 'Arin', 'Varo',
];

const SAVE_VERSION = 2;

function makeRunId(mode: 'classic' | 'survivor'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${mode}-${crypto.randomUUID()}`;
  }
  return `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function robotAvatar(seed: string): string {
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

function buildRoboPlayer(index: number, runId: string): Player {
  const name = ROBO_NAMES[index % ROBO_NAMES.length];
  const suffix = Math.floor(index / ROBO_NAMES.length);
  const displayName = suffix > 0 ? `${name}-${suffix + 1}` : name;
  const id = `robo-${runId}-${index}`;
  return {
    id,
    name: displayName,
    avatar: robotAvatar(id),
    status: 'active',
    isRobo: true,
    competitionProfile: getDefaultCompetitionProfile(),
  };
}

function buildCompetitionState(players: Player[]): GameState['competitionSeasonStateByPlayerId'] {
  return Object.fromEntries(players.map((player) => [player.id, getDefaultCompetitionSeasonState()]));
}

export function createSurvivorModeState(startingCastSize: number): SurvivorModeState {
  return {
    kind: 'survivor',
    currentDay: 1,
    totalRoboContestantsEvicted: 0,
    bestDayReached: 1,
    startingCastSize,
    nextRoboIndex: Math.max(0, startingCastSize - 1),
    competitionRotation: {
      usedKeys: [],
      round: 1,
    },
  };
}

export function createSurvivorRun(): GameState {
  const base = createInitialGameState();
  const runId = makeRunId('survivor');
  const human = base.players.find((player) => player.isUser) ?? base.players[0];
  const startingCastSize = Math.max(2, base.players.length);
  const players = [
    { ...human, id: 'user', status: 'active' as const, isUser: true },
    ...Array.from({ length: startingCastSize - 1 }, (_, index) => buildRoboPlayer(index, runId)),
  ];
  const now = Date.now();
  const modeSpecific = createSurvivorModeState(startingCastSize);

  return {
    ...base,
    gameId: runId,
    runId,
    mode: 'survivor',
    status: 'active',
    createdAt: now,
    lastPlayedAt: now,
    saveVersion: SAVE_VERSION,
    season: 1,
    week: 1,
    publicModeEnabled: false,
    players,
    competitionSeasonStateByPlayerId: buildCompetitionState(players),
    modeSpecific,
    tvFeed: [
      {
        id: 'survivor-e0',
        text: 'Survivor Mode online. Synthetic contestants will be replaced after every eviction.',
        type: 'game',
        timestamp: now,
        meta: { phase: 'week_start', week: 1, mode: 'survivor' },
      },
      {
        id: 'survivor-e1',
        text: '[Rules] Public mode: OFF | Social mode: OFF | Endless days: ON',
        type: 'game',
        timestamp: now,
        meta: { phase: 'week_start', week: 1, mode: 'survivor' },
      },
    ],
  };
}

export function buildReplacementRobo(state: GameState): Player {
  const survivorState = state.modeSpecific?.kind === 'survivor'
    ? state.modeSpecific
    : createSurvivorModeState(state.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury').length + 1);
  return buildRoboPlayer(survivorState.nextRoboIndex, state.runId ?? state.gameId);
}

export function markSurvivorDay(state: GameState): GameState {
  if (state.mode !== 'survivor') return state;
  const modeSpecific = state.modeSpecific?.kind === 'survivor'
    ? state.modeSpecific
    : createSurvivorModeState(state.players.length);
  const currentDay = Math.max(modeSpecific.currentDay, state.week);
  return {
    ...state,
    modeSpecific: {
      ...modeSpecific,
      currentDay,
      bestDayReached: Math.max(modeSpecific.bestDayReached, currentDay),
    },
  };
}
