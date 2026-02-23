/**
 * SocialSummaryBridge — persists a social phase summary to the Diary Room.
 *
 * After SocialEngine.endPhase(), this module dispatches `game/addSocialSummary`
 * so the summary appears in the Diary Room feed (tvFeed entries with type
 * 'diary').  It deliberately does NOT call addTvEvent(), keeping the social
 * summary out of the main TV feed.
 *
 * Public API:
 *   dispatchSocialSummary(store, summary, week)
 */

import { addSocialSummary } from '../store/gameSlice';

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
}

/**
 * Dispatch `game/addSocialSummary` to persist the summary text and week
 * number into the Diary Room log.
 */
export function dispatchSocialSummary(store: StoreAPI, summary: string, week: number): void {
  store.dispatch(addSocialSummary({ summary, week }));
}

export const SocialSummaryBridge = { dispatchSocialSummary };
