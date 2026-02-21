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
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
