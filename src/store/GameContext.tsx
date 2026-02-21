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

// ─── Seed data ────────────────────────────────────────────────────────────────
// Only players from the canonical houseguests dataset (src/data/houseguests.ts)
// whose avatar image exists in public/avatars/ are included here.
const SEED_PLAYERS: Player[] = [
  { id: 'finn',  name: 'Finn',  avatar: '🧑', status: 'active', isUser: true },
  { id: 'kai',   name: 'Kai',   avatar: '🧑', status: 'active' },
  { id: 'kian',  name: 'Kian',  avatar: '🧑', status: 'active' },
  { id: 'zed',   name: 'Zed',   avatar: '🧑', status: 'active' },
  { id: 'ash',   name: 'Ash',   avatar: '🧑', status: 'active' },
  { id: 'jax',   name: 'Jax',   avatar: '🧑', status: 'active' },
  { id: 'aria',  name: 'Aria',  avatar: '👩', status: 'active' },
  { id: 'echo',  name: 'Echo',  avatar: '👩', status: 'active' },
  { id: 'mimi',  name: 'Mimi',  avatar: '👩', status: 'active' },
  { id: 'rae',   name: 'Rae',   avatar: '👩', status: 'active' },
  { id: 'nova',  name: 'Nova',  avatar: '👩', status: 'active' },
  { id: 'ivy',   name: 'Ivy',   avatar: '👩', status: 'active' },
];

const INITIAL_STATE: GameState = {
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
