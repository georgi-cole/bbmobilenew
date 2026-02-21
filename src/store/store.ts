import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './gameSlice';
import finaleReducer from './finaleSlice';
import challengeReducer from './challengeSlice';

export const store = configureStore({
  reducer: {
    game: gameReducer,
    finale: finaleReducer,
    challenge: challengeReducer,
  },
  preloadedState: {
    settings: loadSettings(),
  },
});

// Persist settings to localStorage whenever they change
let prevSettings = store.getState().settings;
store.subscribe(() => {
  const current = store.getState().settings;
  if (current !== prevSettings) {
    prevSettings = current;
    saveSettings(current);
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
