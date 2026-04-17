import { useEffect, useMemo, useState } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { SoundManager } from './SoundManager';
import { resolveDesiredMusic } from './resolveDesiredMusic';

export default function AudioStateSync() {
  const musicState = useSelector(
    (root: RootState) => ({
      gamePhase: root.game.phase,
      spectatorActive: root.game.spectatorActive,
      pendingChallengePhase: root.challenge.pending?.phase ?? null,
      pendingChallengeGameKey: root.challenge.pending?.game?.key ?? null,
      socialPanelOpen: root.social.panelOpen,
      incomingInboxOpen: root.social.incomingInboxOpen,
      musicScene: root.ui.musicScene,
    }),
    shallowEqual,
  );
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const desiredMusic = useMemo(
    () =>
      resolveDesiredMusic(
        {
          game: {
            phase: musicState.gamePhase,
            spectatorActive: musicState.spectatorActive,
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
      ),
    [hash, musicState],
  );

  useEffect(() => {
    void SoundManager.setDesiredMusic(desiredMusic, `resolver:${hash || '#/'}`);
  }, [desiredMusic, hash]);

  return null;
}
