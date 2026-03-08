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
  type StoredProfile,
} from '../../store/profilesSlice';
import { resetGame } from '../../store/gameSlice';
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

  // Confirmation for profile switch
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  // Confirmation for guest mode
  const [pendingGuest, setPendingGuest] = useState(false);
  // Confirmation for delete
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
    dispatch(resetGame());
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
    dispatch(resetGame());
    navigate('/game');
  }

  function handleCreate() {
    if (!newName.trim() || atLimit) return;
    // If game is in progress we reset it so the new profile starts fresh
    dispatch(createProfile({ name: newName.trim(), avatar: newAvatar }));
    dispatch(resetGame());
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
    dispatch(deleteProfile(id));
    setPendingDeleteId(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const deleteTarget = profiles.find((p) => p.id === pendingDeleteId);
  const switchTarget = profiles.find((p) => p.id === pendingSwitchId);

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
            <br />
            <button
              type="button"
              className="profile-picker__limit-manage"
              onClick={() => {/* already on manage page */}}
            >
              Manage Profiles ↑
            </button>
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

      {/* Profile-switch confirmation modal */}
      <ConfirmExitModal
        open={Boolean(pendingSwitchId)}
        title="Switch Profile?"
        description={`Switching to "${switchTarget?.name ?? ''}" will reset the current season. Any unsaved progress will be lost.`}
        confirmLabel="Switch & Reset"
        cancelLabel="Keep Playing"
        onConfirm={() => {
          if (pendingSwitchId) commitSwitch(pendingSwitchId);
          setPendingSwitchId(null);
        }}
        onCancel={() => setPendingSwitchId(null)}
      />

      {/* Guest mode confirmation modal */}
      <ConfirmExitModal
        open={pendingGuest}
        title="Enter Guest Mode?"
        description="Switching to guest mode will reset the current season. Stats and archives will not be saved."
        confirmLabel="Guest & Reset"
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
