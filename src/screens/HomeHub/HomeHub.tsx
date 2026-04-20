import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import KolequantSplash from '../../components/KolequantSplash/KolequantSplash';
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay';
import PermissionPrompts from '../../components/PermissionPrompts/PermissionPrompts';
import { SoundManager } from '../../services/sound/SoundManager';
import { preloadImage } from '../../utils/preload';
import GameButton, { type GameButtonVariant } from '../../components/GameButton/GameButton';
import {
  hasSeenHomeHubSplashForGame,
  markHomeHubSplashSeenForGame,
} from './homeHubSplashSession';
import {
  selectRemoteIntroHubBg,
  selectRemoteIntroHubOverlay,
} from '../../remoteConfig/remoteConfigSlice';
import { buildAchievementSummary } from '../../store/achievementSummary';
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
 *   4. After splash exits, PermissionPrompts appear over the hub (location only).
 *   5. When Play is pressed AssetPreloaderOverlay runs then navigates to /game.
 */
const HUB_BUTTONS = [
  { to: '/game',         label: 'Play',        icon: '▶',  variant: 'primary_large'    },
  { to: '/rules',        label: 'Rules',       icon: '📋', variant: 'secondary_medium' },
  { to: '/profile',      label: 'Profile',     icon: '👤', variant: 'secondary_medium' },
  { to: '/leaderboard',  label: 'Leaderboard', icon: '🏆', variant: 'secondary_wide'   },
  { to: '/credits',      label: 'Credits',     icon: '🎬', variant: 'secondary_small'  },
] as const satisfies ReadonlyArray<{ to: string; label: string; icon: string; variant: GameButtonVariant }>;

export default function HomeHub() {
  const location = useLocation();
  const autoStartGame = (location.state as { autoStartGame?: boolean } | null)?.autoStartGame === true;
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const gameId = useAppSelector((state) => state.game.gameId);
  const season = useAppSelector((state) => state.game.season);
  const week = useAppSelector((state) => state.game.week);
  const phase = useAppSelector((state) => state.game.phase);
  const introHubPlayer = useAppSelector(
    (state) => state.game.players.find((player) => player.isUser) ?? null,
  );
  const seasonArchives = useAppSelector((state) => state.game.seasonArchives ?? []);
  // `game.week` is the legacy state field name, but in the current game flow it
  // represents the current in-game day count.
  const dayCount = week;
  const activeProfileId = useAppSelector(selectActiveProfileId);
  const isGuest = useAppSelector(selectIsGuest);
  const { url: bgUrl } = useBackgroundTheme();
  const remoteBgUrl = useAppSelector(selectRemoteIntroHubBg);
  const remoteOverlayOpacity = useAppSelector(selectRemoteIntroHubOverlay);
  const achievementSummary = useMemo(
    () => buildAchievementSummary({
      userPlayer: introHubPlayer,
      seasonArchives,
      day: dayCount,
      phase,
    }),
    [dayCount, introHubPlayer, phase, seasonArchives],
  );
  // Remote background takes priority over weather/time-of-day background.
  const effectiveBgUrl = remoteBgUrl ?? bgUrl;
  const [splashDone, setSplashDone] = useState(() => hasSeenHomeHubSplashForGame(gameId));
  // Track whether the hub background has loaded so buttons are never shown
  // on an empty background (background-first ordering).
  const [loadedBgUrl, setLoadedBgUrl] = useState<string | null>(null);
  const bgLoaded = effectiveBgUrl != null && loadedBgUrl === effectiveBgUrl;
  const [preloading, setPreloading] = useState(autoStartGame);
  const preloadedBgUrlRef = useRef<string | null>(null);
  // Resume-season prompt state for the Play flow.
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  // Load the intro hub overlay assets only while HomeHub is mounted.
  useLoadIntroHub();

  useEffect(() => {
    const gameWindow = window as Window & { game?: Record<string, unknown> };
    gameWindow.game = gameWindow.game ?? {};
    // Legacy IntroHub/achievements scripts still read from window.game, so keep
    // the specific season fields they depend on in sync while HomeHub is mounted.
    Object.assign(gameWindow.game, {
      season,
      day: dayCount,
      week,
      phase,
      players: introHubPlayer ? [introHubPlayer] : [],
      seasonArchives,
      achievementSummary,
    });
  }, [achievementSummary, dayCount, season, week, phase, introHubPlayer, seasonArchives]);

  useEffect(() => {
    if (!autoStartGame) return;
    navigate('/', { replace: true });
  }, [autoStartGame, navigate]);

  // Preload background as soon as its URL resolves, so it is ready before
  // the splash dismisses and buttons become visible.
  useEffect(() => {
    if (!effectiveBgUrl || preloadedBgUrlRef.current === effectiveBgUrl) return;

    let cancelled = false;
    preloadedBgUrlRef.current = effectiveBgUrl;

    preloadImage(effectiveBgUrl).then(() => {
      if (cancelled || preloadedBgUrlRef.current !== effectiveBgUrl) return;
      setLoadedBgUrl(effectiveBgUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveBgUrl]);

  const handlePlay = () => {
    // Unlock audio in the gesture context.  We intentionally do NOT follow up
    // with SoundManager.panicStopAllMusic() here — that used to race with the
    // syncMusic() call inside unlockFromGesture() (play-then-stop glitch) and
    // also violated the single-source-of-truth rule: BGM state is owned by
    // AudioStateSync via the resolver, which will transition the track
    // naturally when the route/phase changes below.
    SoundManager.unlockFromGesture();

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

  function handleSplashFinish() {
    markHomeHubSplashSeenForGame(gameId);
    setSplashDone(true);
  }

  return (
    <>
      {/* Cold-load intro splash — logo only, hub preloads in background.
          Exits automatically after the animation completes (~1.2s). */}
      {!splashDone && (
        <KolequantSplash onFinish={handleSplashFinish} />
      )}

      {/* Permission prompts shown after splash exits, over the hub.
          Sound prompt disabled — audio is unlocked when the player explicitly starts the game. */}
      {splashDone && (
        <PermissionPrompts showSoundPrompt={false} />
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
            style={effectiveBgUrl ? { backgroundImage: `url("${effectiveBgUrl}")` } : undefined}
            aria-hidden="true"
          />

          {/* Remote overlay — only rendered when the remote config sets an overlayOpacity */}
          {remoteOverlayOpacity != null && remoteOverlayOpacity > 0 && (
            <div
              className="homehub-remote-overlay"
              style={{ opacity: remoteOverlayOpacity }}
              aria-hidden="true"
            />
          )}

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
                    className={to === '/game' ? 'game-btn--play-shimmer' : undefined}
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
