import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
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
  getLastPlayedRun,
  getSavedRun,
  loadSavedRunProfile,
  type SavedSeasonSnapshot,
} from '../../store/saveStatePersistence';
import type { GameMode } from '../../modes/modeTypes';
import { createSurvivorRun } from '../../modes/survivorRun';
import useBackgroundTheme from '../../hooks/useBackgroundTheme';
import KolequantSplash from '../../components/KolequantSplash/KolequantSplash';
import HubLoadingOverlay from '../../components/HubLoadingOverlay/HubLoadingOverlay';
import AssetPreloaderOverlay from '../../components/AssetPreloaderOverlay/AssetPreloaderOverlay';
import PermissionPrompts from '../../components/PermissionPrompts/PermissionPrompts';
import { SoundManager } from '../../services/sound/SoundManager';
import GameButton, { type GameButtonVariant } from '../../components/GameButton/GameButton';
import useHomeHubAssets from '../../hooks/useHomeHubAssets';
import useIntroHubBackground from '../../hooks/useIntroHubBackground';
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
 *   2. Hub assets preload during the splash: background, buttons, fonts, and
 *      the intro-hub runtime are all loaded before the screen is revealed.
 *   3. If the splash finishes first, a loading overlay stays up until the full
 *      hub bundle is ready so the UI never appears half-built.
 *   4. After the hub is ready, PermissionPrompts appear over the hub (location only).
 *   5. When Play is pressed AssetPreloaderOverlay runs then navigates to /game.
 */
const HUB_BUTTONS = [
  { to: '/game',         label: 'Play',        icon: '▶',  variant: 'primary_large'    },
  { to: '/rules',        label: 'Rules',       icon: '📋', variant: 'secondary_medium' },
  { to: '/profile',      label: 'Profile',     icon: '👤', variant: 'secondary_medium' },
  { to: '/leaderboard',  label: 'Leaderboard', icon: '🏆', variant: 'secondary_wide'   },
  { to: '/credits',      label: 'Credits',     icon: '🎬', variant: 'secondary_small'  },
] as const satisfies ReadonlyArray<{ to: string; label: string; icon: string; variant: GameButtonVariant }>;

function snapshotDay(snapshot: SavedSeasonSnapshot | null | undefined): number | null {
  const day = snapshot?.game?.week;
  return typeof day === 'number' && Number.isFinite(day) ? day : null;
}

function buildModeLabel(mode: GameMode, snapshot: SavedSeasonSnapshot | null | undefined): string {
  const day = snapshotDay(snapshot);
  if (mode === 'classic') return day ? `Classic Day ${day}` : 'Classic Campaign';
  const survivorState = snapshot?.game?.modeSpecific?.kind === 'survivor'
    ? snapshot.game.modeSpecific
    : null;
  if (day) return `Survivor Day ${day}`;
  if (survivorState?.bestDayReached) return `Survivor Best ${survivorState.bestDayReached}`;
  return 'Survivor Mode';
}

interface PlaySelectionButton {
  key: string;
  label: string;
  icon: string;
  variant: GameButtonVariant;
  onClick: () => void;
}

interface HomeHubAssetLayerProps {
  splashDone: boolean;
  effectiveBgUrl: string | null;
  backgroundReady: boolean;
  playSelectionOpen: boolean;
  playSelectionButtons: PlaySelectionButton[];
  onPlay: () => void;
  onNavigate: NavigateFunction;
}

