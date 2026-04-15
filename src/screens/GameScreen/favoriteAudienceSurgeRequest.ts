import { recordAdShown } from '../../store/adsSlice';
import type { AppDispatch, RootState } from '../../store/store';
import { clearRewardHandler, showRewarded } from '../../services/ads/adsService';

const AUDIENCE_SURGE_REWARD_TIMEOUT_MS = 15000;

interface RequestFavoriteAudienceSurgeArgs {
  playerId: string;
  adPending: boolean;
  dispatch: AppDispatch;
  getState: () => RootState;
  isMounted: () => boolean;
  setAdPending: (pending: boolean) => void;
  timeoutMs?: number;
  showRewardedFn?: typeof showRewarded;
  clearRewardHandlerFn?: typeof clearRewardHandler;
}

export function requestFavoriteAudienceSurge({
  playerId,
  adPending,
  dispatch,
  getState,
  isMounted,
  setAdPending,
  timeoutMs = AUDIENCE_SURGE_REWARD_TIMEOUT_MS,
  showRewardedFn = showRewarded,
  clearRewardHandlerFn = clearRewardHandler,
}: RequestFavoriteAudienceSurgeArgs): Promise<boolean> {
  if (!playerId || adPending) return Promise.resolve(false);

  setAdPending(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = (granted: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (isMounted()) {
        setAdPending(false);
      }
      resolve(granted);
    };

    const state = getState();
    if (!window.GameAds?.showRewarded) {
      dispatch(recordAdShown('favorite_player_audience_surge'));
      finish(true);
      return;
    }

    const requested = showRewardedFn(
      'favorite_player_audience_surge',
      state,
      dispatch,
      () => finish(true),
    );

    if (!requested) {
      finish(false);
      return;
    }

    if (!settled) {
      timeoutId = setTimeout(() => {
        clearRewardHandlerFn('favorite_player_audience_surge');
        finish(false);
      }, timeoutMs);
    }
  });
}
