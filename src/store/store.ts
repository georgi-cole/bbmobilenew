import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './gameSlice';
import finaleReducer from './finaleSlice';
import challengeReducer from './challengeSlice';
import settingsReducer, { loadSettings, saveSettings } from './settingsSlice';
import userProfileReducer, { loadUserProfile, saveUserProfile } from './userProfileSlice';

export const store = configureStore({
  reducer: {
    game: gameReducer,
    finale: finaleReducer,
    challenge: challengeReducer,
    settings: settingsReducer,
    userProfile: userProfileReducer,
  },
  preloadedState: {
    settings: loadSettings(),
    userProfile: loadUserProfile(),
  },
});

// Persist settings to localStorage whenever they change
let prevSettings = store.getState().settings;
// Persist userProfile to localStorage whenever it changes
let prevUserProfile = store.getState().userProfile;
store.subscribe(() => {
  const current = store.getState();
  if (current.settings !== prevSettings) {
    prevSettings = current.settings;
    saveSettings(current.settings);
  }
  if (current.userProfile !== prevUserProfile) {
    prevUserProfile = current.userProfile;
    saveUserProfile(current.userProfile);
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

if (import.meta.env.DEV) {
  // @ts-expect-error – intentionally attaching store for dev debugging
  window.store = store;
}
