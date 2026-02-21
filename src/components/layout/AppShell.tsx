import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import DebugPanel from '../DebugPanel/DebugPanel';
import FinalFaceoff from '../FinalFaceoff/FinalFaceoff';
import { useAppSelector } from '../../store/hooks';
import { selectFinale } from '../../store/finaleSlice';
import { selectSettings } from '../../store/settingsSlice';
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
  const finale = useAppSelector(selectFinale);
  const { display } = useAppSelector(selectSettings);

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

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <Outlet />
      </main>
      <NavBar />
      <DebugPanel />
      {/* Mount FinalFaceoff when entering jury so it can initialise the finale.
          Keep the previous safeguard: don't remount after dismissal by checking
          hasStarted. */}
      {phase === 'jury' && (finale.isActive || !finale.hasStarted) && <FinalFaceoff />}
    </div>
  );
}
