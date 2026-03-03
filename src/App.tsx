/**
 * App.tsx — root component.
 *
 * Wraps the entire app in:
 *   <Provider store>  – Redux store provider
 *   <RouterProvider>  – React Router v6 browser router
 *
 * To add global providers (auth, theme, etc.) wrap them here.
 */
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store } from './store/store';
import { router } from './routes';
import { SoundManager } from './services/sound/SoundManager';
import AudioGate from './components/AudioGate/AudioGate';

if (import.meta.env.DEV) {
  console.log('[router] bundle:', import.meta.url, '| pathname:', window.location.pathname, '| hash:', window.location.hash);
}

/** Returns true when the current hash corresponds to the Intro/Home route. */
function isHomeRoute(hash: string): boolean {
  return hash === '' || hash === '#' || hash === '#/';
}

export default function App() {
  // Track hash so we can hide AudioGate on the Intro/Home route — audio is
  // unlocked there via the Play gesture in HomeHub instead.
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    void SoundManager.init();
  }, []);

  return (
    <Provider store={store}>
      {/* AudioGate is suppressed on the Intro/Home route because HomeHub
          unlocks audio via the Play gesture (see HomeHub.handlePlay). */}
      {!isHomeRoute(hash) && <AudioGate />}
      <RouterProvider router={router} />
    </Provider>
  );
}
