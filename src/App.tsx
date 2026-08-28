/**
 * App.tsx — root component.
 *
 * Wraps the entire app in:
 *   <Provider store>  – Redux store provider
 *   <I18nProvider>     – resolved language, messages, and locale formatting
 *   <RouterProvider>  – React Router v6 browser router
 *
 * To add global providers (auth, theme, etc.) wrap them here.
 */
import { useEffect, useState } from 'react'
import { Provider } from 'react-redux'
import { RouterProvider } from 'react-router/dom'
import { store } from './store/store'
import { router } from './routes'
import { SoundManager } from './services/sound/SoundManager'
import AudioStateSync from './services/sound/AudioStateSync'
import RouteLoopAudioSync from './services/sound/RouteLoopAudioSync'
import AudioGate from './components/AudioGate/AudioGate'
import { loadRemoteConfig } from './remoteConfig/remoteConfigSlice'
import { installGameDiagnostics } from './services/diagnostics/gameDiagnostics'
import LiveOpsController from './components/LiveOpsController/LiveOpsController'
import VipEntitlementSync from './components/VipEntitlementSync/VipEntitlementSync'
import DepressionShockController from './components/DepressionShockController/DepressionShockController'
import { I18nProvider } from './i18n'

if (import.meta.env.DEV) {
  console.log(
    '[router] bundle:',
    import.meta.url,
    '| pathname:',
    window.location.pathname,
    '| hash:',
    window.location.hash
  )
}

/** Returns true when a route owns its own full-screen audio/visual experience. */
function suppressesAudioGate(hash: string): boolean {
  return hash === '' || hash === '#' || hash === '#/' || hash.startsWith('#/cinematic')
}

export default function App() {
  // Track hash so we can hide AudioGate on the Intro/Home route — audio is
  // unlocked there via the Play gesture in HomeHub instead.
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    installGameDiagnostics()
    void SoundManager.init()
    // Fetch the remote live-config on startup; falls back to cache or defaults.
    void store.dispatch(loadRemoteConfig())
    const refreshId = window.setInterval(
      () => {
        void store.dispatch(loadRemoteConfig())
      },
      5 * 60 * 1000
    )
    return () => window.clearInterval(refreshId)
  }, [])

  return (
    <Provider store={store}>
      <I18nProvider>
        <LiveOpsController />
        <DepressionShockController />
        <AudioStateSync />
        <RouteLoopAudioSync hash={hash} />
        <VipEntitlementSync />
        {/* AudioGate is suppressed on the Intro/Home route because HomeHub
            unlocks audio via the Play gesture (see HomeHub.handlePlay). */}
        {!suppressesAudioGate(hash) && <AudioGate />}
        <RouterProvider router={router} />
      </I18nProvider>
    </Provider>
  )
}
