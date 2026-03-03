import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/_ios-standalone-fixes.css'
import './styles/_introhub-buttons.css'
import './compat/legacySpectatorAdapter.js'
import { applyDisplayModeClasses } from './utils/displayMode'
import { store } from './store/store'
import { SocialEngine } from './social/SocialEngine'
import { SoundManager } from './services/sound/SoundManager'
import App from './App.tsx'

// Apply html class flags (is-standalone, is-webkit, is-chrome-android) as
// early as possible so CSS selectors in _ios-standalone-fixes.css and
// _introhub-buttons.css are active before the first paint.
applyDisplayModeClasses()

// Apply initial viewport zoom setting: when enableZoom is false (default),
// prevent pinch-to-zoom for a fixed-layout feel.
const initEnableZoom = store.getState().settings.visual?.enableZoom ?? false;
const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
if (viewportMeta) {
  viewportMeta.content = initEnableZoom
    ? 'width=device-width, initial-scale=1.0'
    : 'width=device-width, initial-scale=1.0, user-scalable=no';
}

// Initialize the Social Engine with the Redux store so it can dispatch actions
// and read state throughout the session.
SocialEngine.init(store)

// Expose legacy-safe helpers for intro hub chip interactions.
// These are called from js/ui/introHub.js and are safe to attach before the
// SoundManager is fully initialised (calls are no-ops until init resolves).
declare global {
  interface Window {
    _introhubMusicOn?: boolean;
    _introhubSfxOn?: boolean;
    toggleIntroHubMusic?: () => void;
    toggleIntroHubSfx?: () => void;
  }
}
window._introhubMusicOn = false;
window._introhubSfxOn = true;
window.toggleIntroHubMusic = function () {
  window._introhubMusicOn = !window._introhubMusicOn;
  if (window._introhubMusicOn) {
    void SoundManager.playMusic('music:intro_hub_loop');
  } else {
    SoundManager.stopMusic();
  }
};
window.toggleIntroHubSfx = function () {
  window._introhubSfxOn = !window._introhubSfxOn;
  // Toggle non-music sound categories (ui acts as the sfx proxy)
  SoundManager.setCategoryEnabled('ui', !!window._introhubSfxOn);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
