import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './gameSlice';
import finaleReducer from './finaleSlice';
import challengeReducer from './challengeSlice';
import settingsReducer, { loadSettings, saveSettings } from './settingsSlice';
import userProfileReducer, { loadUserProfile, saveUserProfile } from './userProfileSlice';
import profilesReducer, {
  loadProfilesState,
  saveProfilesState,
  archiveKeyForProfile,
} from './profilesSlice';
import socialReducer from '../social/socialSlice';
import { socialMiddleware } from '../social/socialMiddleware';
import { soundMiddleware } from './soundMiddleware';
import uiReducer from './uiSlice';
import { saveSeasonArchives, DEFAULT_ARCHIVE_KEY } from './archivePersistence';
import {
  savedStateKeyForProfile,
  clearSeasonSnapshot,
} from './saveStatePersistence';
import cwgoReducer from '../features/cwgo/cwgoCompetitionSlice';
import holdTheWallReducer from '../features/holdTheWall/holdTheWallSlice';
import biographyBlitzReducer from '../features/biographyBlitz/biography_blitz_logic';
import famousFiguresReducer from '../features/famousFigures/famousFiguresSlice';
import silentSaboteurReducer from '../features/silentSaboteur/silentSaboteurSlice';
import glassBridgeReducer from '../features/glassBridge/glassBridgeSlice';
import blackjackTournamentReducer from '../features/blackjackTournament/blackjackTournamentSlice';
import riskWheelReducer from '../features/riskWheel/riskWheelSlice';

export const store = configureStore({
  reducer: {
    game: gameReducer,
    finale: finaleReducer,
    challenge: challengeReducer,
    settings: settingsReducer,
    userProfile: userProfileReducer,
    profiles: profilesReducer,
    social: socialReducer,
    ui: uiReducer,
    cwgo: cwgoReducer,
    holdTheWall: holdTheWallReducer,
    biographyBlitz: biographyBlitzReducer,
    famousFigures: famousFiguresReducer,
    silentSaboteur: silentSaboteurReducer,
    glassBridge: glassBridgeReducer,
    blackjackTournament: blackjackTournamentReducer,
    riskWheel: riskWheelReducer,
  },
  preloadedState: {
    settings: loadSettings(),
    userProfile: loadUserProfile(),
    profiles: loadProfilesState(),
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(socialMiddleware, soundMiddleware),
});

// Persist settings to localStorage whenever they change
let prevSettings = store.getState().settings;
// Persist userProfile to localStorage whenever it changes
let prevUserProfile = store.getState().userProfile;
// Persist profiles state to localStorage whenever it changes
let prevProfiles = store.getState().profiles;
// Persist season archives to localStorage whenever they change
let prevSeasonArchives = store.getState().game.seasonArchives;
// Track archive count to detect season completion (for auto-clearing save snapshots)
let prevSeasonArchivesLength = prevSeasonArchives?.length ?? 0;
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
  if (current.profiles !== prevProfiles) {
    prevProfiles = current.profiles;
    saveProfilesState(current.profiles);
  }
  if (current.game.seasonArchives !== prevSeasonArchives) {
    prevSeasonArchives = current.game.seasonArchives;
    const newLength = current.game.seasonArchives?.length ?? 0;
    // Guest mode: skip archive persistence entirely.
    if (!current.profiles.isGuest) {
      const archiveKey = current.profiles.activeProfileId
        ? archiveKeyForProfile(current.profiles.activeProfileId)
        : DEFAULT_ARCHIVE_KEY;
      saveSeasonArchives(archiveKey, current.game.seasonArchives ?? []);

      // When a new season is archived (archive count increases), the previous
      // in-progress save snapshot is now stale — clear it automatically.
      if (newLength > prevSeasonArchivesLength && current.profiles.activeProfileId) {
        clearSeasonSnapshot(savedStateKeyForProfile(current.profiles.activeProfileId));
      }
    }
    prevSeasonArchivesLength = newLength;
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

if (import.meta.env.DEV) {
  // @ts-expect-error – intentionally attaching store for dev debugging
  window.store = store;
}
