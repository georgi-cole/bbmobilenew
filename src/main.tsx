import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/_ios-standalone-fixes.css'
import App from './App.tsx'

/**
 * Detect iOS/Safari standalone (A2HS) mode and mark the root element so that
 * targeted CSS overrides in _ios-standalone-fixes.css can be applied.
 *
 * Two detection paths are used for maximum compatibility:
 *  1. navigator.standalone  — set by Safari on iOS when launched from home screen
 *  2. matchMedia display-mode: standalone — works on Android Chrome and some
 *     newer iOS Safari versions
 */
function applyStandaloneClass() {
  const isStandalone =
    (typeof window.navigator !== 'undefined' &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches

  if (isStandalone) {
    document.documentElement.classList.add('is-standalone')
  }
}

applyStandaloneClass()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
