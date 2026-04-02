import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { resetGame, hydrateGame } from '../../store/gameSlice';
import { hydrateFinale } from '../../store/finaleSlice';
import { hydrateSocial } from '../../social/socialSlice';
import { loadSeasonArchives } from '../../store/archivePersistence';
import {
  selectActiveProfileId,
  selectIsGuest,
  archiveKeyForProfile,
} from '../../store/profilesSlice';
import {
  savedStateKeyForProfile,
  loadSeasonSnapshot,
  clearSeasonSnapshot,
} from '../../store/saveStatePersistence';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import useBackgroundTheme from '../../hooks/useBackgroundTheme';
import useLoadIntroHub from '../../hooks/useLoadIntroHub';
import useIntroHubMusic from '../../hooks/useIntroHubMusic';
import KolequantSplash from '../../components/KolequantSplash/KolequantSplash';
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay';
import PermissionPrompts from '../../components/PermissionPrompts/PermissionPrompts';
import SoundConsentPopup, {
  HUB_MUSIC_CONSENT_KEY,
} from '../../components/SoundConsentPopup/SoundConsentPopup';
import { SoundManager } from '../../services/sound/SoundManager';
import { NativeAudioAdapter } from '../../platform/cordova/NativeAudioAdapter';
import { NATIVE_SFX_MAP, NATIVE_SFX_CONFIG } from '../../platform/cordova/nativeSfxMap';
import { preloadImage } from '../../utils/preload';
import GameButton, { type GameButtonVariant } from '../../components/GameButton/GameButton';
import './HomeHub.css';

/**
 * HomeHub — entry screen with BB hero branding and button stack.
 *
 * Buttons map to named routes in src/routes.tsx.
 * To add a new hub button: add an entry to HUB_BUTTONS.
 *
 * Load ordering:
 *   1. KolequantSplash shown — logo only, no dialogs, hub preloads in background.
 *   2. Splash fades out after ~1.2s animation completes automatically.
 *   3. IMPORTANT — background loaded first: hub background is preloaded during
 *      the splash so buttons never appear over an empty background.
 *   4. After splash exits, PermissionPrompts appear over the hub (location only;
 *      sound consent is handled separately via SoundConsentPopup).
 *   5. SoundConsentPopup is shown after splash unless the user already gave
 *      persistent consent ('bb:hubMusicConsent' === 'granted').
 *   6. When Play is pressed AssetPreloaderOverlay runs then navigates to /game.
 */
const HUB_BUTTONS = [
  { to: '/game',         label: 'Play',        icon: '▶',  variant: 'primary_large'    },
  { to: '/rules',        label: 'Rules',       icon: '📋', variant: 'secondary_medium' },
  { to: '/profile',      label: 'Profile',     icon: '👤', variant: 'secondary_medium' },
  { to: '/leaderboard',  label: 'Leaderboard', icon: '🏆', variant: 'secondary_wide'   },
  { to: '/credits',      label: 'Credits',     icon: '🎬', variant: 'secondary_small'  },
] as const satisfies ReadonlyArray<{ to: string; label: string; icon: string; variant: GameButtonVariant }>;

/** Returns true if the hub music consent popup should be shown. */
function shouldShowSoundConsent(): boolean {
  try {
    return localStorage.getItem(HUB_MUSIC_CONSENT_KEY) !== 'granted';
  } catch {
    return true;
  }
}

