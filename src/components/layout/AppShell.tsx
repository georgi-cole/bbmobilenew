import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import DebugPanel from '../DebugPanel/DebugPanel';
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
 * To add a new screen: register a route in src/routes.tsx.
 * The nav bar automatically picks it up from its own LINKS array.
 */
export default function AppShell() {
  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <Outlet />
      </main>
      <NavBar />
      <DebugPanel />
    </div>
  );
}
