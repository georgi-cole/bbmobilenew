import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
import { hydratePublicOpinion } from '../../publicOpinion/publicOpinionSlice';
import { hydrateChallenge } from '../../store/challengeSlice';
import { loadSeasonArchives } from '../../store/archivePersistence';
import { clearSavedRun, loadSavedRunProfile } from '../../store/saveStatePersistence';
import { getPlayableLastRun } from '../../modes/seasonRulesets';
import { withRunAutosaveSuspended } from '../../store/runAutosaveGate';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import { resizeAndCompressImage } from '../../utils/imageUtils';
import { imageIdToDataUrl, saveImage, deleteImage } from '../../utils/imageDb';
import './ProfilePicker.css';

const AVATAR_OPTIONS = [
  '🧑','👱','👩','🧔','👧','🧓','👩‍🦱','🧑‍🦰','🧑‍🦳','🧑‍🦲','👦','👴',
];

const SAFE_PREVIEW_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function isSafePreviewFile(file: File | Blob) {
  return SAFE_PREVIEW_MIME_TYPES.has(file.type);
}

/**
 * ProfilePicker — allows the user to select, create, delete profiles or enter
 * guest mode. Profile changes are committed together with reset/hydration while
 * run autosave is suspended so state from one profile cannot be persisted into
 * another profile during the transition.
 */
