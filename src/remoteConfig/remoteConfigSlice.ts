/**
 * remoteConfigSlice.ts — Redux slice for the live remote config.
 *
 * State shape:
 *   config     – the validated RemoteConfig or null (before load / on failure)
 *   status     – 'idle' | 'loading' | 'ok' | 'error'
 *   fetchedAt  – epoch ms of the last successful fetch, or null
 *
 * The async thunk loadRemoteConfig() is dispatched once at app startup
 * (App.tsx). Its pending/fulfilled/rejected lifecycle is handled in
 * extraReducers, which sets status to 'loading' while fetching, 'ok' on
 * success, and 'error' on failure. On failure, state.config may still hold
 * a cached value loaded by the service layer.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState } from '../store/store'
import type { RemoteConfig } from './remoteConfigTypes'
import { fetchRemoteConfig, loadCachedRemoteConfig } from './remoteConfigService'
import { SoundManager } from '../services/sound/SoundManager'
import { setRemotePlayerOverrides } from '../utils/avatar'
import { setRemoteSocialRuntimeConfig } from '../social/socialRuntimeConfig'

// ─── State ────────────────────────────────────────────────────────────────────

export type RemoteConfigStatus = 'idle' | 'loading' | 'ok' | 'error'

export interface RemoteConfigState {
  config: RemoteConfig | null
  status: RemoteConfigStatus
  fetchedAt: number | null
}

const _initialConfig = loadCachedRemoteConfig()
// Apply cached overrides synchronously at module init so the first render and
// the first social-engine tick use one coherent validated ruleset.
if (_initialConfig?.players) {
  setRemotePlayerOverrides(_initialConfig.players)
}
setRemoteSocialRuntimeConfig(_initialConfig?.social ?? null)

const initialState: RemoteConfigState = {
  // Initialise from cache synchronously so the app has content on first render
  // even before the async fetch completes.
  config: _initialConfig,
  status: 'idle',
  fetchedAt: null,
}

// ─── Async thunk ──────────────────────────────────────────────────────────────

/**
 * Fetch the remote live-config at startup.
 *
 * Side-effects (outside Redux):
 *  - Registers any remote audio tracks in SoundManager.registerDynamic so they
 *    are playable by key without touching the static SOUND_REGISTRY.
 *  - Applies validated player and social pure-data overlays atomically.
 */
export const loadRemoteConfig = createAsyncThunk<RemoteConfig | null>(
  'remoteConfig/load',
  async () => {
    const config = await fetchRemoteConfig()

    // Register remote music tracks so they can be requested by key.
    if (config?.season?.music?.mainTrackUrl) {
      SoundManager.registerDynamic({
        key: 'music:remote_main',
        category: 'music',
        src: config.season.music.mainTrackUrl,
        preload: false,
        volume: 0.5,
        loop: true,
      })
    }

    // Apply validated module-level registries used outside React rendering.
    setRemotePlayerOverrides(config?.players ?? [])
    setRemoteSocialRuntimeConfig(config?.social ?? null)

    return config
  }
)

const remoteConfigSlice = createSlice({
  name: 'remoteConfig',
  initialState,
  reducers: {
    /** Directly set the remote config (useful for testing). */
    setRemoteConfig(state, action: PayloadAction<RemoteConfig | null>) {
      state.config = action.payload
      state.fetchedAt = Date.now()
      state.status = 'ok'
      setRemotePlayerOverrides(action.payload?.players ?? [])
      setRemoteSocialRuntimeConfig(action.payload?.social ?? null)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadRemoteConfig.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadRemoteConfig.fulfilled, (state, action) => {
        state.config = action.payload
        state.fetchedAt = Date.now()
        // Remote config is optional. A fulfilled load with null payload means
        // "no remote config available", not a hard app error.
        state.status = 'ok'
      })
      .addCase(loadRemoteConfig.rejected, (state) => {
        state.status = 'error'
      })
  },
})

export const { setRemoteConfig } = remoteConfigSlice.actions

export default remoteConfigSlice.reducer

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectRemoteConfig = (s: RootState) => s.remoteConfig?.config ?? null
export const selectRemoteConfigStatus = (s: RootState) => s.remoteConfig?.status ?? 'idle'

/** Returns the headline text for the main TV viewport fallback, if any. */
export const selectRemoteMainTvHeadline = (s: RootState) =>
  s.remoteConfig?.config?.season?.mainTv?.headline ?? null

/** Returns the currently active scheduled global broadcast, if any. */
export const selectRemoteBroadcast = (s: RootState) => {
  const broadcast = s.remoteConfig?.config?.broadcast
  if (!broadcast || broadcast.enabled === false || !broadcast.message) return null
  const now = Date.now()
  if (broadcast.startsAt && Date.parse(broadcast.startsAt) > now) return null
  if (broadcast.endsAt && Date.parse(broadcast.endsAt) <= now) return null
  return broadcast
}

/** Returns the remote intro-hub background image URL, or null. */
export const selectRemoteIntroHubBg = (s: RootState) =>
  s.remoteConfig?.config?.season?.introHub?.backgroundImageUrl ?? null

/** Returns the remote intro-hub overlay opacity (0–1), or null. */
export const selectRemoteIntroHubOverlay = (s: RootState) =>
  s.remoteConfig?.config?.season?.introHub?.overlayOpacity ?? null

/** Returns the player overrides array, or an empty array. */
export const selectRemotePlayerOverrides = (s: RootState) => s.remoteConfig?.config?.players ?? []
