import type { Middleware } from '@reduxjs/toolkit';
import { replaceDramaNetwork } from '../social/socialSlice';
import { normalizeDramaSocialNetwork } from '../social/dramaModeEngine';
import type { DramaSocialNetwork } from '../social/types';

interface StateWithDramaPublicSave {
  game?: { week?: number };
  social?: { dramaNetwork?: DramaSocialNetwork };
}

export function pruneExpiredPublicSaveThreatBeliefs(
  network: DramaSocialNetwork,
  currentWeek: number,
): DramaSocialNetwork {
  const normalized = normalizeDramaSocialNetwork(network);
  const beliefs = normalized.beliefs.filter(
    (belief) =>
      !(
        belief.kind === 'strategic_threat' &&
        belief.sourceId.startsWith('public-save-') &&
        belief.createdWeek < currentWeek
      ),
  );

  if (beliefs.length === normalized.beliefs.length) return normalized;
  return { ...normalized, beliefs };
}

/**
 * Public Save threat perception lasts for the remainder of the current day.
 * The middleware also cleans stale beliefs after save hydration, so disabling
 * Public Mode or resuming a later day cannot leave premium modifiers behind.
 */
export const dramaPublicSaveMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action);
  if (
    typeof action === 'object' &&
    action !== null &&
    'type' in action &&
    action.type === 'social/replaceDramaNetwork'
  ) {
    return result;
  }

  const state = api.getState() as StateWithDramaPublicSave;
  const network = state.social?.dramaNetwork;
  const currentWeek = state.game?.week ?? 1;
  if (!network) return result;

  const pruned = pruneExpiredPublicSaveThreatBeliefs(network, currentWeek);
  if (pruned.beliefs.length !== network.beliefs.length) {
    api.dispatch(replaceDramaNetwork(pruned));
  }

  return result;
};
