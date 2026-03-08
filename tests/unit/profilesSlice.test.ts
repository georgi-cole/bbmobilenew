/**
 * Unit tests for profilesSlice.
 *
 * Tests:
 *  1. createProfile adds a profile and makes it active.
 *  2. createProfile is blocked at the 5-profile limit.
 *  3. selectActiveProfile switches the active profile.
 *  4. deleteProfile removes a profile and updates activeProfileId.
 *  5. updateProfile mutates the active profile's fields.
 *  6. enterGuestMode sets isGuest and clears activeProfileId.
 *  7. exitGuestMode clears isGuest.
 *  8. loadProfilesState + saveProfilesState round-trip.
 *  9. loadActiveProfile falls back to legacy key.
 * 10. archiveKeyForActiveProfile returns a profile-scoped key.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import profilesReducer, {
  createProfile,
  selectActiveProfile,
  deleteProfile,
  updateProfile,
  enterGuestMode,
  exitGuestMode,
  MAX_PROFILES,
  loadProfilesState,
  saveProfilesState,
  loadActiveProfile,
  archiveKeyForActiveProfile,
  type ProfilesState,
} from '../../src/store/profilesSlice';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore(preloaded?: Partial<ProfilesState>) {
  return configureStore({
    reducer: { profiles: profilesReducer },
    preloadedState: preloaded ? { profiles: preloaded as ProfilesState } : undefined,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createProfile', () => {
  it('adds a profile and makes it active', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    const { profiles, activeProfileId } = store.getState().profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Alice');
    expect(profiles[0].avatar).toBe('👩');
    expect(activeProfileId).toBe(profiles[0].id);
  });

  it('trims name whitespace and defaults to "You" for empty name', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: '  ', avatar: '🧑' }));
    expect(store.getState().profiles.profiles[0].name).toBe('You');
  });

  it('blocks creation when at the 5-profile limit', () => {
    const store = makeStore();
    for (let i = 0; i < MAX_PROFILES; i++) {
      store.dispatch(createProfile({ name: `Player${i}`, avatar: '🧑' }));
    }
    expect(store.getState().profiles.profiles).toHaveLength(MAX_PROFILES);
    // One more should be a no-op
    store.dispatch(createProfile({ name: 'Extra', avatar: '🧑' }));
    expect(store.getState().profiles.profiles).toHaveLength(MAX_PROFILES);
  });

  it('sets isGuest to false when creating', () => {
    const store = makeStore({ profiles: [], activeProfileId: null, isGuest: true });
    store.dispatch(createProfile({ name: 'Bob', avatar: '🧑' }));
    expect(store.getState().profiles.isGuest).toBe(false);
  });
});

describe('selectActiveProfile', () => {
  it('switches the active profile', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    store.dispatch(createProfile({ name: 'Bob', avatar: '🧑' }));
    const firstId = store.getState().profiles.profiles[0].id;
    store.dispatch(selectActiveProfile(firstId));
    expect(store.getState().profiles.activeProfileId).toBe(firstId);
  });

  it('is a no-op for unknown IDs', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    const originalId = store.getState().profiles.activeProfileId;
    store.dispatch(selectActiveProfile('non-existent-id'));
    expect(store.getState().profiles.activeProfileId).toBe(originalId);
  });

  it('clears isGuest', () => {
    const store = makeStore({ profiles: [], activeProfileId: null, isGuest: true });
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    const id = store.getState().profiles.profiles[0].id;
    store.dispatch(enterGuestMode()); // set guest
    store.dispatch(selectActiveProfile(id));
    expect(store.getState().profiles.isGuest).toBe(false);
  });
});

describe('deleteProfile', () => {
  it('removes the profile', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    const id = store.getState().profiles.profiles[0].id;
    store.dispatch(deleteProfile(id));
    expect(store.getState().profiles.profiles).toHaveLength(0);
  });

  it('updates activeProfileId when active profile is deleted', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    store.dispatch(createProfile({ name: 'Bob', avatar: '🧑' }));
    const profiles = store.getState().profiles.profiles;
    const activeId = store.getState().profiles.activeProfileId!;
    store.dispatch(deleteProfile(activeId));
    // Active should now be the other profile (or null if that was the only one)
    expect(store.getState().profiles.activeProfileId).not.toBe(activeId);
    expect(store.getState().profiles.profiles).toHaveLength(1);
    const remaining = profiles.find((p) => p.id !== activeId);
    expect(store.getState().profiles.activeProfileId).toBe(remaining?.id ?? null);
  });
});

describe('updateProfile', () => {
  it('updates name and avatar', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    store.dispatch(updateProfile({ name: 'Alicia', avatar: '👩‍🦱' }));
    const profile = store.getState().profiles.profiles[0];
    expect(profile.name).toBe('Alicia');
    expect(profile.avatar).toBe('👩‍🦱');
  });

  it('merges bio fields', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    store.dispatch(updateProfile({ bio: { location: 'LA', profession: 'Actor' } }));
    store.dispatch(updateProfile({ bio: { profession: 'Director' } }));
    const bio = store.getState().profiles.profiles[0].bio;
    expect(bio?.location).toBe('LA');
    expect(bio?.profession).toBe('Director');
  });

  it('is a no-op when no profile is active', () => {
    const store = makeStore();
    // No profile created; activeProfileId is null
    store.dispatch(updateProfile({ name: 'Ghost' }));
    expect(store.getState().profiles.profiles).toHaveLength(0);
  });
});

describe('guest mode', () => {
  it('enterGuestMode sets isGuest and clears activeProfileId', () => {
    const store = makeStore();
    store.dispatch(createProfile({ name: 'Alice', avatar: '👩' }));
    store.dispatch(enterGuestMode());
    expect(store.getState().profiles.isGuest).toBe(true);
    expect(store.getState().profiles.activeProfileId).toBeNull();
  });

  it('exitGuestMode clears isGuest', () => {
    const store = makeStore({ profiles: [], activeProfileId: null, isGuest: true });
    store.dispatch(exitGuestMode());
    expect(store.getState().profiles.isGuest).toBe(false);
  });
});

describe('loadProfilesState / saveProfilesState', () => {
  const STORAGE_KEY = 'bbmobilenew:profiles:v1';

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('returns default state when nothing is stored', () => {
    const state = loadProfilesState();
    expect(state.profiles).toEqual([]);
    expect(state.activeProfileId).toBeNull();
    expect(state.isGuest).toBe(false);
  });

  it('round-trips via localStorage', () => {
    const state: ProfilesState = {
      profiles: [
        { id: 'abc', name: 'Alice', avatar: '👩', createdAt: '2025-01-01T00:00:00Z' },
      ],
      activeProfileId: 'abc',
      isGuest: false,
    };
    saveProfilesState(state);
    const loaded = loadProfilesState();
    expect(loaded).toEqual(state);
  });

  it('does not throw on corrupted storage', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    expect(() => loadProfilesState()).not.toThrow();
    const state = loadProfilesState();
    expect(state.profiles).toEqual([]);
  });
});

describe('loadActiveProfile', () => {
  const PROFILES_KEY = 'bbmobilenew:profiles:v1';
  const LEGACY_KEY = 'bbmobilenew_user_profile_v1';

  beforeEach(() => {
    localStorage.removeItem(PROFILES_KEY);
    localStorage.removeItem(LEGACY_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(PROFILES_KEY);
    localStorage.removeItem(LEGACY_KEY);
  });

  it('returns the active profile when one is set', () => {
    const state: ProfilesState = {
      profiles: [{ id: 'p1', name: 'Geo', avatar: '🧑', createdAt: '2025-01-01T00:00:00Z' }],
      activeProfileId: 'p1',
      isGuest: false,
    };
    saveProfilesState(state);
    const result = loadActiveProfile();
    expect(result.name).toBe('Geo');
    expect(result.avatar).toBe('🧑');
  });

  it('falls back to legacy key when no profiles saved', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ name: 'OldMe', avatar: '👴' }));
    const result = loadActiveProfile();
    expect(result.name).toBe('OldMe');
  });

  it('returns default when both keys are empty', () => {
    const result = loadActiveProfile();
    expect(result.name).toBe('You');
    expect(result.avatar).toBe('👤');
  });
});

describe('archiveKeyForActiveProfile', () => {
  const PROFILES_KEY = 'bbmobilenew:profiles:v1';

  beforeEach(() => {
    localStorage.removeItem(PROFILES_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(PROFILES_KEY);
  });

  it('returns profile-scoped key when a profile is active', () => {
    const state: ProfilesState = {
      profiles: [{ id: 'p42', name: 'Alice', avatar: '👩', createdAt: '2025-01-01T00:00:00Z' }],
      activeProfileId: 'p42',
      isGuest: false,
    };
    saveProfilesState(state);
    expect(archiveKeyForActiveProfile()).toBe('bbmobilenew:seasonArchives:p42');
  });

  it('returns global fallback key in guest mode', () => {
    const state: ProfilesState = {
      profiles: [],
      activeProfileId: null,
      isGuest: true,
    };
    saveProfilesState(state);
    expect(archiveKeyForActiveProfile()).toBe('bbmobilenew:seasonArchives');
  });

  it('returns global fallback key when no profile is set', () => {
    expect(archiveKeyForActiveProfile()).toBe('bbmobilenew:seasonArchives');
  });
});