function HomeHubAssetLayer({
  splashDone,
  effectiveBgUrl,
  backgroundReady,
  playSelectionOpen,
  playSelectionButtons,
  onPlay,
  onNavigate,
}: HomeHubAssetLayerProps) {
  const { ready: homeHubReady, progress: homeHubLoadProgress, status: homeHubLoadStatus } =
    useHomeHubAssets(effectiveBgUrl);
  const assetReady = backgroundReady && homeHubReady;
  const status = backgroundReady ? homeHubLoadStatus : 'Checking background...';

  return (
    <>
      {splashDone && assetReady && (
        <PermissionPrompts showSoundPrompt={false} />
      )}

      {splashDone && !assetReady && (
        <HubLoadingOverlay progress={homeHubLoadProgress} status={status} />
      )}

      {/* Foreground content — hidden until the full hub asset bundle is ready. */}
      <div className="homehub-content home-hub">
        {/* Hero / icon area (no branding text — logo is shown in the splash) */}
        <div className="home-hub__hero" aria-hidden="true" />

        {/* Button stack: only rendered once the splash has dismissed and the
            full hub bundle is ready. */}
        {splashDone && homeHubReady && (
          <nav className="home-hub__buttons" aria-label={playSelectionOpen ? 'Play menu' : 'Main menu'}>
            {playSelectionOpen
              ? playSelectionButtons.map(({ key, label, icon, variant, onClick }) => (
                  <GameButton
                    key={key}
                    label={label}
                    icon={icon}
                    variant={variant}
                    onClick={onClick}
                  />
                ))
              : HUB_BUTTONS.map(({ to, label, icon, variant }) => (
                  <GameButton
                    key={to}
                    label={label}
                    icon={icon}
                    variant={variant}
                    onClick={to === '/game' ? onPlay : () => onNavigate(to)}
                  />
                ))}
          </nav>
        )}
      </div>
    </>
  );
}

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
  const { url: introHubBgUrl, ready: introHubBgReady } = useIntroHubBackground(remoteBgUrl, bgUrl);
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
  const effectiveBgUrl = introHubBgUrl ?? remoteBgUrl ?? bgUrl;
  const [splashDone, setSplashDone] = useState(() => hasSeenHomeHubSplashForGame(gameId));
  // Seed preloading from transient route state so "Start New Season" can
  // reuse the existing Play → preloader → /game flow without setting state in
  // an effect on mount.
  const [preloading, setPreloading] = useState(autoStartGame);
  const [playSelectionOpen, setPlaySelectionOpen] = useState(false);

  const savedRuns = useMemo(
    () => (!isGuest && activeProfileId ? loadSavedRunProfile(activeProfileId) : null),
    [activeProfileId, isGuest],
  );
  const classicSnapshot = savedRuns?.runs.classic ?? null;
  const survivorSnapshot = savedRuns?.runs.survivor ?? null;
  const lastSnapshot = !isGuest && activeProfileId ? getLastPlayedRun(activeProfileId) : null;

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
    // Clear the transient route state after mount so browser back/refresh
    // doesn't auto-start another season from the same history entry.
    navigate('/', { replace: true });
  }, [autoStartGame, navigate]);

  function hydrateSnapshot(snapshot: SavedSeasonSnapshot) {
    dispatch(hydrateGame(snapshot.game));
    dispatch(hydrateFinale(snapshot.finale));
    dispatch(hydrateSocial(snapshot.social));
    navigate('/game');
  }

  function startClassicRun() {
    if (!isGuest && activeProfileId) {
      const archives = loadSeasonArchives(archiveKeyForProfile(activeProfileId)) ?? [];
      dispatch(resetGame(archives));
    } else {
      dispatch(resetGame(undefined));
    }
    setPreloading(true);
  }

  function startSurvivorRun() {
    dispatch(hydrateGame(createSurvivorRun()));
    setPreloading(true);
  }

  function startOrResumeMode(mode: GameMode) {
    SoundManager.unlockFromGesture();
    if (!isGuest && activeProfileId) {
      const snapshot = getSavedRun(activeProfileId, mode);
      if (snapshot?.profileId === activeProfileId) {
        try {
          hydrateSnapshot(snapshot);
          return;
        } catch {
          // Bad snapshots fall through to a clean run for the selected mode.
        }
      }
    }

    if (mode === 'survivor') startSurvivorRun();
    else startClassicRun();
  }

  function continueLastRun() {
    SoundManager.unlockFromGesture();
    if (lastSnapshot?.profileId === activeProfileId) {
      try {
        hydrateSnapshot(lastSnapshot);
        return;
      } catch {
        setPlaySelectionOpen(true);
      }
    }
  }

  const playSelectionButtons: PlaySelectionButton[] = [];
  if (lastSnapshot) {
    playSelectionButtons.push({
      key: 'continue-last',
      label: 'Continue Last',
      icon: '▶',
      variant: 'primary_large',
      onClick: continueLastRun,
    });
  }
  playSelectionButtons.push(
    {
      key: 'classic',
      label: buildModeLabel('classic', classicSnapshot),
      icon: '🎬',
      variant: 'secondary_wide',
      onClick: () => startOrResumeMode('classic'),
    },
    {
      key: 'survivor',
      label: buildModeLabel('survivor', survivorSnapshot),
      icon: '◆',
      variant: 'secondary_wide',
      onClick: () => startOrResumeMode('survivor'),
    },
    {
      key: 'back',
      label: 'Back',
      icon: '↩',
      variant: 'secondary_medium',
      onClick: () => setPlaySelectionOpen(false),
    },
  );

  const handlePlay = () => {
    // Unlock audio in the gesture context.  We intentionally do NOT follow up
    // with SoundManager.panicStopAllMusic() here — that used to race with the
    // syncMusic() call inside unlockFromGesture() (play-then-stop glitch) and
    // also violated the single-source-of-truth rule: BGM state is owned by
    // AudioStateSync via the resolver, which will transition the track
    // naturally when the route/phase changes below.
    SoundManager.unlockFromGesture();
    setPlaySelectionOpen(true);
  };

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

      {/* Asset preloader overlay — shown when Play is pressed (fresh start or new season) */}
      {preloading && <AssetPreloaderOverlay />}

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

          <HomeHubAssetLayer
            key={effectiveBgUrl ?? 'default'}
            splashDone={splashDone}
            effectiveBgUrl={effectiveBgUrl}
            backgroundReady={introHubBgReady}
            playSelectionOpen={playSelectionOpen}
            playSelectionButtons={playSelectionButtons}
            onPlay={handlePlay}
            onNavigate={navigate}
          />

          {/* Intro hub overlay — chips rendered only while HomeHub is mounted */}
          <div id="intro-hub" />
        </div>
      </div>
    </>
  );
}