export default function ProfilePicker() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const returnTo = ((location.state as { from?: string } | null)?.from === '/'
    ? '/'
    : '/game');

  const profiles = useAppSelector(selectAllProfiles);
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);

  const isGameActive = useAppSelector(
    (s) => s.game.status === 'active' || s.game.week > 1 || s.game.phase !== 'week_start',
  );

  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAvatar, setNewAvatar] = useState('🧑');
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);
  const [newPhotoBlob, setNewPhotoBlob] = useState<Blob | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [pendingGuest, setPendingGuest] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingHome, setPendingHome] = useState(false);
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null);

  const atLimit = profiles.length >= MAX_PROFILES;

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

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function handleSelectProfile(id: string) {
    if (id === activeProfileId && !isGuest) {
      navigate('/profile', { replace: true, state: { from: returnTo } });
      return;
    }
    if (isGameActive) {
      setPendingSwitchId(id);
    } else {
      commitSwitch(id);
    }
  }

  function commitSwitch(id: string) {
    // Inspect the target profile before changing activeProfileId. This closes a
    // window where visibility autosave could otherwise write the old profile's
    // in-memory game under the newly selected profile ID.
    const snapshot = getPlayableLastRun(loadSavedRunProfile(id));
    if (snapshot?.profileId === id) {
      setPendingResumeId(id);
      return;
    }

    const archives = loadSeasonArchives(archiveKeyForProfile(id)) ?? [];
    withRunAutosaveSuspended(() => {
      dispatch(selectActiveProfile(id));
      dispatch(resetGame(archives));
    });
    navigate('/profile', { replace: true, state: { from: returnTo } });
  }

  function commitResume(id: string) {
    const snapshot = getPlayableLastRun(loadSavedRunProfile(id));
    if (!snapshot || snapshot.profileId !== id) {
      commitWithoutResume(id);
      return;
    }

    try {
      withRunAutosaveSuspended(() => {
        dispatch(selectActiveProfile(id));
        dispatch(hydrateGame(snapshot.game));
        dispatch(hydrateFinale(snapshot.finale));
        dispatch(hydrateSocial(snapshot.social));
        if (snapshot.publicOpinion) dispatch(hydratePublicOpinion(snapshot.publicOpinion));
        if (snapshot.challenge) dispatch(hydrateChallenge(snapshot.challenge));
      });
      navigate('/game', { replace: true });
    } catch {
      // Preserve the durable save if hydration fails. The player can still
      // recover it later instead of a transient UI failure deleting progress.
      commitWithoutResume(id);
    }
  }

  function commitWithoutResume(id: string) {
    const archives = loadSeasonArchives(archiveKeyForProfile(id)) ?? [];
    withRunAutosaveSuspended(() => {
      dispatch(selectActiveProfile(id));
      dispatch(resetGame(archives));
    });
    navigate('/profile', { replace: true, state: { from: returnTo } });
  }

  function handleGuestMode() {
    if (isGameActive) {
      setPendingGuest(true);
    } else {
      commitGuest();
    }
  }

  function handleHome() {
    if (returnTo === '/game') {
      navigate('/game', { replace: true });
      return;
    }
    if (isGameActive) {
      setPendingHome(true);
      return;
    }
    navigate(returnTo, { replace: true });
  }

  function commitHome() {
    dispatch(resetGame());
    setPendingHome(false);
    navigate(returnTo, { replace: true });
  }

  function commitGuest() {
    withRunAutosaveSuspended(() => {
      dispatch(enterGuestMode());
      dispatch(resetGame([]));
    });
    navigate('/game', { replace: true });
  }

  async function handleCreate() {
    if (!newName.trim() || atLimit) return;
    let photoId: string | undefined;
    if (newPhotoBlob) {
      const randomPart = (() => {
        try {
          return crypto.randomUUID();
        } catch {
          return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        }
      })();
      photoId = `profile-photo-${randomPart}`;
      try {
        await saveImage(photoId, newPhotoBlob);
      } catch (err) {
        console.error('Failed to save new profile photo to IndexedDB', err);
        photoId = undefined;
      }
    }
    withRunAutosaveSuspended(() => {
      dispatch(createProfile({ name: newName.trim(), avatar: newAvatar, photoId }));
      dispatch(resetGame([]));
    });
    setShowCreateForm(false);
    setNewName('');
    setNewAvatar('🧑');
    clearNewPhoto();
    navigate('/profile', { replace: true, state: { from: returnTo } });
  }

  function clearNewPhoto() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setNewPhotoPreview(null);
    setNewPhotoBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleNewPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!isSafePreviewFile(file)) {
      clearNewPhoto();
      return;
    }

    setProcessingPhoto(true);
    try {
      const blob = await resizeAndCompressImage(file);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setNewPhotoBlob(blob);
      setNewPhotoPreview(url);
    } catch {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (!isSafePreviewFile(file)) {
        clearNewPhoto();
        return;
      }
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setNewPhotoBlob(file);
      setNewPhotoPreview(url);
    } finally {
      setProcessingPhoto(false);
    }
  }

  function handleDeleteRequest(id: string) {
    setPendingDeleteId(id);
  }

  async function commitDelete(id: string) {
    const profile = profiles.find((p) => p.id === id);
    if (profile?.photoId) {
      await deleteImage(profile.photoId);
    }

    // Delete every modern run slot. clearSavedRun also performs best-effort
    // cleanup of the legacy single-slot key through saveRunProfile().
    clearSavedRun(id, 'classic');
    clearSavedRun(id, 'cupidArrow');
    clearSavedRun(id, 'voxPopuli');
    clearSavedRun(id, 'survival');
    dispatch(deleteProfile(id));
    setPendingDeleteId(null);
  }

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
      <div className="profile-picker__topbar">
        <button
          type="button"
          className="profile-picker__back-btn"
          onClick={handleHome}
        >
          {returnTo === '/game' ? '← Back to Game' : '← Back to Home'}
        </button>
      </div>
      <h1 className="profile-picker__title">👤 Profiles</h1>
      <p className="profile-picker__subtitle">Select a profile to play as</p>

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

      {atLimit && !showCreateForm && (
        <div className="profile-picker__limit-notice">
          <span>⚠️</span>
          <div>
            Maximum of 5 profiles. Delete one to create another.
          </div>
        </div>
      )}

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
              <div className="profile-picker__create-photo-section">
                <div className="profile-picker__create-photo-wrap">
                  {newPhotoPreview ? (
                    <img className="profile-picker__create-photo-img" src={newPhotoPreview} alt="New profile" />
                  ) : (
                    <span className="profile-picker__create-photo-avatar">{newAvatar}</span>
                  )}
                  <button
                    type="button"
                    className="profile-picker__create-photo-btn"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload profile photo"
                  >
                    📷
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleNewPhotoChange}
                  />
                </div>
                <div className="profile-picker__create-photo-copy">
                  <span className="profile-picker__create-photo-label">Profile Photo</span>
                  <span className="profile-picker__create-photo-hint">Upload from your gallery</span>
                  {processingPhoto && <span className="profile-picker__create-photo-processing">Processing image...</span>}
                </div>
              </div>
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
                  onClick={() => { setShowCreateForm(false); setNewName(''); setNewAvatar('🧑'); clearNewPhoto(); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="profile-picker__btn profile-picker__btn--create"
                  disabled={!newName.trim() || processingPhoto}
                  onClick={() => void handleCreate()}
                >
                  Create Profile
                </button>
              </div>
            </div>
          )}
        </>
      )}

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

      <ConfirmExitModal
        open={Boolean(pendingSwitchId)}
        title="Switch Profile?"
        description={`Switching to "${switchTarget?.name ?? ''}" will leave the current screen. Your saved season and Surveyeval progress stay attached to this profile.`}
        confirmLabel="Switch"
        cancelLabel="Keep Playing"
        onConfirm={() => {
          if (pendingSwitchId) commitSwitch(pendingSwitchId);
          setPendingSwitchId(null);
        }}
        onCancel={() => setPendingSwitchId(null)}
      />

      <ConfirmExitModal
        open={Boolean(pendingResumeId)}
        title="Resume saved game?"
        description="This profile already has saved progress. Resume it now, or switch profiles without loading the saved game yet."
        confirmLabel="Resume"
        cancelLabel="Not Now"
        onConfirm={() => {
          if (pendingResumeId) commitResume(pendingResumeId);
          setPendingResumeId(null);
        }}
        onCancel={() => {
          if (pendingResumeId) commitWithoutResume(pendingResumeId);
          setPendingResumeId(null);
        }}
      />

      <ConfirmExitModal
        open={pendingGuest}
        title="Enter Guest Mode?"
        description="Switching to guest mode will leave the current season. Stats and archives will not be saved."
        confirmLabel="Guest Mode"
        cancelLabel="Keep Playing"
        onConfirm={() => { setPendingGuest(false); commitGuest(); }}
        onCancel={() => setPendingGuest(false)}
      />

      <ConfirmExitModal
        open={pendingHome}
        title="Leave for Home?"
        description="Returning home now will leave the current game in memory. Your latest autosave remains available from Play."
        confirmLabel="Go Home"
        cancelLabel="Stay Here"
        onConfirm={commitHome}
        onCancel={() => setPendingHome(false)}
      />

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
