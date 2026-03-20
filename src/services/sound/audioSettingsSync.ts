import type { SettingsState } from '../../store/settingsSlice';
import { SoundManager } from './SoundManager';
import type { SoundCategory } from './sounds';

type AudioSettings = SettingsState['audio'];

type IntroHubAudioWindow = Window & {
  _introhubMusicOn?: boolean;
  _introhubSfxOn?: boolean;
};

export const SFX_SOUND_CATEGORIES = ['ui', 'tv', 'player', 'minigame'] as const satisfies readonly SoundCategory[];

export function syncIntroHubAudioGlobals(audio: AudioSettings): void {
  if (typeof window === 'undefined') return;

  const introHubWindow = window as IntroHubAudioWindow;
  introHubWindow._introhubMusicOn = audio.musicOn;
  introHubWindow._introhubSfxOn = audio.sfxOn;
}

export function syncSoundManagerAudioSettings(audio: AudioSettings): void {
  SoundManager.setCategoryEnabled('music', audio.musicOn);
  SoundManager.setCategoryVolume('music', audio.musicVolume);
  SFX_SOUND_CATEGORIES.forEach((category) => {
    SoundManager.setCategoryEnabled(category, audio.sfxOn);
    SoundManager.setCategoryVolume(category, audio.sfxVolume);
  });
}

export function syncRuntimeAudioSettings(audio: AudioSettings): void {
  syncIntroHubAudioGlobals(audio);
  syncSoundManagerAudioSettings(audio);
}
