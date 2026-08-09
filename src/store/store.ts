import { configureStore } from '@reduxjs/toolkit'
import gameReducer, { replaceBroadcastConfig } from './gameSlice'
import finaleReducer from './finaleSlice'
import challengeReducer from './challengeSlice'
import settingsReducer, { loadSettings, saveSettings } from './settingsSlice'
import userProfileReducer, { loadUserProfile, saveUserProfile } from './userProfileSlice'
import profilesReducer, {
  loadProfilesState,
  saveProfilesState,
  archiveKeyForProfile,
} from './profilesSlice'
import socialReducer from '../social/socialSlice'
import { socialMiddleware } from '../social/socialMiddleware'
import { realityIntegrityMiddleware } from '../social/realityIntegrityMiddleware'
import { survivorMiddleware } from '../modes/survivorMiddleware'
import { tribunalEligibilityMiddleware } from './tribunalEligibilityMiddleware'
import { soundMiddleware } from './soundMiddleware'
import uiReducer from './uiSlice'
import { saveSeasonArchives, DEFAULT_ARCHIVE_KEY } from './archivePersistence'
import {
  savedStateKeyForProfile,
  clearSeasonSnapshot,
  clearSavedRun,
  getSavedRunSlot,
  createSavedSeasonSnapshot,
  saveRunSnapshot,
} from './saveStatePersistence'
import cwgoReducer from '../features/cwgo/cwgoCompetitionSlice'
import holdTheWallReducer from '../features/holdTheWall/holdTheWallSlice'
import biographyBlitzReducer from '../features/biographyBlitz/biography_blitz_logic'
import famousFiguresReducer from '../features/famousFigures/famousFiguresSlice'
import silentSaboteurReducer from '../features/silentSaboteur/silentSaboteurSlice'
import majorityRulesReducer from '../features/majorityRules/majorityRulesSlice'
import glassBridgeReducer from '../features/glassBridge/glassBridgeSlice'
import blackjackTournamentReducer from '../features/blackjackTournament/blackjackTournamentSlice'
import riskWheelReducer from '../features/riskWheel/riskWheelSlice'
import wildcardWesternReducer from '../features/wildcardWestern/wildcardWesternSlice'
import tetrisReducer from '../features/tetris/tetrisSlice'
import tiltLabyrinthReducer from '../features/tiltLabyrinth/tiltLabyrinthSlice'
import houseOfCardsReducer from '../features/houseOfCards/houseOfCardsSlice'
import memoryColorsReducer from '../features/memoryColors/memoryColorsSlice'
import { syncRuntimeAudioSettings } from '../services/sound/audioSettingsSync'
import publicOpinionReducer from '../publicOpinion/publicOpinionSlice'
import { publicOpinionMiddleware } from '../publicOpinion/publicOpinionMiddleware'
import { dramaPublicSaveMiddleware } from '../publicOpinion/dramaPublicSaveMiddleware'
import adsReducer, { loadAdsState, saveAdsState } from './adsSlice'
import { adsMiddleware } from './adsMiddleware'
import remoteConfigReducer from '../remoteConfig/remoteConfigSlice'
import { secretMissionMiddleware } from './secretMissionMiddleware'
import { gameDiagnosticsMiddleware } from '../services/diagnostics/gameDiagnostics'
import vipReducer, { loadVipState } from './vipSlice'
import { saveCachedVipEntitlement } from '../vip/vipStorage'
import {
  BROADCAST_CONFIG_STORAGE_KEY,
  loadBroadcastConfig,
  saveBroadcastConfig,
} from '../broadcasting/broadcastConfigPersistence'

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
    majorityRules: majorityRulesReducer,
    glassBridge: glassBridgeReducer,
    blackjackTournament: blackjackTournamentReducer,
    riskWheel: riskWheelReducer,
    wildcardWestern: wildcardWesternReducer,
    tetris: tetrisReducer,
    tiltLabyrinth: tiltLabyrinthReducer,
    houseOfCards: houseOfCardsReducer,
    memoryColors: memoryColorsReducer,
    publicOpinion: publicOpinionReducer,
    ads: adsReducer,
    remoteConfig: remoteConfigReducer,
    vip: vipReducer,
  },
  preloadedState: {
    settings: loadSettings(),
    userProfile: loadUserProfile(),
    profiles: loadProfilesState(),
    ads: loadAdsState(),
    vip: loadVipState(),
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      survivorMiddleware,
      tribunalEligibilityMiddleware,
      realityIntegrityMiddleware,
      socialMiddleware,
      soundMiddleware,
      publicOpinionMiddleware,
      dramaPublicSaveMiddleware,
      adsMiddleware,
      secretMissionMiddleware,
      gameDiagnosticsMiddleware
    ),
})

// The Broadcast Manager is commonly kept open beside the game. localStorage
// persists its authoring data; this listener makes a save in that manager tab
// immediately update the live game tab and its ordered presentation queue.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== BROADCAST_CONFIG_STORAGE_KEY) return
    const config = loadBroadcastConfig()
    store.dispatch(replaceBroadcastConfig(config))
  })
}

function hasMeaningfulGameProgress(game: ReturnType<typeof store.getState>['game']): boolean {
  return (
    game.mode === 'survival' ||
    game.week > 1 ||
    (game.phase !== 'season_start' && game.phase !== 'week_start') ||
    Boolean(game.runId) ||
    Boolean(game.pendingEviction) ||
    Boolean(game.seasonFinale)
  )
}

