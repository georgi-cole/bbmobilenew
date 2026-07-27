import { useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { SoundManager } from './SoundManager';
import { resolveDesiredMusic } from './resolveDesiredMusic';
import type { MusicTrack } from './musicTracks';
import {
  getMinigameMusicConfig,
  getMinigameMusicConfigByTrack,
  MINIGAME_MUSIC_CONFIGS,
} from './minigameMusicConfig';
import { observeHostedMinigamePlaying } from './minigameHostPhaseObserver';

const VOLUME_RAMP_STEP_MS = 50;

export default function AudioStateSync() {
  const musicState = useSelector(
    (root: RootState) => ({
      gamePhase: root.game.phase,
      gameId: root.game.gameId,
      spectatorActive: root.game.spectatorActive,
      seasonFinalePhase: root.game.seasonFinale?.phase ?? null,
      pendingChallengePhase: root.challenge.pending?.phase ?? null,
      pendingChallengeGameKey: root.challenge.pending?.game?.key ?? null,
      socialPanelOpen: root.social.panelOpen,
      incomingInboxOpen: root.social.incomingInboxOpen,
      musicScene: root.ui.musicScene,
      musicOn: root.settings.audio.musicOn,
      musicVolume: root.settings.audio.musicVolume,
    }),
    shallowEqual,
  );
  const [hash, setHash] = useState(() => window.location.hash);
  const [hostedMinigamePlaying, setHostedMinigamePlaying] = useState(false);
  const previousDesiredRef = useRef<MusicTrack>('none');
  const latestDesiredRef = useRef<MusicTrack>('none');
  const fadeInTimerRef = useRef<number | null>(null);
  const postGameTimerRef = useRef<number | null>(null);
  const transitionTokenRef = useRef(0);

  useEffect(() => {
    for (const config of MINIGAME_MUSIC_CONFIGS) {
      SoundManager.registerDynamic(config.sound);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const configuredGame = getMinigameMusicConfig(musicState.pendingChallengeGameKey);
    if (!configuredGame) {
      setHostedMinigamePlaying(false);
      return undefined;
    }

    return observeHostedMinigamePlaying(setHostedMinigamePlaying);
  }, [musicState.pendingChallengeGameKey]);

  const resolvedMusic = useMemo(
    () => {
      if (!musicState.musicOn) return 'none';

      return resolveDesiredMusic(
        {
          game: {
            phase: musicState.gamePhase,
            gameId: musicState.gameId,
            spectatorActive: musicState.spectatorActive,
            seasonFinale:
              musicState.seasonFinalePhase != null
                ? { phase: musicState.seasonFinalePhase }
                : null,
          },
          challenge: {
            pending:
              musicState.pendingChallengePhase !== null
                ? {
                    phase: musicState.pendingChallengePhase,
                    game: { key: musicState.pendingChallengeGameKey },
                  }
                : null,
          },
          social: {
            panelOpen: musicState.socialPanelOpen,
            incomingInboxOpen: musicState.incomingInboxOpen,
          },
          ui: {
            musicScene: musicState.musicScene,
          },
        },
        hash,
      );
    },
    [hash, musicState],
  );

  const desiredMusic = useMemo<MusicTrack>(() => {
    if (musicState.musicOn && hostedMinigamePlaying) {
      const configuredTrack = getMinigameMusicConfig(
        musicState.pendingChallengeGameKey,
      )?.track;
      if (configuredTrack) return configuredTrack;
    }

    // For configured challenges, resolvedMusic is deliberately `none` before
    // gameplay. This prevents the generic competition track from sharing the
    // channel with, or bleeding into, the configured minigame track.
    return resolvedMusic;
  }, [
    hostedMinigamePlaying,
    musicState.musicOn,
    musicState.pendingChallengeGameKey,
    resolvedMusic,
  ]);

  useEffect(() => {
    latestDesiredRef.current = desiredMusic;
    const previousDesired = previousDesiredRef.current;
    previousDesiredRef.current = desiredMusic;
    const enteringConfig = getMinigameMusicConfigByTrack(desiredMusic);
    const leavingConfig = getMinigameMusicConfigByTrack(previousDesired);
    const transitionToken = ++transitionTokenRef.current;

    const clearFadeIn = () => {
      if (fadeInTimerRef.current != null) {
        window.clearInterval(fadeInTimerRef.current);
        fadeInTimerRef.current = null;
      }
    };
    const clearPostGameTimer = () => {
      if (postGameTimerRef.current != null) {
        window.clearTimeout(postGameTimerRef.current);
        postGameTimerRef.current = null;
      }
    };

    clearFadeIn();

    if (!musicState.musicOn) {
      clearPostGameTimer();
      SoundManager.setMusicVolume(musicState.musicVolume);
      void SoundManager.setDesiredMusic('none', `resolver:${hash || '#/'}`);
      return;
    }

    if (enteringConfig) {
      clearPostGameTimer();

      if (previousDesired === desiredMusic) {
        SoundManager.setMusicVolume(musicState.musicVolume);
        return;
      }

      SoundManager.setMusicVolume(0);
      void SoundManager.setDesiredMusic(desiredMusic, `minigame-config:start:${desiredMusic}`).then(() => {
        if (transitionTokenRef.current !== transitionToken) return;
        const steps = Math.max(1, Math.ceil(enteringConfig.fadeInMs / VOLUME_RAMP_STEP_MS));
        let step = 0;
        fadeInTimerRef.current = window.setInterval(() => {
          step += 1;
          SoundManager.setMusicVolume(musicState.musicVolume * Math.min(1, step / steps));
          if (step >= steps) clearFadeIn();
        }, VOLUME_RAMP_STEP_MS);
      });
      return;
    }

    if (leavingConfig) {
      clearPostGameTimer();
      postGameTimerRef.current = window.setTimeout(() => {
        postGameTimerRef.current = null;
        void SoundManager.fadeOutMusic(leavingConfig.fadeOutMs).then(() => {
          SoundManager.setMusicVolume(musicState.musicVolume);
          if (transitionTokenRef.current !== transitionToken) return;
          const nextTrack = latestDesiredRef.current;
          if (getMinigameMusicConfigByTrack(nextTrack)) return;
          void SoundManager.setDesiredMusic(nextTrack, `minigame-config:complete:${previousDesired}`);
        });
      }, leavingConfig.postGameHoldMs);
      return;
    }

    clearPostGameTimer();
    SoundManager.setMusicVolume(musicState.musicVolume);
    void SoundManager.setDesiredMusic(desiredMusic, `resolver:${hash || '#/'}`);
  }, [desiredMusic, hash, musicState.musicOn, musicState.musicVolume]);

  useEffect(
    () => () => {
      transitionTokenRef.current += 1;
      if (fadeInTimerRef.current != null) window.clearInterval(fadeInTimerRef.current);
      if (postGameTimerRef.current != null) window.clearTimeout(postGameTimerRef.current);
    },
    [],
  );

  return null;
}
