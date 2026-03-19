import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  selectAllProfiles,
  selectActiveProfileId,
  selectIsGuest,
  createProfile,
  selectActiveProfile,
  deleteProfile,
  enterGuestMode,
  MAX_PROFILES,
  archiveKeyForProfile,
  type StoredProfile,
} from '../../store/profilesSlice';
import { resetGame, hydrateGame } from '../../store/gameSlice';
import { hydrateFinale } from '../../store/finaleSlice';
import { hydrateSocial } from '../../social/socialSlice';
import { loadSeasonArchives } from '../../store/archivePersistence';
import {
  savedStateKeyForProfile,
  loadSeasonSnapshot,
  clearSeasonSnapshot,
} from '../../store/saveStatePersistence';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import { imageIdToDataUrl } from '../../utils/imageDb';
import { deleteImage } from '../../utils/imageDb';
import './ProfilePicker.css';

const AVATAR_OPTIONS = [
  '🧑','👱','👩','🧔','👧','🧓','👩‍🦱','🧑‍🦰','🧑‍🦳','🧑‍🦲','👦','👴',
];

/**
 * ProfilePicker — allows the user to select, create, delete profiles or enter
 * guest mode.  Switching profiles (when a game is active) shows a confirmation
 * warning that the current season will be reset.
 *
 * When selecting a profile that has a saved in-progress season, the user is
 * prompted to resume that season or start a fresh one.
 */