// Persist settings to localStorage whenever they change
let prevSettings = store.getState().settings
// Persist userProfile to localStorage whenever it changes
let prevUserProfile = store.getState().userProfile
// Persist profiles state to localStorage whenever it changes
let prevProfiles = store.getState().profiles
// Persist ads state to localStorage whenever they change
let prevAds = store.getState().ads
// Persist permanent purchase entitlements whenever they change.
let prevVip = store.getState().vip
// Persist active mode runs whenever the game slice changes.
let prevGame = store.getState().game
let prevBroadcastOverrides = store.getState().game.broadcastOverrides
let prevCustomBroadcasts = store.getState().game.customBroadcasts
let prevFinale = store.getState().finale
let prevSocial = store.getState().social
let prevPublicOpinion = store.getState().publicOpinion
let prevChallenge = store.getState().challenge
// Persist season archives to localStorage whenever they change
let prevSeasonArchives = store.getState().game.seasonArchives
// Track archive length together with the profile that owns those archives.
// Using a profile-scoped baseline prevents profile switches and game hydration
// from falsely triggering snapshot auto-clears when the newly loaded archive
// array happens to be longer than the previous profile's.
let prevSeasonArchivesLength = prevSeasonArchives?.length ?? 0
let prevArchiveProfileId: string | null = store.getState().profiles?.activeProfileId ?? null
store.subscribe(() => {
  const current = store.getState()
  if (
    current.game.broadcastOverrides !== prevBroadcastOverrides ||
    current.game.customBroadcasts !== prevCustomBroadcasts
  ) {
    prevBroadcastOverrides = current.game.broadcastOverrides
    prevCustomBroadcasts = current.game.customBroadcasts
    saveBroadcastConfig(current.game.broadcastOverrides ?? {}, current.game.customBroadcasts ?? [])
  }
  if (current.settings !== prevSettings) {
    prevSettings = current.settings
    saveSettings(current.settings)
    // Keep SoundManager category enabled/volume state in sync with Redux audio
    // settings so that mute controls and Settings screen are the canonical source
    // of truth and stale localStorage flags cannot silently disable audio.
    syncRuntimeAudioSettings(current.settings.audio)
  }
  if (current.userProfile !== prevUserProfile) {
    prevUserProfile = current.userProfile
    saveUserProfile(current.userProfile)
  }
  if (current.profiles !== prevProfiles) {
    prevProfiles = current.profiles
    saveProfilesState(current.profiles)
  }
  if (current.ads !== prevAds) {
    prevAds = current.ads
    saveAdsState(current.ads)
  }
  if (current.vip !== prevVip) {
    prevVip = current.vip
    saveCachedVipEntitlement({
      isActive: current.vip.isActive,
      entitlements: current.vip.entitlements,
      lastVerifiedAt: current.vip.lastVerifiedAt,
    })
  }
  const resumableStateChanged =
    current.game !== prevGame ||
    current.finale !== prevFinale ||
    current.social !== prevSocial ||
    current.publicOpinion !== prevPublicOpinion ||
    current.challenge !== prevChallenge
  if (resumableStateChanged) {
    prevGame = current.game
    prevFinale = current.finale
    prevSocial = current.social
    prevPublicOpinion = current.publicOpinion
    prevChallenge = current.challenge
    const activeProfileId = current.profiles.activeProfileId
    if (!current.profiles.isGuest && activeProfileId && hasMeaningfulGameProgress(current.game)) {
      saveRunSnapshot(activeProfileId, createSavedSeasonSnapshot(activeProfileId, current))
    }
  }
  if (current.game.seasonArchives !== prevSeasonArchives) {
    prevSeasonArchives = current.game.seasonArchives
    const newLength = current.game.seasonArchives?.length ?? 0
    const archivesProfileId = current.profiles.activeProfileId
    // Only auto-clear when archives grew on the *same* profile — a genuine season
    // completion. Skip when the profile changed (switch/hydration) to avoid
    // deleting a valid in-progress save simply because a different profile had
    // more archived seasons.
    const sameProfile = archivesProfileId === prevArchiveProfileId
    // Guest mode: skip archive persistence entirely.
    if (!current.profiles.isGuest) {
      const archiveKey = archivesProfileId
        ? archiveKeyForProfile(archivesProfileId)
        : DEFAULT_ARCHIVE_KEY
      saveSeasonArchives(archiveKey, current.game.seasonArchives ?? [])

      // When a new season is archived (archive count increases on the same profile),
      // the previous in-progress save snapshot is now stale — clear it automatically.
      if (sameProfile && newLength > prevSeasonArchivesLength && archivesProfileId) {
        clearSeasonSnapshot(savedStateKeyForProfile(archivesProfileId))
        clearSavedRun(archivesProfileId, getSavedRunSlot(current.game))
      }
    }
    prevSeasonArchivesLength = newLength
    prevArchiveProfileId = archivesProfileId
  }
})

// Android may reclaim a background WebView without another Redux action. Force
// the latest serializable campaign state to storage as soon as the app hides.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    const current = store.getState()
    const activeProfileId = current.profiles.activeProfileId
    if (current.profiles.isGuest || !activeProfileId || !hasMeaningfulGameProgress(current.game))
      return
    saveRunSnapshot(activeProfileId, createSavedSeasonSnapshot(activeProfileId, current))
  })
}

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

if (import.meta.env.DEV) {
  // @ts-expect-error – intentionally attaching store for dev debugging
  window.store = store
}
