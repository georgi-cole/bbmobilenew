import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import SafeGameViewport from './SafeGameViewport';
import DebugPanel from '../DebugPanel/DebugPanel';
import FinalFaceoff from '../FinalFaceoff/FinalFaceoff';
import SeasonFinaleOverlay from '../SeasonFinale/SeasonFinaleOverlay';
import { useAppSelector } from '../../store/hooks';
import { selectFinale } from '../../store/finaleSlice';
import { selectSettings } from '../../store/settingsSlice';
import { selectRemoteConfig } from '../../remoteConfig/remoteConfigSlice';
import useGameMode from '../../hooks/useGameMode';
import './AppShell.css';

const THEME_PRESETS = ['midnight', 'neon', 'sunset', 'ocean'];

export function buildViewportMetaContent(enableZoom: boolean): string {
  return enableZoom
    ? 'width=device-width, initial-scale=1.0, viewport-fit=cover'
    : 'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover';
}

/**
 * AppShell — persistent wrapper around every screen.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │   <Outlet />  (screen)  │  ← fills remaining height
 *   ├─────────────────────────┤
 *   │   <NavBar />            │  ← always visible bottom bar
 *   └─────────────────────────┘
 *
 * The FinalFaceoff overlay is rendered above all screens (z-index 7000)
 * when the game reaches the jury phase.
 *
 * To add a new screen: register a route in src/routes.tsx.
 * The nav bar automatically picks it up from its own LINKS array.
 */
export default function AppShell() {
  const phase = useAppSelector((s) => s.game.phase);
  const seasonFinale = useAppSelector((s) => s.game.seasonFinale);
  const finale = useAppSelector(selectFinale);
  const settings = useAppSelector(selectSettings);
  const { display } = settings;
  const remoteConfig = useAppSelector(selectRemoteConfig);

  useGameMode();

  // Apply theme preset and accessibility classes to document.body
  useEffect(() => {
    THEME_PRESETS.forEach((t) => document.body.classList.remove(`theme-${t}`));
    document.body.classList.add(`theme-${display.themePreset}`);
  }, [display.themePreset]);

  // Keep viewport-fit=cover attached to every runtime viewport meta rewrite.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return undefined;
    const applyViewportMeta = () => {
      meta.content = buildViewportMetaContent(settings.visual?.enableZoom ?? false);
    };
    applyViewportMeta();
    const id = window.setTimeout(applyViewportMeta, 0);
    return () => window.clearTimeout(id);
  }, [settings.visual?.enableZoom]);

  // Apply remote theme CSS custom properties (overrides the preset class values).
  // Properties are cleared when the remote config has no theme section.
  useEffect(() => {
    const theme = remoteConfig?.season?.theme;
    if (theme?.accent) {
      document.body.style.setProperty('--color-accent', theme.accent);
    } else {
      document.body.style.removeProperty('--color-accent');
    }
    if (theme?.accent2) {
      document.body.style.setProperty('--color-accent-2', theme.accent2);
    } else {
      document.body.style.removeProperty('--color-accent-2');
    }
    if (theme?.background) {
      document.body.style.setProperty('--color-bg', theme.background);
    } else {
      document.body.style.removeProperty('--color-bg');
    }
    return () => {
      document.body.style.removeProperty('--color-accent');
      document.body.style.removeProperty('--color-accent-2');
      document.body.style.removeProperty('--color-bg');
    };
  }, [remoteConfig?.season?.theme]);

  useEffect(() => {
    document.body.classList.toggle('reduce-motion', display.reduceMotion);
  }, [display.reduceMotion]);

  useEffect(() => {
    document.body.classList.toggle('high-contrast', display.highContrast);
  }, [display.highContrast]);

  useEffect(() => {
    document.body.classList.toggle('no-animations', !settings.gameUX.animations);
  }, [settings.gameUX.animations]);

  return (
    <SafeGameViewport>
      <div className="app-shell">
        <main className="app-shell__main">
          <Outlet />
        </main>
        <NavBar />
        <DebugPanel />
        {/* Mount FinalFaceoff when entering jury so it can initialise the finale.
            Also remount it for the rare recovery case where jury voting already
            completed but the season finale overlay has not started yet. */}
        {phase === 'jury' &&
          seasonFinale == null &&
          (finale.isActive || !finale.hasStarted || finale.isComplete) && <FinalFaceoff />}
        {seasonFinale && <SeasonFinaleOverlay />}
      </div>
    </SafeGameViewport>
  );
}
