import type { GameState, Player, TvEvent } from '../types';
import type { SurvivorModeState } from './modeTypes';
import { getDefaultCompetitionProfile, getDefaultCompetitionSeasonState } from '../ai/competition';
import { createInitialGameState } from '../store/gameSlice';
import { createInitialVoxPopuliState } from '../features/twists/voxPopuli';

const ROBO_NAMES = [
  'Lira', 'Kang', 'Sora', 'Mako', 'Venn', 'Rika', 'Nexo', 'Zari', 'Kiro', 'Tavi',
  'Oren', 'Miri', 'Juno', 'Rexo', 'Fenn', 'Kova', 'Lumi', 'Silo', 'Arin', 'Varo',
];

const SAVE_VERSION = 2;
export const SURVIVOR_STARTING_CAST_SIZE = 8;

function makeRunId(mode: 'classic' | 'survival'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${mode}-${crypto.randomUUID()}`;
  }
  return `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function robotAvatar(seed: string): string {
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

function isPlayerExited(player: Player | undefined): boolean {
  return player?.status === 'evicted' || player?.status === 'jury';
}

function getSurvivorModeState(state: GameState): SurvivorModeState {
  return state.modeSpecific?.kind === 'survival'
    ? state.modeSpecific
    : createSurvivorModeState(SURVIVOR_STARTING_CAST_SIZE);
}

export function getSurvivorCurrentDay(state: GameState): number {
  const survivorState = getSurvivorModeState(state);
  return Math.max(survivorState.currentDay, state.week ?? 1);
}

export function isSurvivorHumanEliminated(state: GameState): boolean {
  if (state.mode !== 'survival') return false;
  const human = state.players.find((player) => player.isUser);
  return !human || isPlayerExited(human);
}

export function isSurvivorRunTerminal(state: GameState): boolean {
  if (state.mode !== 'survival') return false;
  return state.status === 'failed' || state.status === 'completed' || isSurvivorHumanEliminated(state);
}

export function terminalizeSurvivorRun(state: GameState): GameState {
  if (state.mode !== 'survival') return state;

  const modeSpecific = getSurvivorModeState(state);
  const currentDay = getSurvivorCurrentDay(state);
  const eventId = `survivor-failed-${state.runId ?? state.gameId}-${currentDay}`;
  const hasTerminalEvent = state.tvFeed.some((event) => event.id === eventId);
  const gameOverEvent: TvEvent = {
    id: eventId,
    text: `Surveyeval run ended. You were eliminated on Day ${currentDay}.`,
    type: 'game',
    timestamp: Date.now(),
    meta: { phase: state.phase, week: state.week, mode: 'survival' },
  };

  return {
    ...state,
    status: state.status === 'completed' ? 'completed' : 'failed',
    pendingEviction: null,
    voteResults: null,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    awaitingMissionImmunityOffer: false,
    pendingMinigame: null,
    minigameResult: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    dayStartShock: null,
    modeSpecific: {
      ...modeSpecific,
      currentDay,
      bestDayReached: Math.max(modeSpecific.bestDayReached, currentDay),
      startingCastSize: SURVIVOR_STARTING_CAST_SIZE,
    },
    lastPlayedAt: Date.now(),
    tvFeed: hasTerminalEvent ? state.tvFeed : [gameOverEvent, ...state.tvFeed].slice(0, 50),
  };
}

function buildRoboPlayer(index: number, runId: string, entryDay = 1, slot = index + 1): Player {
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
    survivorEntryDay: entryDay,
    survivorSlot: slot,
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
    competitionProfile: getDefaultCompetitionProfile(),
  };
}

function buildCompetitionState(players: Player[]): GameState['competitionSeasonStateByPlayerId'] {
  return Object.fromEntries(players.map((player) => [player.id, getDefaultCompetitionSeasonState()]));
}

export function createSurvivorModeState(startingCastSize: number): SurvivorModeState {
  return {
    kind: 'survival',
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
  const runId = makeRunId('survival');
  const human = base.players.find((player) => player.isUser) ?? base.players[0];
  const startingCastSize = SURVIVOR_STARTING_CAST_SIZE;
  const players = [
    { ...human, id: 'user', status: 'active' as const, isUser: true, isRobo: false, survivorEntryDay: 1, survivorSlot: 0 },
    ...Array.from({ length: startingCastSize - 1 }, (_, index) => buildRoboPlayer(index, runId, 1, index + 1)),
  ];
  const now = Date.now();
  const modeSpecific = createSurvivorModeState(startingCastSize);

  return {
    ...base,
    gameId: runId,
    runId,
    mode: 'survival',
    expansionMode: null,
    status: 'active',
    createdAt: now,
    lastPlayedAt: now,
    saveVersion: SAVE_VERSION,
    season: 1,
    week: 1,
    publicModeEnabled: false,
    cupidArrow: {
      scheduledSeason: null,
      status: 'inactive',
      activatedSeason: null,
      activatedWeek: null,
      pairs: [],
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
    },
    voxPopuli: createInitialVoxPopuliState(null),
    cfg: {
      ...(base.cfg ?? {}),
      jurySize: 0,
      enableJuryReturn: false,
      enableSpectatorReact: false,
    },
    players,
    competitionSeasonStateByPlayerId: buildCompetitionState(players),
    modeSpecific,
    tvFeed: [
      {
        id: 'survivor-e0',
        text: 'Surveyeval Mode online. Eight contestants enter; synthetic replacements keep the board full after every robo eviction.',
        type: 'game',
        timestamp: now,
        meta: { phase: 'week_start', week: 1, mode: 'survival' },
      },
      {
        id: 'survivor-e1',
        text: '[Rules] Public mode: OFF | Social mode: OFF | Endless days: ON | Double Elimination: possible',
        type: 'game',
        timestamp: now,
        meta: { phase: 'week_start', week: 1, mode: 'survival' },
      },
    ],
  };
}

export function buildReplacementRobo(state: GameState, slot?: number): Player {
  const survivorState = getSurvivorModeState(state);
  const currentDay = Math.max(survivorState.currentDay, state.week);
  return buildRoboPlayer(
    survivorState.nextRoboIndex,
    state.runId ?? state.gameId,
    currentDay,
    slot ?? survivorState.nextRoboIndex + 1,
  );
}

export function markSurvivorDay(state: GameState): GameState {
  if (state.mode !== 'survival') return state;
  const modeSpecific = getSurvivorModeState(state);
  const currentDay = Math.max(modeSpecific.currentDay, state.week);
  return {
    ...state,
    modeSpecific: {
      ...modeSpecific,
      startingCastSize: SURVIVOR_STARTING_CAST_SIZE,
      currentDay,
      bestDayReached: Math.max(modeSpecific.bestDayReached, currentDay),
    },
  };
}
