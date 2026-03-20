import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/_ios-standalone-fixes.css'
import './styles/_introhub-buttons.css'
import './compat/legacySpectatorAdapter.js'
import { applyDisplayModeClasses } from './utils/displayMode'
import { store } from './store/store'
import { setAudio } from './store/settingsSlice'
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

// Expose the Redux store globally for debugging and e2e tooling.
declare global {
  interface Window { __store: typeof store }
}
window.__store = store

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
const MUSIC_STORAGE_KEY = 'introhub_music_on';
const SFX_STORAGE_KEY   = 'introhub_sfx_on';

const initAudio = store.getState().settings.audio;

// Initialise window globals for legacy intro-hub JS compatibility, using the
// canonical Redux settings as the source of truth (not stale localStorage flags).
window._introhubMusicOn = initAudio.musicOn;
window._introhubSfxOn   = initAudio.sfxOn;

// Initialise SoundManager category states from canonical Redux settings so
// that a stale intro-hub localStorage flag can never silently mute the game.
SoundManager.setCategoryEnabled('music', initAudio.musicOn);
SoundManager.setCategoryVolume('music', initAudio.musicVolume);
(['ui', 'tv', 'player', 'minigame'] as const).forEach(cat => {
  SoundManager.setCategoryEnabled(cat, initAudio.sfxOn);
  SoundManager.setCategoryVolume(cat, initAudio.sfxVolume);
});

window.toggleIntroHubMusic = function () {
  window._introhubMusicOn = !window._introhubMusicOn;
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, String(window._introhubMusicOn));
  } catch (err) {
    console.warn('[introHub] Failed to persist music toggle state:', err);
  }
  console.debug('[introHub] toggleIntroHubMusic ->', window._introhubMusicOn);
  // Keep Redux settings in sync so mute state is preserved correctly.
  store.dispatch(setAudio({ musicOn: !!window._introhubMusicOn }));
  if (window._introhubMusicOn) {
    void SoundManager.playMusic('music:intro_hub_loop');
  } else {
    SoundManager.stopMusic();
  }
};
window.toggleIntroHubSfx = function () {
  window._introhubSfxOn = !window._introhubSfxOn;
  try {
    localStorage.setItem(SFX_STORAGE_KEY, String(window._introhubSfxOn));
  } catch (err) {
    console.warn('[introHub] Failed to persist SFX toggle state:', err);
  }
  console.debug('[introHub] toggleIntroHubSfx ->', window._introhubSfxOn);
  // Dispatch to Redux so the store subscriber syncs all SFX categories and
  // persists the new value — Redux is the canonical source of truth.
  store.dispatch(setAudio({ sfxOn: !!window._introhubSfxOn }));
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
