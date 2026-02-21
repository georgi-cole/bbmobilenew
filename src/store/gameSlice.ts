import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { GameState, Player, Phase, TvEvent } from '../types';

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED_PLAYERS: Player[] = [
  { id: 'p1',  name: 'Alex',    avatar: '🧑',  status: 'hoh',       isUser: true },
  { id: 'p2',  name: 'Blake',   avatar: '👱',  status: 'nominated' },
  { id: 'p3',  name: 'Casey',   avatar: '👩',  status: 'nominated' },
  { id: 'p4',  name: 'Dana',    avatar: '🧔',  status: 'active' },
  { id: 'p5',  name: 'Ellis',   avatar: '👧',  status: 'pov' },
  { id: 'p6',  name: 'Frankie', avatar: '🧓',  status: 'active' },
  { id: 'p7',  name: 'Grace',   avatar: '👩‍🦱', status: 'active' },
  { id: 'p8',  name: 'Harper',  avatar: '🧑‍🦰', status: 'active' },
  { id: 'p9',  name: 'Indigo',  avatar: '🧑‍🦳', status: 'active' },
  { id: 'p10', name: 'Jordan',  avatar: '👦',  status: 'active' },
  { id: 'p11', name: 'Kai',     avatar: '🧑‍🦲', status: 'evicted' },
  { id: 'p12', name: 'Logan',   avatar: '👴',  status: 'jury' },
];

const initialState: GameState = {
  season: 1,
  week: 3,
  phase: 'veto_comp',
  players: SEED_PLAYERS,
  tvFeed: [
    { id: 'e1', text: 'Alex won the Head of Household competition! 🏆', type: 'game', timestamp: Date.now() - 9000 },
    { id: 'e2', text: 'Blake and Casey have been nominated for eviction.', type: 'game', timestamp: Date.now() - 6000 },
    { id: 'e3', text: 'Ellis won the Power of Veto! 🎭', type: 'game', timestamp: Date.now() - 3000 },
    { id: 'e4', text: 'Dana and Frankie formed a secret alliance.', type: 'social', timestamp: Date.now() - 1500 },
  ],
  isLive: false,
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setPhase(state, action: PayloadAction<Phase>) {
      state.phase = action.payload;
    },
    advanceWeek(state) {
      state.week += 1;
      state.phase = 'intermission';
    },
    updatePlayer(state, action: PayloadAction<Player>) {
      const idx = state.players.findIndex((p) => p.id === action.payload.id);
      if (idx !== -1) state.players[idx] = action.payload;
    },
    addTvEvent(state, action: PayloadAction<Omit<TvEvent, 'id' | 'timestamp'>>) {
      const event: TvEvent = {
        ...action.payload,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
    },
    setLive(state, action: PayloadAction<boolean>) {
      state.isLive = action.payload;
    },
  },
});

export const { setPhase, advanceWeek, updatePlayer, addTvEvent, setLive } = gameSlice.actions;
export default gameSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────
const selectPlayers = (state: RootState) => state.game.players;

export const selectAlivePlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
);

export const selectEvictedPlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status === 'evicted' || p.status === 'jury')
);
