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
import { syncRuntimeAudioSettings } from './services/sound/audioSettingsSync'
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

// Initialise audio runtime state from canonical Redux settings so that stale
// intro-hub localStorage flags can never silently mute the game on startup.
syncRuntimeAudioSettings(initAudio);

window.toggleIntroHubMusic = function () {
  const nextMusicOn = !store.getState().settings.audio.musicOn;
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, String(nextMusicOn));
  } catch (err) {
    console.warn('[introHub] Failed to persist music toggle state:', err);
  }
  console.debug('[introHub] toggleIntroHubMusic ->', nextMusicOn);
  // Keep Redux settings in sync so mute state is preserved correctly.
  store.dispatch(setAudio({ musicOn: nextMusicOn }));
  if (nextMusicOn) {
    void SoundManager.playMusic('music:intro_hub_loop');
  } else {
    SoundManager.stopMusic();
  }
};
window.toggleIntroHubSfx = function () {
  const nextSfxOn = !store.getState().settings.audio.sfxOn;
  try {
    localStorage.setItem(SFX_STORAGE_KEY, String(nextSfxOn));
  } catch (err) {
    console.warn('[introHub] Failed to persist SFX toggle state:', err);
  }
  console.debug('[introHub] toggleIntroHubSfx ->', nextSfxOn);
  // Dispatch to Redux so the store subscriber syncs all SFX categories and
  // persists the new value — Redux is the canonical source of truth.
  store.dispatch(setAudio({ sfxOn: nextSfxOn }));
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