export default function ProfilePicker() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const profiles = useAppSelector(selectAllProfiles);
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);

  // Is there an in-progress game (non-trivial state) that would be lost?
  const isGameActive = useAppSelector(
    (s) => s.game.week > 1 || s.game.phase !== 'week_start',
  );

  // Photo cache: profileId → dataUrl
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});

  // Create-form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAvatar, setNewAvatar] = useState('🧑');

  // Confirmation for profile switch (current game is active)
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  // Confirmation for guest mode
  const [pendingGuest, setPendingGuest] = useState(false);
  // Confirmation for delete
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Resume-save prompt: triggered when switching to a profile that has a saved season.
  // Holds the profile ID to switch to so the confirm/cancel handlers can act on it.
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);

  const atLimit = profiles.length >= MAX_PROFILES;

  // Load profile photos from IndexedDB whenever the list changes
  useEffect(() => {
    async function loadPhotos() {
      const entries: Record<string, string> = {};
      for (const p of profiles) {
        if (p.photoId && !photoCache[p.id]) {
          const url = await imageIdToDataUrl(p.photoId);
          if (url) entries[p.id] = url;
        }
      }
      if (Object.keys(entries).length > 0) {
        setPhotoCache((prev) => ({ ...prev, ...entries }));
      }
    }
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleSelectProfile(id: string) {
    if (id === activeProfileId && !isGuest) {
      // Already active — just go back
      navigate(-1);
      return;
    }
    if (isGameActive) {
      // Need confirmation because switching resets the current season
      setPendingSwitchId(id);
    } else {
      commitSwitch(id);
    }
  }

  function commitSwitch(id: string) {
    dispatch(selectActiveProfile(id));
    // Load archives for the newly-selected profile so they are not cross-contaminated
    // with the previous profile's in-memory archives.
    // After dispatch(selectActiveProfile), store.subscribe has already flushed the new
    // activeProfileId to localStorage, so the key below resolves to the right profile.

    // Check if there's a saved in-progress season for this profile.
    const saveKey = savedStateKeyForProfile(id);
    const snapshot = loadSeasonSnapshot(saveKey);
    if (snapshot && snapshot.profileId === id) {
      // A saved season exists — prompt the user to resume or start fresh.
      setPendingResumeId(id);
    } else {
      // No saved season — start fresh immediately.
      const archives = loadSeasonArchives(archiveKeyForProfile(id)) ?? [];
      dispatch(resetGame(archives));
      navigate('/profile');
    }
  }

  function commitResume(id: string) {
    const saveKey = savedStateKeyForProfile(id);
    const snapshot = loadSeasonSnapshot(saveKey);
    if (!snapshot || snapshot.profileId !== id) {
      // Snapshot vanished or is from wrong profile — fall back to fresh start.
      commitStartFresh(id);
      return;
    }
    try {
      dispatch(hydrateGame(snapshot.game));
      dispatch(hydrateFinale(snapshot.finale));
      dispatch(hydrateSocial(snapshot.social));
      navigate('/game');
    } catch {
      // If hydration fails for any reason, gracefully fall back to a fresh season
      // and clear the bad snapshot so it doesn't keep reappearing.
      clearSeasonSnapshot(saveKey);
      commitStartFresh(id);
    }
  }

  function commitStartFresh(id: string) {
    const saveKey = savedStateKeyForProfile(id);
    clearSeasonSnapshot(saveKey);
    const archives = loadSeasonArchives(archiveKeyForProfile(id)) ?? [];
    dispatch(resetGame(archives));
    navigate('/profile');
  }

  function handleGuestMode() {
    if (isGameActive) {
      setPendingGuest(true);
    } else {
      commitGuest();
    }
  }

  function commitGuest() {
    dispatch(enterGuestMode());
    // Guest mode never persists archives, so start with an empty list.
    dispatch(resetGame([]));
    navigate('/game');
  }

  function handleCreate() {
    if (!newName.trim() || atLimit) return;
    // A newly created profile has no archives yet.
    dispatch(createProfile({ name: newName.trim(), avatar: newAvatar }));
    dispatch(resetGame([]));
    setShowCreateForm(false);
    setNewName('');
    setNewAvatar('🧑');
    navigate('/profile');
  }

  function handleDeleteRequest(id: string) {
    setPendingDeleteId(id);
  }

  async function commitDelete(id: string) {
    // Also remove the photo from IndexedDB
    const profile = profiles.find((p) => p.id === id);
    if (profile?.photoId) {
      await deleteImage(profile.photoId);
    }
    // Clear any saved season snapshot for this profile.
    clearSeasonSnapshot(savedStateKeyForProfile(id));
    dispatch(deleteProfile(id));
    setPendingDeleteId(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const deleteTarget = profiles.find((p) => p.id === pendingDeleteId);
  const switchTarget = profiles.find((p) => p.id === pendingSwitchId);
  const resumeTarget = profiles.find((p) => p.id === pendingResumeId);

  function renderAvatar(p: StoredProfile) {
    const url = photoCache[p.id];
    if (url) {
      return <img className="profile-picker__avatar-img" src={url} alt={p.name} />;
    }
    return <span className="profile-picker__avatar">{p.avatar}</span>;
  }

  return (
    <div className="placeholder-screen profile-picker">
      <h1 className="profile-picker__title">👤 Profiles</h1>
      <p className="profile-picker__subtitle">Select a profile to play as</p>

      {/* Saved profiles */}
      {profiles.length > 0 && (
        <div className="profile-picker__list">
          {profiles.map((p) => {
            const isActive = p.id === activeProfileId && !isGuest;
            return (
              <div
                key={p.id}
                className={`profile-picker__card${isActive ? ' profile-picker__card--active' : ''}`}
              >
                {renderAvatar(p)}
                <div className="profile-picker__info">
                  <div className="profile-picker__name">{p.name}</div>
                  <div className="profile-picker__meta">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {isActive && (
                  <span className="profile-picker__badge">Active</span>
                )}
                <div className="profile-picker__actions">
                  {!isActive && (
                    <button
                      type="button"
                      className="profile-picker__btn profile-picker__btn--select"
                      onClick={() => handleSelectProfile(p.id)}
                    >
                      Select
                    </button>
                  )}
                  <button
                    type="button"
                    className="profile-picker__btn profile-picker__btn--delete"
                    onClick={() => handleDeleteRequest(p.id)}
                    aria-label={`Delete profile ${p.name}`}
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* At-limit notice */}
      {atLimit && !showCreateForm && (
        <div className="profile-picker__limit-notice">
          <span>⚠️</span>
          <div>
            Maximum of 5 profiles. Delete one to create another.
          </div>
        </div>
      )}

      {/* Divider + create section */}
      {!atLimit && (
        <>
          {profiles.length > 0 && (
            <div className="profile-picker__divider">
              <span className="profile-picker__divider-line" />
              <span className="profile-picker__divider-label">or</span>
              <span className="profile-picker__divider-line" />
            </div>
          )}

          {!showCreateForm ? (
            <button
              type="button"
              className="profile-picker__btn profile-picker__btn--create"
              style={{ width: '100%', marginBottom: 12 }}
              onClick={() => setShowCreateForm(true)}
            >
              ➕ Create New Profile
            </button>
          ) : (
            <div className="profile-picker__create">
              <p className="profile-picker__create-title">New Profile</p>
              <input
                className="profile-picker__input"
                type="text"
                placeholder="Enter display name"
                maxLength={24}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <div className="profile-picker__avatar-grid">
                {AVATAR_OPTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`profile-picker__avatar-btn${newAvatar === em ? ' profile-picker__avatar-btn--selected' : ''}`}
                    onClick={() => setNewAvatar(em)}
                    aria-label={em}
                    aria-pressed={newAvatar === em}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="profile-picker__create-actions">
                <button
                  type="button"
                  className="profile-picker__btn--cancel"
                  onClick={() => { setShowCreateForm(false); setNewName(''); setNewAvatar('🧑'); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="profile-picker__btn profile-picker__btn--create"
                  disabled={!newName.trim()}
                  onClick={handleCreate}
                >
                  Create Profile
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Guest mode */}
      <div className="profile-picker__divider">
        <span className="profile-picker__divider-line" />
        <span className="profile-picker__divider-label">play without saving</span>
        <span className="profile-picker__divider-line" />
      </div>
      <div className="profile-picker__guest">
        <button
          type="button"
          className="profile-picker__btn--guest"
          onClick={handleGuestMode}
        >
          Continue as Guest
        </button>
        <p className="profile-picker__guest-warning">
          ⚠️ Guest mode — stats and season archives will not be saved.
        </p>
      </div>

      {/* Profile-switch confirmation modal (current season will be lost) */}
      <ConfirmExitModal
        open={Boolean(pendingSwitchId)}
        title="Switch Profile?"
        description={`Switching to "${switchTarget?.name ?? ''}" will leave your current season. Save your game first if you want to resume it later.`}
        confirmLabel="Switch"
        cancelLabel="Keep Playing"
        onConfirm={() => {
          if (pendingSwitchId) commitSwitch(pendingSwitchId);
          setPendingSwitchId(null);
        }}
        onCancel={() => setPendingSwitchId(null)}
      />

      {/* Resume saved season prompt */}
      <ConfirmExitModal
        open={Boolean(pendingResumeId)}
        title="Resume Saved Season?"
        description={`"${resumeTarget?.name ?? ''}" has a saved season in progress. Would you like to pick up where you left off?`}
        confirmLabel="Resume"
        cancelLabel="Start Fresh"
        onConfirm={() => {
          if (pendingResumeId) commitResume(pendingResumeId);
          setPendingResumeId(null);
        }}
        onCancel={() => {
          if (pendingResumeId) commitStartFresh(pendingResumeId);
          setPendingResumeId(null);
        }}
      />

      {/* Guest mode confirmation modal */}
      <ConfirmExitModal
        open={pendingGuest}
        title="Enter Guest Mode?"
        description="Switching to guest mode will leave the current season. Stats and archives will not be saved."
        confirmLabel="Guest Mode"
        cancelLabel="Keep Playing"
        onConfirm={() => { setPendingGuest(false); commitGuest(); }}
        onCancel={() => setPendingGuest(false)}
      />

      {/* Delete confirmation modal */}
      <ConfirmExitModal
        open={Boolean(pendingDeleteId)}
        title="Delete Profile?"
        description={`"${deleteTarget?.name ?? ''}" and all associated data will be permanently removed.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => { if (pendingDeleteId) void commitDelete(pendingDeleteId); }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
