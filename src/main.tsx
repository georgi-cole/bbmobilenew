import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/_ios-standalone-fixes.css'
import './styles/_introhub-buttons.css'
import { applyDisplayModeClasses } from './utils/displayMode'
import App from './App.tsx'

// Apply html class flags (is-standalone, is-webkit, is-chrome-android) as
// early as possible so CSS selectors in _ios-standalone-fixes.css and
// _introhub-buttons.css are active before the first paint.
applyDisplayModeClasses()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
