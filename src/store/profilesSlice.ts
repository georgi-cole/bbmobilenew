// src/store/profilesSlice.ts
//
// Multi-profile system.
//
// Key behaviours:
//  - Up to MAX_PROFILES (5) saved profiles per device.
//  - "Login" = selecting an active profile (no password/auth).
//  - Guest mode: no stats/archives saved, warning displayed.
//  - Switching profiles always prompts a season-reset confirmation (handled in UI).
//  - Stand-alone helpers (loadProfilesState, loadActiveProfile,
//    archiveKeyForActiveProfile) are safe to call from gameSlice without
//    creating circular Redux dependencies.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_PROFILES = 5;
const PROFILES_STORAGE_KEY = 'bbmobilenew:profiles:v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileBio {
  /** Short personal story / bio paragraph. */
  story?: string;
  location?: string;
  profession?: string;
  /** Age or age range (stored as string so user can write "25" or "mid-20s"). */
  age?: string;
  /** Personal motto. */
  motto?: string;
  funFact?: string;
  zodiac?: string;
  education?: string;
  familyStatus?: string;
  kids?: string;
  pets?: string;
  /** Religion (optional/sensitive). */
  religion?: string;
  /** Sexuality (optional/sensitive). */
  sexuality?: string;
}

export interface StoredProfile {
  /** Stable unique identifier (timestamp+random). */
  id: string;
  /** In-game display name. */
  name: string;
  /** Emoji fallback avatar. */
  avatar: string;
  /** IndexedDB key for the uploaded photo blob; undefined when no photo set. */
  photoId?: string;
  /** Extended biography fields. */
  bio?: ProfileBio;
  /** ISO timestamp when the profile was created. */
  createdAt: string;
}

export interface ProfilesState {
  profiles: StoredProfile[];
  /** ID of the currently active profile, or null (guest / no selection). */
  activeProfileId: string | null;
  /** When true the user is playing as guest — no stats/archives are saved. */
  isGuest: boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_PROFILES_STATE: ProfilesState = {
  profiles: [],
  activeProfileId: null,
  isGuest: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simple collision-resistant ID generator (no external dep). */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Standalone persistence helpers ──────────────────────────────────────────
// These functions do NOT import the Redux store, so they are safe to call from
// gameSlice.ts (or any module that runs before the store is created).

/** Load profiles state from localStorage. Returns DEFAULT_PROFILES_STATE on error/miss. */
export function loadProfilesState(): ProfilesState {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILES_STATE;
    const parsed = JSON.parse(raw) as Partial<ProfilesState>;
    return {
      profiles: Array.isArray(parsed.profiles) ? (parsed.profiles as StoredProfile[]) : [],
      activeProfileId:
        typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null,
      isGuest: typeof parsed.isGuest === 'boolean' ? parsed.isGuest : false,
    };
  } catch {
    return DEFAULT_PROFILES_STATE;
  }
}

/** Persist profiles state to localStorage. Silently ignores errors. */
export function saveProfilesState(state: ProfilesState): void {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / private-browsing errors.
  }
}

/**
 * Return the active profile's name and avatar (for use in gameSlice.buildUserPlayer).
 * Falls back through the legacy userProfile storage, then to the hardcoded default.
 */
export function loadActiveProfile(): { name: string; avatar: string } {
  const state = loadProfilesState();
  if (!state.isGuest && state.activeProfileId) {
    const profile = state.profiles.find((p) => p.id === state.activeProfileId);
    if (profile) return { name: profile.name, avatar: profile.avatar };
  }
  // Legacy fallback: read from old userProfile storage key.
  try {
    const raw = localStorage.getItem('bbmobilenew_user_profile_v1');
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; avatar?: string };
      return {
        name:
          typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name.trim()
            : 'You',
        avatar:
          typeof parsed.avatar === 'string' && parsed.avatar ? parsed.avatar : '👤',
      };
    }
  } catch {
    // ignore
  }
  return { name: 'You', avatar: '👤' };
}

