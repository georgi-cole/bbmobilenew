// Context + hook in one file — fast-refresh will reload but state is preserved via context.
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type { GameState, Player, Phase, TvEvent } from '../types';
import HOUSEGUESTS from '../data/houseguests';
import { mulberry32, seededPickN } from './rng';
import { loadUserProfile } from './userProfileSlice';
import { SOCIAL_INITIAL_STATE } from '../social/constants';

// ─── Houseguest pool ─────────────────────────────────────────────────────────
const HOUSEGUEST_POOL = HOUSEGUESTS.map((hg) => ({
  id: hg.id,
  name: hg.name,
  avatar: hg.sex === 'Female' ? '👩' : '🧑',
}));

const GAME_ROSTER_SIZE = 12;

function buildUserPlayer(): Player {
  const profile = loadUserProfile();
  return {
    id: 'user',
    name: profile.name,
    avatar: profile.avatar,
    status: 'active',
    isUser: true,
  };
}

function buildInitialPlayers(): Player[] {
  const seed = (Math.floor(Math.random() * 0x100000000)) >>> 0;
  const rng = mulberry32(seed);
  const picked = seededPickN(rng, HOUSEGUEST_POOL, GAME_ROSTER_SIZE - 1).map((hg) => ({
    ...hg,
    status: 'active' as const,
  }));
  return [buildUserPlayer(), ...picked];
}

const INITIAL_STATE: GameState = {
  season: 1,
  week: 1,
  phase: 'week_start',
  seed: 42,
  hohId: null,
  prevHohId: null,
  nomineeIds: [],
  povWinnerId: null,
  players: buildInitialPlayers(),
  tvFeed: [
    { id: 'e0', text: 'Welcome to Big Brother – AI Edition! 🏠 Season 1 is about to begin.', type: 'game', timestamp: Date.now() },
  ],
  isLive: false,
  social: SOCIAL_INITIAL_STATE,
};

// ─── Actions ─────────────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'ADVANCE_WEEK' }
  | { type: 'UPDATE_PLAYER'; player: Player }
  | { type: 'ADD_TV_EVENT'; event: TvEvent }
  | { type: 'SET_LIVE'; isLive: boolean };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'ADVANCE_WEEK':
      return { ...state, week: state.week + 1, phase: 'week_start' };
    case 'UPDATE_PLAYER':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.player.id ? action.player : p
        ),
      };
    case 'ADD_TV_EVENT':
      return {
        ...state,
        tvFeed: [action.event, ...state.tvFeed].slice(0, 50),
      };
    case 'SET_LIVE':
      return { ...state, isLive: action.isLive };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────
interface GameContextValue {
  state: GameState;
  setPhase: (phase: Phase) => void;
  advanceWeek: () => void;
  updatePlayer: (player: Player) => void;
  addTvEvent: (event: Omit<TvEvent, 'id' | 'timestamp'>) => void;
  setLive: (isLive: boolean) => void;
  alivePlayers: Player[];
  evictedPlayers: Player[];
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const setPhase = useCallback((phase: Phase) => dispatch({ type: 'SET_PHASE', phase }), []);
  const advanceWeek = useCallback(() => dispatch({ type: 'ADVANCE_WEEK' }), []);
  const updatePlayer = useCallback((player: Player) => dispatch({ type: 'UPDATE_PLAYER', player }), []);
  const setLive = useCallback((isLive: boolean) => dispatch({ type: 'SET_LIVE', isLive }), []);

  const addTvEvent = useCallback(
    (event: Omit<TvEvent, 'id' | 'timestamp'>) =>
      dispatch({
        type: 'ADD_TV_EVENT',
        event: { ...event, id: `e${Date.now()}`, timestamp: Date.now() },
      }),
    []
  );

  const alivePlayers = state.players.filter(
    (p) => p.status !== 'evicted' && p.status !== 'jury'
  );
  const evictedPlayers = state.players.filter(
    (p) => p.status === 'evicted' || p.status === 'jury'
  );

  return (
    <GameContext.Provider
      value={{ state, setPhase, advanceWeek, updatePlayer, addTvEvent, setLive, alivePlayers, evictedPlayers }}
    >
      {children}
    </GameContext.Provider>
  );
}

/** Hook — throws if used outside <GameProvider> */
export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
