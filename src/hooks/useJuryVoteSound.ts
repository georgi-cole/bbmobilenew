/**
 * useJuryVoteSound — returns a stable callback that plays the jury-phase
 * voting sound effect.
 *
 * Usage:
 *   const playJuryVote = useJuryVoteSound();
 *   // call when a jury vote is cast in the UI:
 *   playJuryVote();
 */
import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useJuryVoteSound(): () => void {
  return useCallback(() => {
    void SoundManager.play('ui:jury_vote');
  }, []);
}
