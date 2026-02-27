import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/_ios-standalone-fixes.css'
import './styles/_introhub-buttons.css'
import './compat/legacySpectatorAdapter.js'
import { applyDisplayModeClasses } from './utils/displayMode'
import { store } from './store/store'
import { SocialEngine } from './social/SocialEngine'
import App from './App.tsx'

// Apply html class flags (is-standalone, is-webkit, is-chrome-android) as
// early as possible so CSS selectors in _ios-standalone-fixes.css and
// _introhub-buttons.css are active before the first paint.
applyDisplayModeClasses()

// Initialize the Social Engine with the Redux store so it can dispatch actions
// and read state throughout the session.
SocialEngine.init(store)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
