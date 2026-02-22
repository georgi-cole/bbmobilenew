// src/store/userProfileSlice.ts
// Persisted user profile (name + emoji avatar fallback).
// Saved to localStorage; consumed by gameSlice to build the user player.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

const STORAGE_KEY = 'bbmobilenew_user_profile_v1';

export interface UserProfileState {
  /** In-game display name for the human player. */
  name: string;
  /** Emoji used as the last-resort avatar fallback when no image loads. */
  avatar: string;
}

export const DEFAULT_USER_PROFILE: UserProfileState = {
  name: 'You',
  avatar: '👤',
};

export function loadUserProfile(): UserProfileState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfileState>;
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : DEFAULT_USER_PROFILE.name,
      avatar: typeof parsed.avatar === 'string' && parsed.avatar ? parsed.avatar : DEFAULT_USER_PROFILE.avatar,
    };
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

export function saveUserProfile(profile: UserProfileState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore (e.g. private browsing quota)
  }
}

const userProfileSlice = createSlice({
  name: 'userProfile',
  initialState: DEFAULT_USER_PROFILE as UserProfileState,
  reducers: {
    setUserProfile(_state, action: PayloadAction<UserProfileState>) {
      return action.payload;
    },
    setUserName(state, action: PayloadAction<string>) {
      state.name = action.payload.trim() || DEFAULT_USER_PROFILE.name;
    },
    setUserAvatar(state, action: PayloadAction<string>) {
      state.avatar = action.payload || DEFAULT_USER_PROFILE.avatar;
    },
  },
});

export const { setUserProfile, setUserName, setUserAvatar } = userProfileSlice.actions;
export const selectUserProfile = (state: RootState) => state.userProfile;
export default userProfileSlice.reducer;
