import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import DebugPanel from '../DebugPanel/DebugPanel';
import FinalFaceoff from '../FinalFaceoff/FinalFaceoff';
import { useAppSelector } from '../../store/hooks';
import { selectFinale } from '../../store/finaleSlice';
import './AppShell.css';

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

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <Outlet />
      </main>
      <NavBar />
      <DebugPanel />
      {/* Mount FinalFaceoff only while the overlay is actively shown
          (phase === 'jury' + isActive). Avoids re-mounting after dismissal
          leaves the game stuck at jury phase with an invisible overlay. */}
      {phase === 'jury' && finale.isActive && <FinalFaceoff />}
    </div>
  );
}
