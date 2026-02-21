/**
 * App.tsx — root component.
 *
 * Wraps the entire app in:
 *   <GameProvider>  – game state context (no Redux needed)
 *   <RouterProvider> – React Router v6 browser router
 *
 * To add global providers (auth, theme, etc.) wrap them here.
 */
import { RouterProvider } from 'react-router-dom';
import { GameProvider } from './store/GameContext';
import { router } from './routes';

export default function App() {
  return (
    <GameProvider>
      <RouterProvider router={router} />
    </GameProvider>
  );
}
