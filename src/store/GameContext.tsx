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

const INITIAL_STATE: GameState = {
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
      return { ...state, week: state.week + 1, phase: 'intermission' };
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