export default function HomeHub() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);
  const { url: bgUrl } = useBackgroundTheme();
  const [splashDone, setSplashDone] = useState(false);
  // Track whether the hub background has loaded so buttons are never shown
  // on an empty background (background-first ordering).
  const [bgLoaded, setBgLoaded] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const bgPreloadedRef = useRef(false);
  const [soundConsentHidden, setSoundConsentHidden] = useState(false);
  const [needsSoundConsent] = useState(() => shouldShowSoundConsent());
  const showSoundConsent = splashDone && needsSoundConsent && !soundConsentHidden;
  // Resume-season prompt state for the Play flow.
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  // Load the intro hub overlay assets only while HomeHub is mounted.
  useLoadIntroHub();

  // Play the intro hub ambient music while this screen is mounted.
  // The hook only autoplays if persistent consent is stored; otherwise the
  // SoundConsentPopup below provides the required user gesture.
  useIntroHubMusic();

  // Preload background as soon as its URL resolves, so it is ready before
  // the splash dismisses and buttons become visible.
  useEffect(() => {
    if (!bgUrl || bgPreloadedRef.current) return;
    bgPreloadedRef.current = true;
    preloadImage(bgUrl).then(() => setBgLoaded(true));
  }, [bgUrl]);

  const handleSoundConsentEnable = () => {
    // MUST remain synchronous so that iOS/Safari recognises the gesture context.
    // HTMLAudio priming (inside unlockAndPlayMusicOnly) calls play() synchronously —
    // awaiting before this call would break that requirement.

    // Unlock and prime SFX pools in the gesture context; discard any queued SFX
    // so users don't hear a flood of game sounds when tapping "Enable sounds".
    SoundManager.unlockAndPlayMusicOnly();

    // Start the hub ambient music (idempotent — no-op if already playing).
    void SoundManager.playMusic('music:intro_hub_loop');
    setSoundConsentHidden(true);

    // Kick off native SFX preloads asynchronously in the background.
    // These are non-critical — if preloading hasn't finished when a mapped SFX
    // is triggered, SoundManager will fall back to HTMLAudio automatically.
    void NativeAudioAdapter.init()
      .then(() => {
        if (!NativeAudioAdapter.isAvailable()) return;
        const nativeKeys = Object.values(NATIVE_SFX_MAP) as Array<keyof typeof NATIVE_SFX_CONFIG>;
        return Promise.all(
          nativeKeys.map((nk) => {
            const { path, volume } = NATIVE_SFX_CONFIG[nk];
            return NativeAudioAdapter.preloadComplex(nk, path, volume);
          }),
        );
      })
      .catch((err) => {
        console.warn('[HomeHub] NativeAudio init/preload failed, falling back to HTMLAudio', err);
      });
  };

  const handleSoundConsentDismiss = () => {
    // Option B: denial is NOT persisted — popup will show again next visit.
    setSoundConsentHidden(true);
  };

  const handlePlay = () => {
    // Play gesture — always unlock the Web Audio API here so that AudioGate
    // is not needed on the Intro/Home route.  This satisfies browser autoplay
    // policy: the first user gesture on the home screen unlocks audio context.
    SoundManager.unlockOnUserGesture();
    // Do NOT start music:intro_hub_loop here — we are about to navigate away.
    // Starting it here would cause the track to be queued or briefly played and
    // then stopped by useIntroHubMusic's cleanup on unmount, which can race with
    // game-phase music and cause overlap (e.g. intro hub loop restarting during
    // pos_ceremony).  The hub music is managed exclusively by useIntroHubMusic
    // and handleSoundConsentEnable.

    // Check for a saved in-progress season for the active profile.
    if (!isGuest && activeProfileId) {
      const saveKey = savedStateKeyForProfile(activeProfileId);
      const snapshot = loadSeasonSnapshot(saveKey);
      if (snapshot && snapshot.profileId === activeProfileId) {
        setShowResumePrompt(true);
        return;
      }
    }
    setPreloading(true);
  };

  function handleResume() {
    setShowResumePrompt(false);
    if (!activeProfileId) {
      setPreloading(true);
      return;
    }
    const saveKey = savedStateKeyForProfile(activeProfileId);
    const snapshot = loadSeasonSnapshot(saveKey);
    if (!snapshot || snapshot.profileId !== activeProfileId) {
      // Snapshot vanished — fall back to fresh start.
      handleNewSeason();
      return;
    }
    try {
      dispatch(hydrateGame(snapshot.game));
      dispatch(hydrateFinale(snapshot.finale));
      dispatch(hydrateSocial(snapshot.social));
      navigate('/game');
    } catch {
      // Hydration failed — clear the bad snapshot and start fresh.
      clearSeasonSnapshot(saveKey);
      handleNewSeason();
    }
  }

  function handleNewSeason() {
    setShowResumePrompt(false);
    if (!isGuest && activeProfileId) {
      clearSeasonSnapshot(savedStateKeyForProfile(activeProfileId));
      const archives = loadSeasonArchives(archiveKeyForProfile(activeProfileId)) ?? [];
      dispatch(resetGame(archives));
    }
    setPreloading(true);
  }

  return (
    <>
      {/* Cold-load intro splash — logo only, hub preloads in background.
          Exits automatically after the animation completes (~1.2s). */}
      {!splashDone && (
        <KolequantSplash onFinish={() => setSplashDone(true)} />
      )}

      {/* Permission prompts shown after splash exits, over the hub.
          Sound prompt disabled — sound consent is handled by SoundConsentPopup. */}
      {splashDone && (
        <PermissionPrompts showSoundPrompt={false} />
      )}

      {/* Sound consent popup — asks user to enable hub music.
          Shown after splash unless user already gave persistent consent.
          "Not now" dismisses without persistence (Option B: ask again next time). */}
      {showSoundConsent && (
        <SoundConsentPopup
          onEnable={handleSoundConsentEnable}
          onDismiss={handleSoundConsentDismiss}
        />
      )}

      {/* Asset preloader overlay — shown when Play is pressed (fresh start or new season) */}
      {preloading && <AssetPreloaderOverlay />}

      {/* Resume saved season prompt — shown when Play is pressed and a save exists */}
      <ConfirmExitModal
        open={showResumePrompt}
        title="Resume season?"
        description="Pick up where you left off, or start fresh."
        confirmLabel="Resume"
        cancelLabel="New Season"
        onConfirm={handleResume}
        onCancel={handleNewSeason}
      />

      <div className="homehub-shell">
        <div className="homehub-frame">
          {/* Dynamic background layer */}
          <div
            className="homehub-intro-bg"
            style={bgUrl ? { backgroundImage: `url("${bgUrl}")` } : undefined}
            aria-hidden="true"
          />

          {/* Foreground content — buttons hidden until background has loaded
              to avoid showing the UI over an empty/transparent background. */}
          <div className="homehub-content home-hub">
            {/* Hero / icon area (no branding text — logo is shown in the splash) */}
            <div className="home-hub__hero" aria-hidden="true" />

            {/* Button stack: only rendered once background is ready AND splash has dismissed,
                to prevent accidental clicks through the pointer-events: none splash overlay. */}
            {splashDone && bgLoaded && (
              <nav className="home-hub__buttons" aria-label="Main menu">
                {HUB_BUTTONS.map(({ to, label, icon, variant }) => (
                  <GameButton
                    key={to}
                    label={label}
                    icon={icon}
                    variant={variant}
                    onClick={to === '/game' ? handlePlay : () => navigate(to)}
                  />
                ))}
              </nav>
            )}
          </div>
          {/* Intro hub overlay — chips rendered only while HomeHub is mounted */}
          <div id="intro-hub" />
        </div>
      </div>
    </>
  );
}