/**
 * Build the localStorage key under which season archives are stored for the
 * currently active profile.  Guest mode → returns the global fallback key.
 */
export function archiveKeyForActiveProfile(): string {
  const state = loadProfilesState();
  if (!state.isGuest && state.activeProfileId) {
    return `bbmobilenew:seasonArchives:${state.activeProfileId}`;
  }
  return 'bbmobilenew:seasonArchives';
}

// ─── Slice ───────────────────────────────────────────────────────────────────

const profilesSlice = createSlice({
  name: 'profiles',
  initialState: DEFAULT_PROFILES_STATE as ProfilesState,
  reducers: {
    /** Replace the full profiles state (used to hydrate from localStorage on boot). */
    initProfiles(_state, action: PayloadAction<ProfilesState>) {
      return action.payload;
    },

    /**
     * Create a new profile and make it active.
     * No-op (slice unchanged) if the profile limit is already reached.
     */
    createProfile(
      state,
      action: PayloadAction<{ name: string; avatar: string }>,
    ) {
      if (state.profiles.length >= MAX_PROFILES) return;
      const profile: StoredProfile = {
        id: generateId(),
        name: action.payload.name.trim() || 'You',
        avatar: action.payload.avatar || '👤',
        createdAt: new Date().toISOString(),
      };
      state.profiles.push(profile);
      state.activeProfileId = profile.id;
      state.isGuest = false;
    },

    /** Switch the active profile.  No-op if the ID does not exist. */
    selectActiveProfile(state, action: PayloadAction<string>) {
      if (!state.profiles.some((p) => p.id === action.payload)) return;
      state.activeProfileId = action.payload;
      state.isGuest = false;
    },

    /**
     * Update mutable fields on the currently-active profile.
     * `id` and `createdAt` are immutable.
     */
    updateProfile(
      state,
      action: PayloadAction<Partial<Omit<StoredProfile, 'id' | 'createdAt'>>>,
    ) {
      const profile = state.profiles.find((p) => p.id === state.activeProfileId);
      if (!profile) return;
      const { name, avatar, photoId, bio } = action.payload;
      if (name !== undefined) profile.name = name.trim() || profile.name;
      if (avatar !== undefined) profile.avatar = avatar;
      if (photoId !== undefined) profile.photoId = photoId;
      if (bio !== undefined) profile.bio = { ...profile.bio, ...bio };
    },

    /**
     * Delete a profile by ID.
     * If the deleted profile was active, the first remaining profile becomes
     * active (or null if the list is now empty).
     */
    deleteProfile(state, action: PayloadAction<string>) {
      state.profiles = state.profiles.filter((p) => p.id !== action.payload);
      if (state.activeProfileId === action.payload) {
        state.activeProfileId = state.profiles[0]?.id ?? null;
      }
    },

    /** Enter guest mode — clears active profile selection. */
    enterGuestMode(state) {
      state.isGuest = true;
      state.activeProfileId = null;
    },

    /** Exit guest mode — caller must then select or create a profile. */
    exitGuestMode(state) {
      state.isGuest = false;
    },
  },
});

// ─── Actions ─────────────────────────────────────────────────────────────────

export const {
  initProfiles,
  createProfile,
  selectActiveProfile,
  updateProfile,
  deleteProfile,
  enterGuestMode,
  exitGuestMode,
} = profilesSlice.actions;

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectAllProfiles = (state: RootState) => state.profiles.profiles;
export const selectActiveProfileId = (state: RootState) =>
  state.profiles.activeProfileId;
export const selectIsGuest = (state: RootState) => state.profiles.isGuest;

/** Returns the active StoredProfile or null (guest / no profile selected). */
export const selectCurrentProfile = (state: RootState): StoredProfile | null => {
  const { profiles, activeProfileId, isGuest } = state.profiles;
  if (isGuest || !activeProfileId) return null;
  return profiles.find((p) => p.id === activeProfileId) ?? null;
};

export default profilesSlice.reducer;
