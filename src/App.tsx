/**
 * App.tsx — root component.
 *
 * Wraps the entire app in:
 *   <Provider store>  – Redux store provider
 *   <RouterProvider>  – React Router v6 browser router
 *
 * To add global providers (auth, theme, etc.) wrap them here.
 */
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store } from './store/store';
import { router } from './routes';
import { SoundManager } from './services/sound/SoundManager';
import AudioGate from './components/AudioGate/AudioGate';

if (import.meta.env.DEV) {
  console.log('[router] bundle:', import.meta.url, '| pathname:', window.location.pathname, '| hash:', window.location.hash);
}

export default function App() {
  useEffect(() => {
    void SoundManager.init();
  }, []);

  return (
    <Provider store={store}>
      <AudioGate />
      <RouterProvider router={router} />
    </Provider>
  );
}
