import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import DebugPanel from '../DebugPanel/DebugPanel';
import FinalFaceoff from '../FinalFaceoff/FinalFaceoff';
import SeasonFinaleOverlay from '../SeasonFinale/SeasonFinaleOverlay';
import { useAppSelector } from '../../store/hooks';
import { selectFinale } from '../../store/finaleSlice';
import { selectSettings } from '../../store/settingsSlice';
import useGameMode from '../../hooks/useGameMode';
import './AppShell.css';

const THEME_PRESETS = ['midnight', 'neon', 'sunset', 'ocean'];

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

  useGameMode();

  // Apply theme preset and accessibility classes to document.body
  useEffect(() => {
    THEME_PRESETS.forEach((t) => document.body.classList.remove(`theme-${t}`));
    document.body.classList.add(`theme-${display.themePreset}`);
  }, [display.themePreset]);

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
  );
}
