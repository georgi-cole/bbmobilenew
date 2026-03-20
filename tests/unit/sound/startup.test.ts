/**
 * Tests for audio startup defaults and SoundManager ↔ Redux settings sync.
 *
 * Covers:
 *  1. SoundManager categories default to enabled (DEFAULT_SETTINGS.audio)
 *  2. Redux settings.audio.sfxOn=false disables all SFX categories
 *  3. Redux settings.audio.musicOn=false disables the music category
 *  4. SoundManager volumes are synced from settings.audio volume fields
 *  5. Dispatching setAudio re-syncs SoundManager via the store subscriber
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import settingsReducer, {
  DEFAULT_SETTINGS,
  setAudio,
  STORAGE_KEY,
  type SettingsState,
} from '../../../src/store/settingsSlice';
import { SoundManager } from '../../../src/services/sound/SoundManager';
import {
  SFX_SOUND_CATEGORIES,
  syncRuntimeAudioSettings,
} from '../../../src/services/sound/audioSettingsSync';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStore(audioOverrides?: Partial<SettingsState['audio']>) {
  const settings: SettingsState = audioOverrides
    ? { ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, ...audioOverrides } }
    : DEFAULT_SETTINGS;
  const s = configureStore({
    reducer: { settings: settingsReducer },
    preloadedState: { settings },
  });
  // Mirror the store.ts subscribe logic: sync SoundManager when audio settings change.
  let prevSettings = s.getState().settings;
  s.subscribe(() => {
    const current = s.getState();
    if (current.settings !== prevSettings) {
      prevSettings = current.settings;
      syncRuntimeAudioSettings(current.settings.audio);
    }
  });
  // Apply initial state through the same helper used by main.tsx startup init.
  syncRuntimeAudioSettings(s.getState().settings.audio);
  return s;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('introhub_sfx_on');
  localStorage.removeItem('introhub_music_on');
  syncRuntimeAudioSettings(DEFAULT_SETTINGS.audio);
  vi.spyOn(SoundManager, 'play').mockResolvedValue();
  vi.spyOn(SoundManager, 'playMusic').mockResolvedValue();
  vi.spyOn(SoundManager, 'stopMusic').mockImplementation(() => {});
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('introhub_sfx_on');
  localStorage.removeItem('introhub_music_on');
  vi.restoreAllMocks();
});

// ── 1. Default settings enable all categories ─────────────────────────────────

describe('SoundManager startup defaults', () => {
  it('initializes with DEFAULT_SETTINGS.audio.musicOn=true → music category enabled', () => {
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');
    makeStore(); // DEFAULT_SETTINGS: musicOn=true
    expect(setCategoryEnabled).toHaveBeenCalledWith('music', true);
    expect(window._introhubMusicOn).toBe(true);
  });

  it('initializes with DEFAULT_SETTINGS.audio.sfxOn=true → all SFX categories enabled', () => {
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');
    makeStore(); // DEFAULT_SETTINGS: sfxOn=true
    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryEnabled).toHaveBeenCalledWith(cat, true);
    }
    expect(window._introhubSfxOn).toBe(true);
  });
});

// ── 2. sfxOn=false disables SFX categories ────────────────────────────────────

describe('SoundManager startup with sfxOn=false', () => {
  it('disables all SFX categories when sfxOn is false in settings', () => {
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');
    makeStore({ sfxOn: false });
    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryEnabled).toHaveBeenCalledWith(cat, false);
    }
    expect(window._introhubSfxOn).toBe(false);
  });

  it('does NOT disable music category when only sfxOn is false', () => {
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');
    makeStore({ sfxOn: false, musicOn: true });
    expect(setCategoryEnabled).toHaveBeenCalledWith('music', true);
  });
});

// ── 3. musicOn=false disables music category ──────────────────────────────────

describe('SoundManager startup with musicOn=false', () => {
  it('disables music category when musicOn is false in settings', () => {
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');
    makeStore({ musicOn: false });
    expect(setCategoryEnabled).toHaveBeenCalledWith('music', false);
  });

  it('does NOT disable SFX categories when only musicOn is false', () => {
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');
    makeStore({ musicOn: false, sfxOn: true });
    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryEnabled).toHaveBeenCalledWith(cat, true);
    }
  });
});

// ── 4. Volume is synced from settings ────────────────────────────────────────

describe('SoundManager volume sync from settings', () => {
  it('sets music category volume from settings.audio.musicVolume', () => {
    const setCategoryVolume = vi.spyOn(SoundManager, 'setCategoryVolume');
    makeStore({ musicVolume: 0.5 });
    expect(setCategoryVolume).toHaveBeenCalledWith('music', 0.5);
  });

  it('sets SFX category volumes from settings.audio.sfxVolume', () => {
    const setCategoryVolume = vi.spyOn(SoundManager, 'setCategoryVolume');
    makeStore({ sfxVolume: 0.6 });
    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryVolume).toHaveBeenCalledWith(cat, 0.6);
    }
  });
});

// ── 5. setAudio dispatch re-syncs SoundManager ───────────────────────────────

describe('setAudio dispatch re-syncs SoundManager', () => {
  it('disabling sfxOn via setAudio disables all SFX categories', () => {
    const store = makeStore({ sfxOn: true });
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');

    store.dispatch(setAudio({ sfxOn: false }));

    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryEnabled).toHaveBeenCalledWith(cat, false);
    }
    expect(window._introhubSfxOn).toBe(false);
  });

  it('enabling sfxOn via setAudio enables all SFX categories', () => {
    const store = makeStore({ sfxOn: false });
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');

    store.dispatch(setAudio({ sfxOn: true }));

    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryEnabled).toHaveBeenCalledWith(cat, true);
    }
    expect(window._introhubSfxOn).toBe(true);
  });

  it('disabling musicOn via setAudio disables music category', () => {
    const store = makeStore({ musicOn: true });
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');

    store.dispatch(setAudio({ musicOn: false }));

    expect(setCategoryEnabled).toHaveBeenCalledWith('music', false);
    expect(window._introhubMusicOn).toBe(false);
  });

  it('updating sfxVolume via setAudio updates SFX category volumes', () => {
    const store = makeStore({ sfxVolume: 0.8 });
    const setCategoryVolume = vi.spyOn(SoundManager, 'setCategoryVolume');

    store.dispatch(setAudio({ sfxVolume: 0.3 }));

    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryVolume).toHaveBeenCalledWith(cat, 0.3);
    }
  });

  it('stale introhub_sfx_on=false in localStorage does NOT disable SFX when Redux sfxOn=true', () => {
    // Simulate a stale intro-hub localStorage flag
    localStorage.setItem('introhub_sfx_on', 'false');

    // App starts — settings loaded from bbmobilenew_settings_v1 (which defaults sfxOn=true)
    const setCategoryEnabled = vi.spyOn(SoundManager, 'setCategoryEnabled');
    makeStore({ sfxOn: true }); // canonical Redux settings say sfxOn=true

    // All SFX categories should be enabled regardless of the stale flag
    for (const cat of SFX_SOUND_CATEGORIES) {
      expect(setCategoryEnabled).toHaveBeenCalledWith(cat, true);
    }
    // music category should not be disabled by this path
    expect(setCategoryEnabled).not.toHaveBeenCalledWith('music', false);
    expect(window._introhubSfxOn).toBe(true);
  });
});
