import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/gameDesignSystem.css'
import './styles/gameAccessibility.css'
import './styles/minigameModernisation.css'
import './styles/_ios-standalone-fixes.css'
import './styles/_introhub-buttons.css'
import './compat/legacySpectatorAdapter.js'
import { applyDisplayModeClasses } from './utils/displayMode'
import { applyVisualFreezeState } from './utils/visualFreeze'
import { buildViewportMetaContent } from './components/layout/viewportMeta'
import { store } from './store/store'
import { setAudio } from './store/settingsSlice'
import { SocialEngine } from './social/SocialEngine'
import { syncRuntimeAudioSettings } from './services/sound/audioSettingsSync'
import { installAudioVisualSync } from './services/sound/audioVisualSync'
import { initAdBridge } from './services/ads/adsService'
import { installE2EStateProbe } from './testSupport/e2eStateProbe'
import App from './App.tsx'
import './styles/gameOverResponsiveFixes.css'
import './styles/houseOfCardsInteractionFix.css'
import './styles/houseOfCardsBrightTheme.css'
import './styles/houseOfCardsBrightThemePriority.css'

const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'local'

// Layout diagnostics are a development-only facility. Clear both activation
// paths before React mounts so a stale browser flag or copied debug URL can
// never expose the responsive-layout overlay in a production build.
if (!import.meta.env.DEV) {
  try {
    localStorage.removeItem('bbmobile:debugLayout')
  } catch {
    // Storage may be blocked; the URL guard below still removes the other path.
  }
  const url = new URL(window.location.href)
  if (url.searchParams.has('debugLayout')) {
    url.searchParams.delete('debugLayout')
    window.history.replaceState(window.history.state, '', url)
  }
}

// Apply html class flags (is-standalone, is-webkit, is-chrome-android) as
// early as possible so CSS selectors in _ios-standalone-fixes.css and
// _introhub-buttons.css are active before the first paint.
applyDisplayModeClasses()

// The premium gameplay chrome is the shipped default. Apply its class before
// React mounts so a lazy route can never paint the legacy five-label action
// bar for one frame while LiveOpsController is still mounting. LiveOps keeps
// ownership afterwards and may deliberately remove it for a control override.
document.body.classList.add('experiment-game-chrome-refined')

// Visual QA freeze mode is route-driven and lets Playwright load a stable
// screenshot-friendly version of the app without waiting on animations.
applyVisualFreezeState()

// Bind one-shot ceremony cues to the visual animations they describe before
// React mounts any phase overlays.
installAudioVisualSync()

// Native pinch zoom remains available; the preference only expands its range.
const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
if (viewportMeta) {
  viewportMeta.content = buildViewportMetaContent(
    store.getState().settings.visual?.enableZoom ?? false
  )
}
// Initialize the Social Engine with the Redux store so it can dispatch actions
// and read state throughout the session.
SocialEngine.init(store)

// Register the window.onAdRewardGranted callback so native Android/iOS wrappers
// can complete rewarded ad flows.
initAdBridge()

// Browser journeys may observe a detached state snapshot in development, but
// never receive the mutable Redux store or dispatch. The explicit flag is set
// by the shared Playwright fixture before any application code runs.
if (import.meta.env.DEV) {
  installE2EStateProbe(window, store.getState, true)
}

// Expose legacy-safe helpers for intro hub chip interactions.
// These are called from js/ui/introHub.js and are safe to attach before the
// SoundManager is fully initialised (calls are no-ops until init resolves).
declare global {
  interface Window {
    _introhubMusicOn?: boolean
    _introhubSfxOn?: boolean
    toggleIntroHubMusic?: () => void
    toggleIntroHubSfx?: () => void
  }
}
const MUSIC_STORAGE_KEY = 'introhub_music_on'
const SFX_STORAGE_KEY = 'introhub_sfx_on'

const initAudio = store.getState().settings.audio

// Initialise audio runtime state from canonical Redux settings so that stale
// intro-hub localStorage flags can never silently mute the game on startup.
syncRuntimeAudioSettings(initAudio)

window.toggleIntroHubSfx = function () {
  const nextSfxOn = !store.getState().settings.audio.sfxOn
  try {
    localStorage.setItem(SFX_STORAGE_KEY, String(nextSfxOn))
  } catch (err) {
    console.warn('[introHub] Failed to persist SFX toggle state:', err)
  }
  console.debug('[introHub] toggleIntroHubSfx ->', nextSfxOn)
  // Dispatch to Redux so the store subscriber syncs all SFX categories and
  // persists the new value — Redux is the canonical source of truth.
  store.dispatch(setAudio({ sfxOn: nextSfxOn }))
}

window.toggleIntroHubMusic = function () {
  const nextMusicOn = !store.getState().settings.audio.musicOn
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, String(nextMusicOn))
  } catch (err) {
    console.warn('[introHub] Failed to persist music toggle state:', err)
  }
  console.debug('[introHub] toggleIntroHubMusic ->', nextMusicOn)
  store.dispatch(setAudio({ musicOn: nextMusicOn }))
}

const rootElement = document.getElementById('root')!
rootElement.dataset.buildId = BUILD_ID

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
