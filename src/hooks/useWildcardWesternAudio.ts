/**
 * useWildcardWesternAudio — manages all audio for the Wildcard Western minigame.
 *
 * Background music starts when `shouldPlayMusic` becomes true and stops (via
 * releaseBgm) when it becomes false or the component unmounts.  The previous
 * BGM owner (typically 'phase') retains its desired track and can be re-requested
 * by the relevant hook/middleware when appropriate.
 *
 * Uses requestBgm/releaseBgm with the 'minigame' owner so the SoundManager can
 * enforce the single-BGM-channel invariant.
 *
 * One-shot SFX callbacks are returned for the caller to invoke at the correct
 * game moments.
 *
 * Usage:
 *   const { playSelect, playDraw, playEliminated, playWinner, playContinue, playNewRound } =
 *     useWildcardWesternAudio(ww.phase !== 'idle');
 */

import { useCallback, useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

const WW_MUSIC_KEY = 'music:wildcard_western_main';
const WW_SELECT_KEY = 'ui:wildcard_select';
const WW_DRAW_KEY = 'ui:wildcard_draw';
const WW_ELIMINATED_KEY = 'player:wildcard_eliminated';
const WW_WINNER_KEY = 'minigame:wildcard_winner';
const WW_CONTINUE_KEY = 'ui:wildcard_continue';
const WW_NEW_ROUND_KEY = 'ui:western_new_round';

export interface UseWildcardWesternAudioReturn {
  /** Play the tap/select sound (answer tap, duel select, houseguest select). */
  playSelect: () => void;
  /** Play the DRAW button sound. */
  playDraw: () => void;
  /** Play the player-eliminated stinger. */
  playEliminated: () => void;
  /** Play the winner reveal sound. */
  playWinner: () => void;
  /** Play the continue-button sound. */
  playContinue: () => void;
  /** Play the new-round transition cue. */
  playNewRound: () => void;
}

/**
 * @param shouldPlayMusic - true while the Wildcard Western minigame is active.
 *   Background music starts on the first true value and stops when it reverts
 *   to false or the component unmounts.
 */
export function useWildcardWesternAudio(shouldPlayMusic: boolean): UseWildcardWesternAudioReturn {
  // Request/release BGM ownership when the minigame becomes active or inactive.
  useEffect(() => {
    if (!shouldPlayMusic) return;
    SoundManager.requestBgm(WW_MUSIC_KEY, 'minigame');
    return () => {
      SoundManager.releaseBgm('minigame');
    };
  }, [shouldPlayMusic]);

  const playSelect = useCallback(() => {
    void SoundManager.play(WW_SELECT_KEY);
  }, []);

  const playDraw = useCallback(() => {
    void SoundManager.play(WW_DRAW_KEY);
  }, []);

  const playEliminated = useCallback(() => {
    void SoundManager.play(WW_ELIMINATED_KEY);
  }, []);

  const playWinner = useCallback(() => {
    void SoundManager.play(WW_WINNER_KEY);
  }, []);

  const playContinue = useCallback(() => {
    void SoundManager.play(WW_CONTINUE_KEY);
  }, []);

  const playNewRound = useCallback(() => {
    void SoundManager.play(WW_NEW_ROUND_KEY);
  }, []);

  return { playSelect, playDraw, playEliminated, playWinner, playContinue, playNewRound };
}
