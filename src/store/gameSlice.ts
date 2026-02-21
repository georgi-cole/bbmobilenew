import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { GameState, Player, Phase, TvEvent } from '../types';
import { mulberry32, seededPick, seededPickN } from './rng';

// ─── Canonical phase order ────────────────────────────────────────────────────
const PHASE_ORDER: Phase[] = [
  'week_start',
  'hoh_comp',
  'hoh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pov_comp',
  'pov_results',
  'pov_ceremony',
  'pov_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
];

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED_PLAYERS: Player[] = [
  { id: 'p1',  name: 'Alex',    avatar: '🧑',  status: 'active', isUser: true },
  { id: 'p2',  name: 'Blake',   avatar: '👱',  status: 'active' },
  { id: 'p3',  name: 'Casey',   avatar: '👩',  status: 'active' },
  { id: 'p4',  name: 'Dana',    avatar: '🧔',  status: 'active' },
  { id: 'p5',  name: 'Ellis',   avatar: '👧',  status: 'active' },
  { id: 'p6',  name: 'Frankie', avatar: '🧓',  status: 'active' },
  { id: 'p7',  name: 'Grace',   avatar: '👩‍🦱', status: 'active' },
  { id: 'p8',  name: 'Harper',  avatar: '🧑‍🦰', status: 'active' },
  { id: 'p9',  name: 'Indigo',  avatar: '🧑‍🦳', status: 'active' },
  { id: 'p10', name: 'Jordan',  avatar: '👦',  status: 'active' },
  { id: 'p11', name: 'Kai',     avatar: '🧑‍🦲', status: 'active' },
  { id: 'p12', name: 'Logan',   avatar: '👴',  status: 'active' },
];

const initialState: GameState = {
  season: 1,
  week: 1,
  phase: 'week_start',
  seed: 42,
  hohId: null,
  nomineeIds: [],
  povWinnerId: null,
  players: SEED_PLAYERS,
  tvFeed: [
    { id: 'e0', text: 'Welcome to Big Brother – AI Edition! 🏠 Season 1 is about to begin.', type: 'game', timestamp: Date.now() },
  ],
  isLive: false,
};

