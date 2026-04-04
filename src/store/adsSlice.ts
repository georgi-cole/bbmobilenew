/**
 * adsSlice — Redux state for ad-gate logic.
 *
 * Persisted to localStorage so daily limits and No Ads Pack ownership survive
 * page reloads.  Uses the same simple load/save pattern as settingsSlice.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

const STORAGE_KEY = 'bbmobilenew_ads_v1';

export interface AdsState {
  /** True when the user has purchased the No Ads Pack in-game store. */
  hasNoAdsPack: boolean;
  /**
   * Map of placement → ISO date-string (YYYY-MM-DD) of the last time that
   * placement was shown.  Used to enforce once-per-day limits.
   */
  dailyUsage: Record<string, string>;
  /**
   * Tracks the last competition where the user finished in last place.
   * Set by the adsMiddleware so GameScreen can show a competition_retry prompt.
   * Cleared once the prompt is shown or the phase changes past loh_results / pos_results.
   */
  lastCompLastPlaceType: 'loh' | 'pos' | null;
}

const DEFAULT_ADS_STATE: AdsState = {
  hasNoAdsPack: false,
  dailyUsage: {},
  lastCompLastPlaceType: null,
};

// ── Persistence helpers ───────────────────────────────────────────────────

export function loadAdsState(): AdsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ADS_STATE;
    const parsed = JSON.parse(raw) as Partial<AdsState>;
    return {
      hasNoAdsPack: typeof parsed.hasNoAdsPack === 'boolean' ? parsed.hasNoAdsPack : false,
      dailyUsage:
        parsed.dailyUsage && typeof parsed.dailyUsage === 'object' ? parsed.dailyUsage : {},
      // lastCompLastPlaceType is transient — never persist across page reloads.
      lastCompLastPlaceType: null,
    };
  } catch {
    return DEFAULT_ADS_STATE;
  }
}

export function saveAdsState(state: AdsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore (e.g. private browsing quota)
  }
}

// ── Slice ─────────────────────────────────────────────────────────────────

const adsSlice = createSlice({
  name: 'ads',
  initialState: DEFAULT_ADS_STATE as AdsState,
  reducers: {
    /**
     * Grant or revoke the No Ads Pack for the user.
     * Automatic interstitials will be suppressed while this is true.
     * Optional rewarded ads remain available regardless.
     */
    setNoAdsPack(state, action: PayloadAction<boolean>) {
      state.hasNoAdsPack = action.payload;
    },

    /**
     * Record that a placement was shown today.
     * Stores today's ISO date string (YYYY-MM-DD) for the given placement key.
     */
    recordAdShown(state, action: PayloadAction<string>) {
      const today = new Date().toISOString().slice(0, 10);
      state.dailyUsage[action.payload] = today;
    },

    /**
     * Clear all daily usage records (e.g. at day boundary or for testing).
     */
    resetDailyUsage(state) {
      state.dailyUsage = {};
    },

    /**
     * Record that the user finished last in a competition (LOH or POS).
     * Used by the adsMiddleware to trigger the competition_retry prompt.
     */
    recordLastCompLastPlace(state, action: PayloadAction<'loh' | 'pos'>) {
      state.lastCompLastPlaceType = action.payload;
    },

    /**
     * Clear the last competition last-place record (after the prompt is shown
     * or the phase moves on).
     */
    clearLastCompLastPlace(state) {
      state.lastCompLastPlaceType = null;
    },
  },
});

export const { setNoAdsPack, recordAdShown, resetDailyUsage, recordLastCompLastPlace, clearLastCompLastPlace } = adsSlice.actions;

export const selectAdsState = (state: RootState) => state.ads;
export const selectHasNoAdsPack = (state: RootState) => state.ads?.hasNoAdsPack ?? false;

export default adsSlice.reducer;
