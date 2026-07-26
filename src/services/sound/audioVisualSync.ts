import { SoundManager } from './SoundManager';
import { preloadPublicVotingAudioDuration } from './publicVotingAudioTiming';

const LIVE_VOTE_TALLY_SELECTOR = '.avrm__tallies--tv';
const TRIBUNAL_VERDICT_SELECTOR = '.fo-overlay--verdict';

let installed = false;

/**
 * Binds one-shot cues to the visual surfaces they describe instead of broad
 * Redux phase transitions. This prevents ceremony announcements, rules cards,
 * and tribunal vote reveals from inheriting unrelated winner/countdown sounds.
 */
export function installAudioVisualSync(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  preloadPublicVotingAudioDuration();

  const originalPlay = SoundManager.play.bind(SoundManager);
  SoundManager.play = async (key, options) => {
    // The hosted countdown owns its dedicated timer. A phase-level start cue
    // would also fire while the rules modal is still visible.
    if (key === 'minigame:start') return;

    // Safety ceremony uses its background score only. The legacy semantic key
    // currently points at the winner-reveal asset and must never be layered in.
    if (key === 'tv:veto_ceremony') return;

    // Live-elimination audio is legal only while the actual faux-TV tally board
    // is mounted. Calls made on phase entry or during its pre-tally beat are
    // deliberately rejected.
    if (key === 'tv:voting_eviction' && !document.querySelector(LIVE_VOTE_TALLY_SELECTOR)) {
      return;
    }

    // `tv:event` is a generic legacy cue backed by the winner-reveal file. The
    // tribunal verdict already has the correct jury music and per-vote sounds.
    if (key === 'tv:event' && document.querySelector(TRIBUNAL_VERDICT_SELECTOR)) {
      return;
    }

    return originalPlay(key, options);
  };

  let tallyVisible = false;
  const syncLiveVoteTallyCue = () => {
    const nextVisible = document.querySelector(LIVE_VOTE_TALLY_SELECTOR) !== null;
    if (nextVisible === tallyVisible) return;

    tallyVisible = nextVisible;
    if (nextVisible) {
      void SoundManager.play('tv:voting_eviction');
    } else {
      SoundManager.stop('tv:voting_eviction');
    }
  };

  const observer = new MutationObserver(syncLiveVoteTallyCue);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  queueMicrotask(syncLiveVoteTallyCue);
}