// ─── Helper ──────────────────────────────────────────────────────────────────
function pushEvent(state: GameState, text: string, type: TvEvent['type']) {
  const event: TvEvent = {
    id: `${state.phase}-w${state.week}-${Date.now()}`,
    text,
    type,
    timestamp: Date.now(),
  };
  state.tvFeed = [event, ...state.tvFeed].slice(0, 50);
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setPhase(state, action: PayloadAction<Phase>) {
      state.phase = action.payload;
    },
    advanceWeek(state) {
      state.week += 1;
      state.phase = 'week_start';
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

    /** Advance to the next phase, computing outcomes deterministically via RNG. */
    advance(state) {
      const currentIdx = PHASE_ORDER.indexOf(state.phase);
      const nextIdx = (currentIdx + 1) % PHASE_ORDER.length;
      const nextPhase = PHASE_ORDER[nextIdx];

      // Advance seed: consume one RNG value so each advance uses a different seed
      const seedRng = mulberry32(state.seed);
      state.seed = (seedRng() * 0x100000000) >>> 0;
      const rng = mulberry32(state.seed);

      const alive = state.players.filter(
        (p) => p.status !== 'evicted' && p.status !== 'jury',
      );

      switch (nextPhase) {
        case 'week_start': {
          // week_end → week_start: increment week and reset week-level fields
          state.week += 1;
          state.hohId = null;
          state.nomineeIds = [];
          state.povWinnerId = null;
          state.players.forEach((p) => {
            if (['hoh', 'nominated', 'pov', 'hoh+pov', 'nominated+pov'].includes(p.status)) {
              p.status = 'active';
            }
          });
          pushEvent(state, `Week ${state.week} begins! 🏠 It's time for the HOH competition.`, 'game');
          break;
        }
        case 'hoh_comp': {
          pushEvent(state, `The Head of Household competition has begun! 🏆 Who will win power this week?`, 'game');
          break;
        }
        case 'hoh_results': {
          const hoh = seededPick(rng, alive);
          state.hohId = hoh.id;
          state.players.forEach((p) => {
            if (p.id === hoh.id) p.status = 'hoh';
          });
          pushEvent(state, `${hoh.name} has won Head of Household! 👑`, 'game');
          break;
        }
        case 'social_1': {
          const hohName = state.players.find((p) => p.id === state.hohId)?.name ?? 'The new HOH';
          pushEvent(state, `Houseguests congratulate ${hohName}. Alliances are already forming… 💬`, 'social');
          break;
        }
        case 'nominations': {
          const hohName = state.players.find((p) => p.id === state.hohId)?.name ?? 'The HOH';
          pushEvent(state, `${hohName} is preparing the nomination ceremony. 🎯`, 'game');
          break;
        }
        case 'nomination_results': {
          const pool = alive.filter((p) => p.id !== state.hohId);
          const nominees = seededPickN(rng, pool, 2);
          state.nomineeIds = nominees.map((n) => n.id);
          nominees.forEach((n) => {
            const p = state.players.find((pl) => pl.id === n.id);
            if (p) p.status = 'nominated';
          });
          const names = nominees.map((n) => n.name).join(' and ');
          pushEvent(state, `${names} have been nominated for eviction. 🎯`, 'game');
          break;
        }
        case 'pov_comp': {
          pushEvent(state, `The Power of Veto competition is underway! 🎭`, 'game');
          break;
        }
        case 'pov_results': {
          const pov = seededPick(rng, alive);
          state.povWinnerId = pov.id;
          const p = state.players.find((pl) => pl.id === pov.id);
          if (p) {
            if (p.status === 'hoh') p.status = 'hoh+pov';
            else if (p.status === 'nominated') p.status = 'nominated+pov';
            else p.status = 'pov';
          }
          pushEvent(state, `${pov.name} has won the Power of Veto! 🎭`, 'game');
          break;
        }
        case 'pov_ceremony': {
          const povName = state.players.find((p) => p.id === state.povWinnerId)?.name ?? 'The veto holder';
          pushEvent(state, `${povName} is holding the Veto Ceremony. ⚡`, 'game');
          break;
        }
        case 'pov_ceremony_results': {
          const povName = state.players.find((p) => p.id === state.povWinnerId)?.name ?? 'The veto holder';
          pushEvent(state, `${povName} has decided NOT to use the Power of Veto. The nominations remain the same. ⚡`, 'game');
          break;
        }
        case 'social_2': {
          pushEvent(state, `Houseguests make their final pitches before the live vote. 🤝`, 'social');
          break;
        }
        case 'live_vote': {
          const nomNames = state.nomineeIds
            .map((id) => state.players.find((p) => p.id === id)?.name ?? id)
            .join(' and ');
          pushEvent(state, `The live eviction vote has begun! ${nomNames} face eviction. 🗳️`, 'vote');
          break;
        }
        case 'eviction_results': {
          const nominees = state.players.filter((p) => state.nomineeIds.includes(p.id));
          if (nominees.length > 0) {
            const evicted = seededPick(rng, nominees);
            evicted.status = 'evicted';
            state.nomineeIds = state.nomineeIds.filter((id) => id !== evicted.id);
            pushEvent(state, `${evicted.name}, you have been evicted from the Big Brother house. 🚪`, 'game');
          }
          break;
        }
        case 'week_end': {
          pushEvent(state, `Week ${state.week} has come to an end. A new week begins soon… ✨`, 'game');
          break;
        }
      }

      state.phase = nextPhase;
    },
  },
});

export const { setPhase, advanceWeek, updatePlayer, addTvEvent, setLive, advance } =
  gameSlice.actions;
export default gameSlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────
const selectPlayers = (state: RootState) => state.game.players;

export const selectAlivePlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status !== 'evicted' && p.status !== 'jury'),
);

export const selectEvictedPlayers = createSelector(selectPlayers, (players) =>
  players.filter((p) => p.status === 'evicted' || p.status === 'jury'),
);
